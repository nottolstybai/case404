import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle } from '../src/rng.js';
import { trueClues } from '../src/puzzle.js';
import { context, has, solve } from '../src/logic.js';
import { randomSolution } from '../src/generator.js';
import { dailyPuzzle } from '../src/daily.js';

const base = dailyPuzzle('2026-11-06');

test('решатель никогда не вычёркивает правильный ответ', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const solution = randomSolution(rand, 5, 3);
    const puzzle = { ...base, solution };
    const clues = shuffle(rand, trueClues(puzzle)).slice(0, 1 + (i % 25));
    const { poss, broken } = solve(context({ ...puzzle, clues }));
    assert.equal(broken, false);
    solution.forEach((row, g) => row.forEach((v, k) => assert.ok(has(poss[g][k], v), `шаг вычеркнул ответ (${i})`)));
  }
});

test('все улики из пула верны и решают дело', () => {
  const puzzle = { ...base, clues: trueClues(base) };
  const { poss, solved } = solve(context(puzzle));
  assert.ok(solved);
  base.solution.forEach((row, g) => row.forEach((v, k) => assert.equal(poss[g][k], 1 << v)));
});
