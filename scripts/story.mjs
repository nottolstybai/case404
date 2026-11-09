// История дела от нейросети. Запускается раз в день из GitHub Actions (.github/workflows/story.yml),
// можно и вручную: GROQ_API_KEY=… GEMINI_API_KEY=… node scripts/story.mjs
//
// Пишет stories/<дата>.json — { date, number, id, model, motive?, text } — для вчера, сегодня и двух дней
// вперёд, чтобы история была у игроков в любом часовом поясе. Готовый файл не трогаем, если он
// написан для этого же дела (тот же id); от другого дела (генератор дел меняли) — пишем заново.
// Мотив — подпись над историей: не прошёл проверку — сохраняем историю без него.
//
//   --date 2026-11-08   только эта дата
//   --force             переписать, даже если файл уже есть и он от этого дела
//                       (FORCE=true в окружении — то же самое; так делает ручной запуск в Actions)
//   --mock              без нейросети: заглушка, чтобы проверить весь путь
//   --out <папка>       куда писать (по умолчанию stories)
//
// Модели — строго по порядку MODEL_ORDER, каждой по одному запросу на дату, без повторов:
// ответила хорошо — берём; ошибка — следующая (и в этом запуске к ней больше не обращаемся);
// текст не прошёл проверку — следующая.
// Ключи: GROQ_API_KEY (модели с «/» в имени, например openai/gpt-oss-120b) и GEMINI_API_KEY (Gemini и Gemma).
// (GitHub Models пробовали как запасной вариант, но сервис закрыт с 30 июля 2026.)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { caseId, dailyPuzzle, isDateKey } from '../src/daily.js';
import {
  buildPrompt,
  clean,
  interactionText,
  isCurrent,
  looseAnswer,
  mockMotive,
  mockStory,
  normalMotive,
  validate,
  validateMotive,
} from './story-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const outDir = option('--out') ?? 'stories';
const mock = flag('--mock');
const force = flag('--force') || process.env.FORCE === 'true';
const geminiKey = process.env.GEMINI_API_KEY;
const groqKey = process.env.GROQ_API_KEY;

// Порядок моделей; у каждой своя бесплатная суточная квота (сброс в полночь по тихоокеанскому времени).
// Groq — бесплатный план, около 1000 запросов в день. Gemma (gemma-4-31b-it) подключена, но в очередь
// по умолчанию не входит; для проверки порядок можно задать: STORY_MODELS=gemma-4-31b-it
const DEFAULT_ORDER = ['openai/gpt-oss-120b', 'gemini-3.6-flash', 'gemini-3.8-flash'];
const MODEL_ORDER = process.env.STORY_MODELS?.trim()
  ? process.env.STORY_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
  : DEFAULT_ORDER;

