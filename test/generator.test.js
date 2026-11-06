import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrue, orderIndex } from '../src/puzzle.js';
import { context, solve } from '../src/logic.js';
import { dailyPuzzle } from '../src/daily.js';
import { countSolutions } from './helpers.js';
import { neededShare } from '../src/brute.js';

const keys = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i * 7)).toISOString().slice(0, 10));

test('каждое дело решается логикой целиком, улики верны, лишних нет', () => {
  for (const key of keys) {
    const p = dailyPuzzle(key);
    const n = p.suspects.length;
    assert.ok(solve(context(p)).solved, key);
    for (const clue of p.clues) assert.ok(isTrue(clue, p.solution, n, orderIndex(p)), key);
    for (let i = 0; i < p.clues.length; i++) {
      const rest = p.clues.filter((_, j) => j !== i);
      assert.equal(solve(context({ ...p, clues: rest })).solved, false, `${key}: улика ${i + 1} лишняя`);
    }
    const directIs = p.clues.filter((c) => c.type === 'is' && c.s.g !== undefined).length;
    assert.ok(directIs <= 1, key);
  }
});

test('чтобы узнать преступника, нужно не меньше 75% улик — даже с развилками', () => {
  for (const key of keys.slice(0, 12)) {
    assert.ok(neededShare(dailyPuzzle(key)) >= 0.75, key);
  }
});

test('ответ единственный (полный перебор)', () => {
  for (const key of keys.slice(0, 15)) {
    assert.equal(countSolutions(dailyPuzzle(key)), 1, key);
  }
});

test('преступника определяет главная улика', () => {
  for (const key of keys) {
    const p = dailyPuzzle(key);
    const { k, v } = p.culpritClue;
    assert.equal(p.solution.findIndex((row) => row[k] === v), p.culprit);
  }
  const kinds = new Set(keys.map((key) => dailyPuzzle(key).culpritClue.k));
  assert.equal(kinds.size, 3, 'главная улика бывает про время, комнату и предмет');
});

test('время прихода преступника в уликах прямо не названо', () => {
  for (const key of keys) {
    const p = dailyPuzzle(key);
    const k = p.culpritClue.k;
    const v = p.culpritClue.v;
    const leak = p.clues.find(
      (c) => c.type === 'is' && ((c.s.g === p.culprit && c.k === k) || (c.s.k === k && c.s.v === v) || (c.k === k && c.v === v)),
    );
    assert.equal(leak, undefined, key);
  }
});
