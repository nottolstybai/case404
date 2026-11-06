import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzle } from '../src/daily.js';
import { CHECK, CROSS, EMPTY, accuse, accuseCategories, giveUp, hint, isOver, mistakes, newGame, tap, undo } from '../src/game.js';

const puzzle = dailyPuzzle('2026-11-06');
const truth = (g, k) => puzzle.solution[g][k];
const other = (g, k) => (truth(g, k) + 1) % 5;

test('тап ставит то, что выбрано (✗ или ✓); повторный тап стирает; отмена', () => {
  const game = newGame(puzzle);
  tap(game, 0, 1, 2, CROSS);
  assert.equal(game.marks[0][1][2], CROSS);
  tap(game, 0, 1, 2, CHECK);
  assert.equal(game.marks[0][1][2], CHECK);
  tap(game, 0, 1, 2, CHECK);
  assert.equal(game.marks[0][1][2], EMPTY);
  undo(game);
  assert.equal(game.marks[0][1][2], CHECK);
  undo(game);
  undo(game);
  assert.equal(game.marks[0][1][2], EMPTY);
  assert.equal(undo(game), false);
});

test('✗ ничего не отмечает сам', () => {
  const game = newGame(puzzle);
  for (let v = 0; v < 4; v++) tap(game, 0, 1, v, CROSS);
  const marked = game.marks.flat(2).filter((m) => m !== EMPTY).length;
  assert.equal(marked, 4);
});

test('после ✓ строка и столбец вычёркиваются сами, отмена убирает всё разом', () => {
  const game = newGame(puzzle);
  tap(game, 0, 1, 2, CHECK);
  for (let v = 0; v < 5; v++) assert.equal(game.marks[0][1][v], v === 2 ? CHECK : CROSS);
  for (let g = 1; g < 5; g++) assert.equal(game.marks[g][1][2], CROSS);
  undo(game);
  assert.ok(game.marks.flat(2).every((m) => m === EMPTY));
});

test('упрощённый режим: последний вариант отмечается сам', () => {
  const game = newGame(puzzle);
  for (let v = 0; v < 4; v++) tap(game, 3, 2, v, CROSS, true);
  assert.equal(game.marks[3][2][4], CHECK);
  for (let g = 0; g < 3; g++) assert.equal(game.marks[g][2][4], CROSS);
});

test('упрощённый режим не ломает отметку ✓ (раньше первый тап ставил ✗)', () => {
  const game = newGame(puzzle);
  for (const v of [0, 1, 2]) tap(game, 1, 1, v, CROSS, true);
  tap(game, 1, 1, 3, CHECK, true);
  assert.deepEqual(game.marks[1][1], [CROSS, CROSS, CROSS, CHECK, CROSS]);
});

test('подсказка находит ошибку, а потом ведёт по шагам до конца', () => {
  const game = newGame(puzzle);
  tap(game, 1, 2, truth(1, 2), CROSS); // вычеркнули правильный вариант
  const h = hint(game, puzzle);
  assert.equal(h.kind, 'mistake');
  assert.deepEqual(h.cells, [[1, 2, truth(1, 2)]]);
  undo(game);
  // ходим только по подсказкам: каждая — верный шаг, в конце «всё сходится»
  for (let i = 0; i < 200; i++) {
    const step = hint(game, puzzle);
    if (step.kind === 'done') break;
    assert.equal(step.kind, 'step');
    assert.ok(step.text.length > 10);
    for (const [g, k, v] of step.cells) tap(game, g, k, v, CROSS);
    assert.deepEqual(mistakes(game, puzzle), []);
  }
  assert.equal(hint(game, puzzle).text, 'О преступнике известно всё. Пора выдвигать обвинение.');
});

test('обвинение: нужно назвать всё верно', () => {
  const game = newGame(puzzle);
  const c = puzzle.culprit;
  const fields = accuseCategories(puzzle);
  assert.equal(fields.includes(puzzle.culpritClue.k), false);
  const right = Object.fromEntries(fields.map((k) => [k, truth(c, k)]));
  const wrongPlace = { ...right, [fields[0]]: other(c, fields[0]) };
  assert.equal(accuse(game, puzzle, { g: c, values: wrongPlace }), false);
  assert.equal(accuse(game, puzzle, { g: (c + 1) % 5, values: right }), false);
  assert.equal(game.wrong, 2);
  assert.equal(accuse(game, puzzle, { g: c, values: right }), true);
  assert.equal(game.solved, true);
});

test('сдаться: дело закрыто, отметки и обвинения больше не принимаются', () => {
  const game = newGame(puzzle);
  assert.equal(isOver(game), false);
  giveUp(game);
  assert.equal(isOver(game), true);
  assert.equal(game.solved, false);
  tap(game, 0, 0, 0, CROSS);
  assert.equal(game.marks[0][0][0], EMPTY);
  const c = puzzle.culprit;
  const values = Object.fromEntries(accuseCategories(puzzle).map((k) => [k, truth(c, k)]));
  assert.equal(accuse(game, puzzle, { g: c, values }), false);
  assert.equal(game.solved, false);
});


test('отмена понимает ходы из старых сохранений', () => {
  const game = newGame(puzzle);
  game.marks[0][1][2] = CROSS;
  game.marks[1][1][2] = CHECK;
  game.history.push([['p', 0, 1, 2, EMPTY], ['t', 0, 1, 2, EMPTY]], [[1, 1, 2, EMPTY]]);
  undo(game);
  undo(game);
  assert.ok(game.marks.flat(2).every((m) => m === EMPTY));
});
