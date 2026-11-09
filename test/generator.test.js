import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrue, orderIndex } from '../src/puzzle.js';
import { context, isDirect, solve } from '../src/logic.js';
import { casePuzzle, dailyPuzzle } from '../src/daily.js';
import { DIFFICULTY, generate } from '../src/generator.js';
import { mulberry32 } from '../src/rng.js';
import { countSolutions, days } from './helpers.js';
import { neededShare } from '../src/brute.js';

// 60 дней подряд; дела генерируются один раз на весь файл.
const keys = days(60, '2026-11-01');
const cache = new Map();
const daily = (key) => {
  if (!cache.has(key)) cache.set(key, dailyPuzzle(key));
  return cache.get(key);
};
const CODES = ['x-a3f9k2', 'x-q1w2e3', 'x-dead00', 'x-mnbvcx'];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

test('каждое дело решается логикой целиком, улики верны, лишних нет', () => {
  for (const key of [...keys, ...CODES]) {
    const p = key.startsWith('x-') ? casePuzzle(key) : daily(key);
    const n = p.suspects.length;
    assert.ok(solve(context(p)).solved, key);
    for (const clue of p.clues) assert.ok(isTrue(clue, p.solution, n, orderIndex(p)), `${key}: ${clue.type}`);
    for (let i = 0; i < p.clues.length; i++) {
      const rest = p.clues.filter((_, j) => j !== i);
      assert.equal(solve(context({ ...p, clues: rest })).solved, false, `${key}: улика ${i + 1} лишняя`);
    }
  }
});

test('прямых «пришёл в …» не больше maxDirectIs, связок — не больше maxLinks', () => {
  for (const key of keys) {
    const p = daily(key);
    const ctx = context(p);
    const directIs = p.clues.filter((c) => c.type === 'is' && isDirect(ctx, c)).length;
    const links = p.clues.filter((c) => c.type === 'is' && !isDirect(ctx, c)).length;
    assert.ok(directIs <= DIFFICULTY.maxDirectIs, `${key}: ${directIs} прямых`);
    assert.ok(links <= DIFFICULTY.maxLinks, `${key}: ${links} связок`);
  }
});

test('чтобы узнать преступника, нужно не меньше 75% улик — даже с развилками', () => {
  for (const key of keys.slice(0, 12)) {
    const p = daily(key);
    assert.ok(neededShare(p) >= DIFFICULTY.minNeeded, key);
    assert.equal(p.needed, neededShare(p), key);
  }
});

test('ответ единственный (полный перебор)', () => {
  for (const key of keys.slice(0, 15)) {
    assert.equal(countSolutions(daily(key)), 1, key);
  }
});

test('преступника определяет главная улика', () => {
  for (const key of keys) {
    const p = daily(key);
    const { k, v } = p.culpritClue;
    assert.equal(p.solution.findIndex((row) => row[k] === v), p.culprit, key);
  }
});

test('примета из главной улики в уликах прямо не названа', () => {
  for (const key of keys) {
    const p = daily(key);
    const { k, v } = p.culpritClue;
    const leak = p.clues.find(
      (c) => c.type === 'is' && ((c.s.g === p.culprit && c.k === k) || (c.s.k === k && c.s.v === v) || (c.k === k && c.v === v)),
    );
    assert.equal(leak, undefined, key);
  }
});

test('главная улика бывает про время, место и предмет — без перекоса', () => {
  const split = [0, 0, 0];
  for (const key of keys) split[daily(key).culpritClue.k]++;
  for (const [k, count] of split.entries()) {
    assert.ok(count > 0, `категория ${k} не встретилась`);
    assert.ok(count <= keys.length * 0.6, `категория ${k}: ${count} из ${keys.length}`);
  }
});

test('сложность держится в одной полосе', (t) => {
  const scores = keys.map((key) => daily(key).score);
  const counts = keys.map((key) => daily(key).clues.length);
  const [min, med, max] = [Math.min(...scores), median(scores), Math.max(...scores)];
  t.diagnostic(`сложность: ${min} / ${med} / ${max}; улик: ${Math.min(...counts)}–${Math.max(...counts)}`);
  // за 60 дней с 1 ноября 2026 было 42 / 48.5 / 58.5 при цели 48
  assert.ok(Math.abs(med - DIFFICULTY.target) <= 5, `медиана ${med}`);
  assert.ok(min >= DIFFICULTY.target - 12, `слишком легко: ${min}`);
  assert.ok(max <= DIFFICULTY.target + 16, `слишком сложно: ${max}`);
  assert.ok(max - min <= 24, `разброс ${min}–${max}`);
  for (const c of counts) assert.ok(c >= 7 && c <= 18, `улик: ${c}`);
});

test('одно дело — одно и то же, и собирается быстро', () => {
  const start = performance.now();
  const a = dailyPuzzle('2027-02-14');
  const ms = performance.now() - start;
  assert.ok(ms < 2000, `${Math.round(ms)} мс`);
  assert.deepEqual(dailyPuzzle('2027-02-14'), a);
  assert.deepEqual(casePuzzle('x-a3f9k2'), casePuzzle('x-a3f9k2'));
  // и сам генератор: тот же rand — тот же результат
  const { suspects, categories } = a;
  const one = generate(mulberry32(9), { suspects, categories });
  const two = generate(mulberry32(9), { suspects, categories });
  assert.deepEqual(one, two);
});

test('слова улики: flip — только у «раньше» и «сразу после», say — 0 или 1', () => {
  for (const key of keys.slice(0, 20)) {
    for (const clue of daily(key).clues) {
      assert.ok(clue.say === 0 || clue.say === 1, key);
      if (clue.type === 'left' || clue.type === 'rightNext') assert.equal(typeof clue.flip, 'boolean', key);
      else assert.equal(clue.flip, undefined, key);
    }
  }
});
