// Дело дня: дата → одно и то же дело у всех.

import { hashString, mulberry32, pick, randInt, shuffle } from './rng.js';
import { SUSPECTS } from './suspects.js';
import { ITEMS, PLACES } from './puzzle.js';
import { generate } from './generator.js';
import { STORY } from './text.js';

export const SIZE = 5;
const FIRST_CASE = Date.UTC(2026, 10, 1); // 1 ноября 2026 — дело №1

const pad = (x) => String(x).padStart(2, '0');

// Дата по местному времени: 'YYYY-MM-DD'.
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const isDateKey = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text ?? '');

export function caseNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - FIRST_CASE) / 86400000) + 1;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Время прихода: пять отметок по порядку, например 20:30, 20:50, 21:10 …
// Начало и шаг меняются день ото дня; последняя отметка — не позже 23:50.
function times(rand, n) {
  const step = pick(rand, [10, 15, 20, 30]);
  const latest = 23 * 60 + 50 - (n - 1) * step;
  const starts = [];
  for (let t = 19 * 60; t <= Math.min(22 * 60, latest); t += 30) starts.push(t);
  const start = pick(rand, starts);
  return Array.from({ length: n }, (_, i) => {
    const t = start + i * step;
    return { name: `${pad(Math.floor(t / 60))}:${pad(t % 60)}` };
  });
}

// Тексты идут «колодой»: за size дней подряд ни один не повторится.
export function deck(size, number, salt) {
  const round = Math.floor((number - 1) / size);
  const order = shuffle(mulberry32(hashString(`${salt}:${round}`)), [...Array(size).keys()]);
  return order[(((number - 1) % size) + size) % size];
}

export function dailyPuzzle(key) {
  const rand = mulberry32(hashString(`case-file:${key}`));
  const suspects = shuffle(rand, SUSPECTS).slice(0, SIZE);
  const categories = [
    { key: 'time', title: 'Время', ordered: true, values: times(rand, SIZE) },
    { key: 'place', title: 'Место', values: shuffle(rand, PLACES).slice(0, SIZE) },
    { key: 'item', title: 'Предмет', values: shuffle(rand, ITEMS).slice(0, SIZE) },
  ];
  const puzzle = generate(rand, { suspects, categories });
  const number = caseNumber(key);
  const intro = deck(STORY.intros.length, number, 'intro');
  const mainKey = categories[puzzle.culpritClue.k].key;
  // главная улика должна сочетаться со вступлением: «орудие» — только если тело нашли
  const mains = STORY.main[mainKey].map((m, i) => ({ ...m, i })).filter((m) => !m.body || STORY.intros[intro].body !== false);
  const story = {
    intro,
    main: pick(rand, mains).i,
    confession: deck(STORY.confessions.length, number, 'confession'),
    // картинка дня: какое окно горит, какая луна, какая погода
    art: { window: randInt(rand, 6), moon: randInt(rand, 2), weather: randInt(rand, 4) },
  };
  return { ...puzzle, story, key, number };
}
