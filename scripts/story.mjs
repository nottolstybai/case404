// История дела от Gemini. Запускается раз в день из GitHub Actions (.github/workflows/story.yml),
// можно и вручную: GEMINI_API_KEY=… node scripts/story.mjs
//
// Пишет stories/<дата>.json для вчера, сегодня и двух дней вперёд (кроме уже готовых),
// чтобы история была у игроков в любом часовом поясе.
//
//   --date 2026-11-08   только эта дата
//   --force             переписать, даже если файл уже есть
//   --mock              без Gemini: заглушка, чтобы проверить весь путь
//   (FORCE=true в окружении — то же, что --force; так делает ручной запуск в Actions)
//   --out <папка>       куда писать (по умолчанию stories)
//
// Модель: GEMINI_MODEL, если задана; иначе по очереди пробуем известные имена Flash.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { caseId, dailyPuzzle, isDateKey } from '../src/daily.js';
import { buildPrompt, clean, mockStory, validate } from './story-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const outDir = option('--out') ?? 'stories';
const mock = flag('--mock');
const force = flag('--force') || process.env.FORCE === 'true';
const key = process.env.GEMINI_API_KEY;
// Порядок моделей: заданная, потом Flash, потом Flash Lite (у Lite своя квота и меньше нагрузка).
// Бесплатная квота — около 20 запросов в день на модель, поэтому повторяем бережно:
// перегружена (503) — одна повторная попытка; кончилась квота (429) — к этой модели больше не обращаемся.
const MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
].filter(Boolean);
const ATTEMPTS = 3; // сколько раз просить историю, если ответ не прошёл проверку
const RETRIES = 2; // сколько раз пробовать перегруженную модель
const RETRYABLE = new Set([500, 502, 503, 504, 598, 599]); // 598 — таймаут, 599 — пустой ответ
const skip = new Set(); // модели, которые в этом запуске больше не трогаем (нет такой, кончилась квота)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function ask(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192, // с запасом: новые модели сперва «думают»
        // ответ — строго JSON {"story": "…"}: черновики и подсчёты слов в него не попадут
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { story: { type: 'STRING' } }, required: ['story'] },
      },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw fail(`${model}: нет ответа (${error.name})`, 598);
  }
  if (!response.ok) {
    const body = await response.text();
    let message = body.slice(0, 200);
    try {
      message = JSON.parse(body).error.message;
    } catch {
      // оставим как есть
    }
    const retryIn = message.match(/retry in ([\dhms]+)/)?.[1];
    message = message.split('\n')[0] + (retryIn ? ` (снова можно через ${retryIn})` : '');
    throw fail(`${model}: HTTP ${response.status} ${message}`, response.status);
  }
  const data = await response.json();
  const candidate = data.candidates?.[0];
  // «мысли» модели (thought: true) — не история; берём только готовый текст
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  const reason = candidate?.finishReason ?? 'нет кандидатов';
  if (!text) throw fail(`${model}: пустой ответ (${reason})`, 599);
  if (reason !== 'STOP') throw fail(`${model}: ответ не закончен (${reason})`, 599);
  try {
    const story = JSON.parse(text).story;
    if (typeof story !== 'string' || !story.trim()) throw new Error('нет поля story');
    return story;
  } catch (error) {
    throw fail(`${model}: ответ не в формате JSON (${error.message})`, 599);
  }
}

let workingModel = null;

// Получить текст от первой модели, которая ответит. Если не ответила ни одна — ошибка,
// и запуск останавливается: остальные даты допишет следующий запуск.
async function askAny(prompt) {
  const order = workingModel ? [workingModel, ...MODELS.filter((m) => m !== workingModel)] : MODELS;
  let last;
  for (const model of order.filter((m) => !skip.has(m))) {
    for (let retry = 0; retry < RETRIES; retry++) {
      try {
        const text = clean(await ask(model, prompt));
        workingModel = model;
        return text;
      } catch (error) {
        last = error;
        console.warn(`  ${error.message}`);
        if ([400, 403, 404, 429].includes(error.status)) {
          skip.add(model); // нет такой модели, нет доступа или кончилась квота — повторять бесполезно
          break;
        }
        if (!RETRYABLE.has(error.status)) throw error;
        if (retry < RETRIES - 1) await sleep(20_000);
      }
    }
  }
  throw new Error(`Gemini сейчас недоступен (${last?.message ?? 'все модели пропущены'})`);
}

async function generateText(puzzle) {
  const prompt = buildPrompt(puzzle);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const text = await askAny(prompt);
    const { ok, problems } = validate(text, puzzle);
    if (ok) return { text, model: workingModel };
    console.warn(`  попытка ${attempt}: ${problems.join('; ')}`);
  }
  return null;
}

async function main() {
  if (!mock && !key) {
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