function dates() {
  const one = option('--date');
  if (one) {
    if (!isDateKey(one)) throw new Error(`плохая дата: ${one}`);
    return [one];
  }
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  return [-1, 0, 1, 2].map(day);
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Запрос с таймаутом; ошибка HTTP — с понятным коротким текстом.
async function post(name, url, headers, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw fail(`${name}: нет ответа (${error.name})`, 598);
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text.slice(0, 200);
    let failed = null; // что модель успела написать, если сервис не принял её ответ (Groq: error.failed_generation)
    try {
      const data = JSON.parse(text);
      message = data.error?.message ?? data.message ?? message;
      const raw = data.error?.failed_generation;
      if (raw) failed = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch {
      // оставим как есть
    }
    const retryIn = message.match(/retry in ([\dhms]+)/)?.[1];
    const limit = message.match(/limit: (\d+)/)?.[1]; // суточный лимит модели, если Google его назвал
    message =
      message.split('\n')[0].replace(/ For more information.*$/, '') +
      (limit ? ` Лимит: ${limit} в день.` : '') +
      (retryIn ? ` Снова можно через ${retryIn}.` : '');
    const error = fail(`${name}: HTTP ${response.status} ${message}`, response.status);
    error.failed = failed;
    throw error;
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw fail(`${name}: ответ не JSON (HTTP ${response.status}): ${text.slice(0, 60).trim()}`, 599);
  }
}

// Ответ модели — JSON {"motive": "…", "story": "…"}; без истории ответ не годится, без мотива — годится.
function answerFrom(name, text) {
  try {
    const { story, motive } = JSON.parse(text);
    if (typeof story !== 'string' || !story.trim()) throw new Error('нет поля story');
    return { story, motive: typeof motive === 'string' ? motive : '' };
  } catch (error) {
    throw fail(`${name}: ответ не в формате JSON (${error.message})`, 599);
  }
}

async function askGemini(model, prompt) {
  const data = await post(
    model,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': geminiKey },
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192, // с запасом: новые модели сперва «думают»
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { motive: { type: 'STRING' }, story: { type: 'STRING' } },
          required: ['motive', 'story'],
        },
      },
    },
  );
  const candidate = data.candidates?.[0];
  // «мысли» модели (thought: true) — не история; берём только готовый текст
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  const reason = candidate?.finishReason ?? 'нет кандидатов';
  if (!text) throw fail(`${model}: пустой ответ (${reason})`, 599);
  if (reason !== 'STOP') throw fail(`${model}: ответ не закончен (${reason})`, 599);
  return answerFrom(model, text);
}

// Gemma 4 — через Interactions API: так её подключает документация Google
// (для generateContent Gemma не описана). JSON-режим для Gemma не документирован,
// поэтому JSON просим словами в промпте и разбираем ответ мягко; дальше — та же проверка.
async function askGemma(model, prompt) {
  const data = await post(
    model,
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    { 'x-goog-api-key': geminiKey },
    {
      model,
      input: prompt,
      generation_config: { max_output_tokens: 2048 },
      store: false, // по умолчанию Interactions API хранит запросы — нам это не нужно
    },
  );
  if (data.status && data.status !== 'completed') throw fail(`${model}: ответ не закончен (${data.status})`, 599);
  const text = interactionText(data);
  if (!text) throw fail(`${model}: пустой ответ`, 599);
  const answer = looseAnswer(text);
  if (!answer) throw fail(`${model}: не удалось разобрать ответ: ${text.slice(0, 60)}`, 599);
  return answer;
}

// Groq — OpenAI-совместимый API (по документации console.groq.com/docs/openai);
// строгий JSON — response_format json_schema со strict: true (поддерживается для gpt-oss-120b).
async function askGroq(model, prompt) {
  try {
    return await askGroqStrict(model, prompt);
  } catch (error) {
    // «Failed to generate JSON»: сервис отверг ответ модели, но прислал его текст. Это не повторный запрос —
    // пробуем разобрать то, что уже пришло; годится ли история, решит обычная проверка.
    if (!error.failed) throw error;
    const answer = looseAnswer(error.failed);
    const shown = error.failed.replace(/\s+/g, ' ').slice(0, 400);
    if (!answer) throw fail(`${error.message}\n    что написала модель: ${shown}`, error.status);
    console.warn(`  ${model}: сервис не принял JSON, разобрали ответ сами. Начало: ${shown.slice(0, 160)}`);
    return answer;
  }
}

async function askGroqStrict(model, prompt) {
  const data = await post(
    model,
    'https://api.groq.com/openai/v1/chat/completions',
    { authorization: `Bearer ${groqKey}` },
    {
      model,
      messages: [
        { role: 'system', content: 'Ты пишешь короткие мрачные истории о людях и их мотивах на русском языке.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'story',
          strict: true,
          schema: {
            type: 'object',
            properties: { motive: { type: 'string' }, story: { type: 'string' } },
            required: ['motive', 'story'],
            additionalProperties: false,
          },
        },
      },
    },
  );
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (!text) throw fail(`${model}: пустой ответ (${choice?.finish_reason ?? 'нет вариантов'})`, 599);
  if (choice.finish_reason && choice.finish_reason !== 'stop') throw fail(`${model}: ответ не закончен (${choice.finish_reason})`, 599);
  const answer = looseAnswer(text);
  if (!answer) throw fail(`${model}: не удалось разобрать ответ: ${text.slice(0, 60)}`, 599);
  return answer;
}

