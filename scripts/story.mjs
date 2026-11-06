// История дела от нейросети. Запускается раз в день из GitHub Actions (.github/workflows/story.yml),
// можно и вручную: GEMINI_API_KEY=… node scripts/story.mjs
//
// Пишет stories/<дата>.json для вчера, сегодня и двух дней вперёд (кроме уже готовых),
// чтобы история была у игроков в любом часовом поясе.
//
//   --date 2026-11-08   только эта дата
//   --force             переписать, даже если файл уже есть
//                       (FORCE=true в окружении — то же самое; так делает ручной запуск в Actions)
//   --mock              без нейросети: заглушка, чтобы проверить весь путь
//   --out <папка>       куда писать (по умолчанию stories)
//
// Модели — строго по порядку MODEL_ORDER, каждой по одному запросу на дату, без повторов:
// ответила хорошо — берём; ошибка — следующая (и в этом запуске к ней больше не обращаемся);
// текст не прошёл проверку — следующая. Ключ — GEMINI_API_KEY.
// (GitHub Models пробовали как запасной вариант, но сервис закрыт с 30 июля 2026.)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { caseId, dailyPuzzle, isDateKey } from '../src/daily.js';
import { buildPrompt, clean, interactionText, looseStory, mockStory, validate } from './story-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const outDir = option('--out') ?? 'stories';
const mock = flag('--mock');
const force = flag('--force') || process.env.FORCE === 'true';
const geminiKey = process.env.GEMINI_API_KEY;

// Порядок моделей; у каждой своя бесплатная суточная квота (сброс в полночь по тихоокеанскому времени).
// Gemma — запасной вариант на том же ключе. Для проверки порядок можно задать: STORY_MODELS=gemma-4-31b-it
const DEFAULT_ORDER = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it'];
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
    try {
      const data = JSON.parse(text);
      message = data.error?.message ?? data.message ?? message;
    } catch {
      // оставим как есть
    }
    const retryIn = message.match(/retry in ([\dhms]+)/)?.[1];
    const limit = message.match(/limit: (\d+)/)?.[1]; // суточный лимит модели, если Google его назвал
    message =
      message.split('\n')[0].replace(/ For more information.*$/, '') +
      (limit ? ` Лимит: ${limit} в день.` : '') +
      (retryIn ? ` Снова можно через ${retryIn}.` : '');
    throw fail(`${name}: HTTP ${response.status} ${message}`, response.status);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw fail(`${name}: ответ не JSON (HTTP ${response.status}): ${text.slice(0, 60).trim()}`, 599);
  }
}

// Ответ модели — JSON {"story": "…"}; достаём текст.
function storyFrom(name, text) {
  try {
    const story = JSON.parse(text).story;
    if (typeof story !== 'string' || !story.trim()) throw new Error('нет поля story');
    return story;
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
        responseSchema: { type: 'OBJECT', properties: { story: { type: 'STRING' } }, required: ['story'] },
      },
    },
  );
  const candidate = data.candidates?.[0];
  // «мысли» модели (thought: true) — не история; берём только готовый текст
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  const reason = candidate?.finishReason ?? 'нет кандидатов';
  if (!text) throw fail(`${model}: пустой ответ (${reason})`, 599);
  if (reason !== 'STOP') throw fail(`${model}: ответ не закончен (${reason})`, 599);
  return storyFrom(model, text);
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
  const story = looseStory(text);
  if (!story) throw fail(`${model}: не удалось разобрать ответ: ${text.slice(0, 60)}`, 599);
  return story;
}

const MODELS = geminiKey
  ? MODEL_ORDER.map((name) => ({ name, ask: name.startsWith('gemma-') ? askGemma : askGemini }))
  : [];
const broken = new Set(); // модели, ответившие ошибкой: в этом запуске к ним больше не обращаемся

// Каждой модели по одному запросу, по порядку; первая история, прошедшая проверку, — наша.
// null — не ответила ни одна модель (тогда запуск останавливается: остальное допишет следующий).
async function generateText(puzzle) {
  const prompt = buildPrompt(puzzle);
  let answered = false;
  for (const model of MODELS.filter((m) => !broken.has(m.name))) {
    let text;
    try {
      text = clean(await model.ask(model.name, prompt));
    } catch (error) {
      broken.add(model.name);
      console.warn(`  ${error.message}`);
      continue;
    }
    answered = true;
    const { ok, problems } = validate(text, puzzle);
    if (ok) return { text, model: model.name };
    console.warn(`  ${model.name}: не прошла проверку — ${problems.join('; ')}`);
  }
  if (!answered) throw new Error('ни одна модель не ответила');
  return null;
}

async function main() {
  if (!mock && !MODELS.length) {
    console.error('Нет GEMINI_API_KEY. Для проверки без ключа: node scripts/story.mjs --mock --out <папка>');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const date of dates()) {
    const file = `${outDir}/${date}.json`;
    if (existsSync(file) && !force) {
      console.log(`${date}: уже есть`);
      continue;
    }
    const puzzle = dailyPuzzle(date);
    try {
      const result = mock ? { text: mockStory(puzzle), model: 'mock' } : await generateText(puzzle);
      if (!result) {
        failed++;
        console.warn(`${date}: история не прошла проверку — пропускаем`);
        continue;
      }
      const story = { date, number: puzzle.number, id: caseId(puzzle), model: result.model, text: result.text };
      writeFileSync(file, `${JSON.stringify(story, null, 2)}\n`);
      console.log(`${date}: готово (${result.model}, ${result.text.split(/\s+/).length} слов)`);
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
