// История дела от Gemini. Запускается раз в день из GitHub Actions (.github/workflows/story.yml),
// можно и вручную: GEMINI_API_KEY=… node scripts/story.mjs
//
// Пишет stories/<дата>.json для вчера, сегодня и двух дней вперёд (кроме уже готовых),
// чтобы история была у игроков в любом часовом поясе.
//
//   --date 2026-11-08   только эта дата
//   --force             переписать, даже если файл уже есть
//   --mock              без Gemini: заглушка, чтобы проверить весь путь
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
const force = flag('--force');
const key = process.env.GEMINI_API_KEY;
const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
const ATTEMPTS = 3;

function dates() {
  const one = option('--date');
  if (one) {
    if (!isDateKey(one)) throw new Error(`плохая дата: ${one}`);
    return [one];
  }
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  return [-1, 0, 1, 2].map(day);
}

async function ask(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
    }),
  });
  if (!response.ok) {
    const error = new Error(`${model}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error(`${model}: пустой ответ (${data.candidates?.[0]?.finishReason ?? 'нет кандидатов'})`);
  return text;
}

let workingModel = null;

async function generateText(puzzle) {
  const prompt = buildPrompt(puzzle);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let text;
    for (const model of workingModel ? [workingModel] : MODELS) {
      try {
        text = clean(await ask(model, prompt));
        workingModel = model;
        break;
      } catch (error) {
        console.warn(`  ${error.message}`);
        if (error.status !== 404 && error.status !== 400) throw error; // не та модель — пробуем следующую
      }
    }
    if (!text) throw new Error('ни одна модель не ответила');
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
    }
  }
  if (failed) process.exitCode = 1;
}

main();