// Кто отвечает за модель: «/» в имени — Groq, gemma-… — Gemma (Interactions API), иначе Gemini.
function provider(name) {
  if (name.includes('/')) return groqKey && askGroq;
  if (name.startsWith('gemma-')) return geminiKey && askGemma;
  return geminiKey && askGemini;
}
const MODELS = MODEL_ORDER.filter((name) => provider(name)).map((name) => ({ name, ask: provider(name) }));
const broken = new Set(); // модели, ответившие ошибкой: в этом запуске к ним больше не обращаемся

// Мотив для файла: чистим и проверяем; плохой — null (история уйдёт без него, с предупреждением).
function motiveFor(date, raw, puzzle) {
  const motive = normalMotive(clean(raw ?? ''), puzzle);
  const { ok, problems } = validateMotive(motive, puzzle);
  if (ok) return motive;
  console.warn(`  ${date}: мотив не прошёл проверку — сохраняем без него (${problems.join('; ')})${motive ? `: ${motive}` : ''}`);
  return null;
}

// Каждой модели по одному запросу, по порядку; первая история, прошедшая проверку, — наша.
// null — не ответила ни одна модель (тогда запуск останавливается: остальное допишет следующий).
async function generateText(puzzle) {
  const prompt = buildPrompt(puzzle);
  let answered = false;
  for (const model of MODELS.filter((m) => !broken.has(m.name))) {
    let answer;
    try {
      answer = await model.ask(model.name, prompt);
    } catch (error) {
      broken.add(model.name);
      console.warn(`  ${error.message}`);
      continue;
    }
    answered = true;
    const text = clean(answer.story);
    const { ok, problems } = validate(text, puzzle);
    if (ok) return { text, motive: answer.motive, model: model.name };
    console.warn(`  ${model.name}: не прошла проверку — ${problems.join('; ')}`);
    console.warn(`    текст: ${text.replace(/\s+/g, ' ').slice(0, 600)}`);
  }
  if (!answered) throw new Error('ни одна модель не ответила');
  return null;
}

async function main() {
  if (!mock && !MODELS.length) {
    console.error('Нет ключей (GROQ_API_KEY, GEMINI_API_KEY). Для проверки без них: node scripts/story.mjs --mock --out <папка>');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const date of dates()) {
    const file = `${outDir}/${date}.json`;
    const puzzle = dailyPuzzle(date);
    if (existsSync(file) && !force) {
      if (isCurrent(readFileSync(file, 'utf8'), puzzle)) {
        console.log(`${date}: уже есть`);
        continue;
      }
      console.log(`${date}: история от другого дела — пишем заново`);
    }
    try {
      const result = mock ? { text: mockStory(puzzle), motive: mockMotive(puzzle), model: 'mock' } : await generateText(puzzle);
      if (!result) {
        failed++;
        console.warn(`${date}: история не прошла проверку — пропускаем`);
        continue;
      }
      const motive = motiveFor(date, result.motive, puzzle);
      const story = { date, number: puzzle.number, id: caseId(puzzle), model: result.model, ...(motive && { motive }), text: result.text };
      writeFileSync(file, `${JSON.stringify(story, null, 2)}\n`);
      console.log(`${date}: готово (${result.model}, ${result.text.split(/\s+/).length} слов; мотив: ${motive ?? 'нет'})`);
    } catch (error) {
      failed++;
      console.error(`${date}: ${error.message}`);
      console.error('Остальные даты допишет следующий запуск.');
      break;
    }
  }
  if (failed) process.exitCode = 1;
}

main();
