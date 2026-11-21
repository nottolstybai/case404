// Заготовить дела с показаниями на даты вперёд: cases/testimony/<дата>.json.
// Трудное дело (уровень 3) собирается в браузере телефона долго — прототип берёт дело дня отсюда,
// а генерирует сам только случайные дела по коду и даты без заготовки.
//   node scripts/testimony-cases.mjs [с какой даты] [сколько дней]   — по умолчанию: от вчера, 45 дней
// Заготовки пересобирать после любых правок генератора (src/testimony.js, src/text.js, src/daily.js).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dateKey } from '../src/daily.js';
import { testimonyPuzzle } from '../src/testimony.js';

const [from, count = '45'] = process.argv.slice(2);
const start = from ? new Date(`${from}T12:00:00`) : new Date(Date.now() - 86400000);
mkdirSync('cases/testimony', { recursive: true });
let total = 0;
for (let i = 0; i < Number(count); i++) {
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
  const key = dateKey(day);
  const t = performance.now();
  const puzzle = testimonyPuzzle(key);
  writeFileSync(`cases/testimony/${key}.json`, JSON.stringify(puzzle));
  total += performance.now() - t;
  console.log(`${key}: уровень ${puzzle.level}, ${Math.round(performance.now() - t)} мс`);
}
console.log(`готово: ${count} дел, ${(total / 1000).toFixed(1)} с`);
