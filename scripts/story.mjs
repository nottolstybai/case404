// История дела от нейросети. Запускается раз в день из GitHub Actions (.github/workflows/story.yml),
// можно и вручную: GEMINI_API_KEY=… GITHUB_TOKEN=… node scripts/story.mjs
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
// Модели — по очереди, пока какая-нибудь не ответит:
//   1. Gemini (ключ GEMINI_API_KEY; модель можно задать GEMINI_MODEL);
//   2. GitHub Models — GPT-4o mini и другие (токен GITHUB_TOKEN; в Actions он есть всегда).
// Бесплатные квоты небольшие, поэтому повторяем бережно: перегружена — одна повторная попытка;
// кончилась квота (429) или модели нет — в этом запуске к ней больше не обращаемся.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { caseId, dailyPuzzle, isDateKey } from '../src/daily.js';
import { buildPrompt, clean, mockStory, validate } from './story-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const outDir = option('--out') ?? 'stories';
const mock = flag('--mock');
const force = flag('--force') || process.env.FORCE === 'true';
const geminiKey = process.env.GEMINI_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;

const GEMINI_MODELS = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const GITHUB_MODELS = ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini', 'deepseek/DeepSeek-V3-0324'];

const ATTEMPTS = 3; // сколько раз просить историю, если ответ не прошёл проверку
const RETRIES = 2; // сколько раз пробовать перегруженную модель
const RETRYABLE = new Set([500, 502, 503, 504, 598, 599]); // 598 — таймаут, 599 — пустой или недописанный ответ
const SKIP = new Set([400, 401, 403, 404, 413, 422, 429]); // повторять бесполезно — переходим к следующей модели
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM = 'Ты пишешь короткие мрачные детективные развязки на русском языке. Отвечай строго JSON-объектом {"story": "текст"}.';

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
    message = message.split('\n')[0] + (retryIn ? ` (снова можно через ${retryIn})` : '');
    throw fail(`${name}: HTTP ${response.status} ${message}`, response.status);
  }
  return response.json();
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

async function askGithub(model, prompt) {
  const data = await post(
    model,
    'https://models.github.ai/inference/chat/completions',
    { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    },
  );
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (!text) throw fail(`${model}: пустой ответ (${choice?.finish_reason ?? 'нет вариантов'})`, 599);
  if (choice.finish_reason && choice.finish_reason !== 'stop') throw fail(`${model}: ответ не закончен (${choice.finish_reason})`, 599);
  return storyFrom(model, text);
}

// Все доступные модели по порядку: сначала Gemini, потом GitHub Models.
const MODELS = [
  ...(geminiKey ? GEMINI_MODELS.filter(Boolean).map((name) => ({ name, ask: askGemini })) : []),
  ...(githubToken ? GITHUB_MODELS.map((name) => ({ name, ask: askGithub })) : []),
];
const skipped = new Set(); // модели, к которым в этом запуске больше не обращаемся
let working = null; // модель, которая уже ответила, — спрашиваем её первой

// Получить текст от первой модели, которая ответит. Если не ответила ни одна — ошибка,
// и запуск останавливается: остальные даты допишет следующий запуск.
async function askAny(prompt) {
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS;
  let last;
  for (const model of order.filter((m) => !skipped.has(m.name))) {
    for (let retry = 0; retry < RETRIES; retry++) {
      try {
        const text = clean(await model.ask(model.name, prompt));
        working = model;
        return text;
      } catch (error) {
        last = error;
        console.warn(`  ${error.message}`);
        if (SKIP.has(error.status)) {
          skipped.add(model.name);
          break;
        }
        if (!RETRYABLE.has(error.status)) throw error;
        if (retry < RETRIES - 1) await sleep(20_000);
      }
    }
  }
  throw new Error(`ни одна модель не ответила (${last?.message ?? 'все пропущены'})`);
}

async function generateText(puzzle) {
  const prompt = buildPrompt(puzzle);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const text = await askAny(prompt);
    const { ok, problems } = validate(text, puzzle);
    if (ok) return { text, model: working.name };
    console.warn(`  попытка ${attempt} (${working.name}): ${problems.join('; ')}`);
  }
  return null;
}

async function main() {
  if (!mock && !MODELS.length) {
    console.error('Нет ни GEMINI_API_KEY, ни GITHUB_TOKEN. Для проверки без них: node scripts/story.mjs --mock --out <папка>');
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
