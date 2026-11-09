import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randInt, shuffle } from '../src/rng.js';
import { trueClues } from '../src/puzzle.js';
import {
  applyClue,
  applyRemovals,
  bit,
  clueRefs,
  context,
  culpritSlot,
  fullState,
  has,
  isBroken,
  isDirect,
  isSolved,
  nextStep,
  ref,
  rowKnown,
  settled,
  solutionSlots,
  solve,
} from '../src/logic.js';
import { randomSolution } from '../src/generator.js';
import { dailyPuzzle } from '../src/daily.js';
import { days } from './helpers.js';

const base = dailyPuzzle('2026-11-06');
const N = 5;
// Доска 5×5: строки 0–4 — люди, 5–9 — места, 10–14 — предметы; время — колонки.
const ctx = context({ ...base, clues: [] });
const TIME = 0;
const PLACE = 1;
const ITEM = 2;
const ALL = bit(N) - 1;
const without = (...slots) => slots.reduce((m, t) => m & ~bit(t), ALL);
const only = (...slots) => slots.reduce((m, t) => m | bit(t), 0);
const state = (patch = {}) => {
  const pos = fullState(ctx);
  for (const [r, m] of Object.entries(patch)) pos[r] = m;
  return pos;
};

test('доска: время — колонки, остальные категории — группы строк', () => {
  assert.deepEqual(
    base.categories.map((c) => c.key),
    ['time', 'place', 'item'],
  );
  assert.equal(ctx.n, N);
  assert.equal(ctx.orderK, TIME);
  assert.deepEqual(ctx.groups, [
    { key: 'who', k: -1 },
    { key: 'place', k: PLACE },
    { key: 'item', k: ITEM },
  ]);
  assert.equal(ctx.rows, 15);
  assert.deepEqual(fullState(ctx), Array(15).fill(ALL));
});

test('ref и clueRefs: люди, время, места и предметы', () => {
  assert.deepEqual(ref(ctx, { g: 3 }), { row: 3 });
  assert.deepEqual(ref(ctx, { k: TIME, v: 2 }), { slot: 2 });
  assert.deepEqual(ref(ctx, { k: PLACE, v: 2 }), { row: 7 });
  assert.deepEqual(ref(ctx, { k: ITEM, v: 4 }), { row: 14 });

  assert.deepEqual(clueRefs(ctx, { type: 'is', s: { g: 1 }, k: TIME, v: 2 }), { rows: [1], slots: [2] });
  assert.deepEqual(clueRefs(ctx, { type: 'not', s: { k: TIME, v: 4 }, k: ITEM, v: 0 }), { rows: [10], slots: [4] });
  assert.deepEqual(clueRefs(ctx, { type: 'is', s: { k: PLACE, v: 0 }, k: ITEM, v: 3 }), { rows: [5, 13], slots: [] });
  assert.deepEqual(clueRefs(ctx, { type: 'left', a: { g: 4 }, b: { k: PLACE, v: 1 } }), { rows: [4, 6], slots: [] });
  assert.deepEqual(clueRefs(ctx, { type: 'edge', a: { k: ITEM, v: 2 } }), { rows: [12], slots: [] });
});

test('isDirect: прямо про клетку — только «есть/нет» со временем', () => {
  assert.equal(isDirect(ctx, { type: 'is', s: { g: 1 }, k: TIME, v: 2 }), true);
  assert.equal(isDirect(ctx, { type: 'not', s: { k: TIME, v: 2 }, k: PLACE, v: 1 }), true);
  assert.equal(isDirect(ctx, { type: 'is', s: { g: 1 }, k: PLACE, v: 2 }), false);
  assert.equal(isDirect(ctx, { type: 'edge', a: { g: 1 } }), false);
  assert.equal(isDirect(ctx, { type: 'left', a: { g: 1 }, b: { g: 2 } }), false);
});

test('solutionSlots: в какой колонке стоит каждая строка', () => {
  const truth = solutionSlots(base);
  assert.equal(truth.length, 15);
  base.solution.forEach((row, g) => {
    assert.equal(truth[g], row[TIME]);
    assert.equal(truth[N + row[PLACE]], row[TIME]);
    assert.equal(truth[2 * N + row[ITEM]], row[TIME]);
  });
  // в каждой группе колонки заняты по разу
  for (let g = 0; g < 3; g++) assert.deepEqual([...truth.slice(g * N, g * N + N)].sort(), [0, 1, 2, 3, 4]);
});

// Каждая выдача applyClue: без повторов и только то, что ещё не вычеркнуто.
function assertFresh(pos, removals) {
  const keys = removals.map(([r, t]) => `${r}:${t}`);
  assert.equal(new Set(keys).size, keys.length, `повтор в ${keys}`);
  for (const [r, t] of removals) assert.ok(has(pos[r], t), `${r}:${t} уже вычеркнута`);
}

test('applyClue: «строка в колонке» и «не в колонке»', () => {
  const is = { type: 'is', s: { g: 1 }, k: TIME, v: 2 };
  assert.deepEqual(applyClue(ctx, state(), is), [
    [1, 0],
    [1, 1],
    [1, 3],
    [1, 4],
  ]);
  // уже вычеркнутое не повторяется
  assert.deepEqual(applyClue(ctx, state({ 1: without(0, 4) }), is), [
    [1, 1],
    [1, 3],
  ]);
  assert.deepEqual(applyClue(ctx, state({ 1: bit(2) }), is), []);
  // время может быть и субъектом: «тот, кто пришёл в 21:30, был в месте 3»
  assert.deepEqual(applyClue(ctx, state(), { type: 'is', s: { k: TIME, v: 2 }, k: PLACE, v: 3 }), [
    [8, 0],
    [8, 1],
    [8, 3],
    [8, 4],
  ]);

  const not = { type: 'not', s: { g: 1 }, k: TIME, v: 2 };
  assert.deepEqual(applyClue(ctx, state(), not), [[1, 2]]);
  assert.deepEqual(applyClue(ctx, state({ 1: without(2) }), not), []);
  assert.deepEqual(applyClue(ctx, state(), { type: 'not', s: { k: TIME, v: 0 }, k: ITEM, v: 1 }), [[11, 0]]);
});

test('applyClue: связь двух строк — «тот же человек» и «разные люди»', () => {
  const is = { type: 'is', s: { g: 0 }, k: PLACE, v: 2 }; // строки 0 и 7 — в одной колонке
  const pos = state({ 0: only(0, 1, 2), 7: only(1, 2, 3) });
  const removals = applyClue(ctx, pos, is);
  assertFresh(pos, removals);
  assert.deepEqual(removals, [
    [0, 0],
    [7, 3],
  ]);
  assert.deepEqual(applyClue(ctx, state(), is), []);

  const not = { type: 'not', s: { g: 0 }, k: PLACE, v: 2 };
  assert.deepEqual(applyClue(ctx, state(), not), [], 'пока ни одна строка не на месте — ничего');
  assert.deepEqual(applyClue(ctx, state({ 0: bit(3) }), not), [[7, 3]]);
  assert.deepEqual(applyClue(ctx, state({ 7: bit(1) }), not), [[0, 1]]);
  assert.deepEqual(applyClue(ctx, state({ 0: bit(3), 7: without(3) }), not), [], 'уже вычеркнуто');
  // субъект — «тот, у кого предмет 4»
  assert.deepEqual(applyClue(ctx, state({ 14: bit(0) }), { type: 'not', s: { k: ITEM, v: 4 }, k: PLACE, v: 0 }), [[5, 0]]);
});

test('applyClue: первым или последним — и наоборот', () => {
  const edge = { type: 'edge', a: { g: 2 } };
  assert.deepEqual(applyClue(ctx, state(), edge), [
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  assert.deepEqual(applyClue(ctx, state({ 2: without(2) }), edge), [
    [2, 1],
    [2, 3],
  ]);
  const notEdge = { type: 'notEdge', a: { k: PLACE, v: 4 } };
  assert.deepEqual(applyClue(ctx, state(), notEdge), [
    [9, 0],
    [9, 4],
  ]);
  assert.deepEqual(applyClue(ctx, state({ 9: only(1, 2, 3) }), notEdge), []);
});

test('applyClue: порядок прихода', () => {
  // раньше: a не последний, b не первый
  assert.deepEqual(applyClue(ctx, state(), { type: 'left', a: { g: 0 }, b: { g: 1 } }), [
    [0, 4],
    [1, 0],
  ]);
  assert.deepEqual(applyClue(ctx, state({ 1: only(0, 1, 2) }), { type: 'left', a: { g: 0 }, b: { g: 1 } }), [
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 0],
  ]);
  // сразу после: a не первый, b не последний
  assert.deepEqual(applyClue(ctx, state(), { type: 'rightNext', a: { g: 0 }, b: { g: 1 } }), [
    [0, 0],
    [1, 4],
  ]);
  assert.deepEqual(applyClue(ctx, state({ 1: bit(2) }), { type: 'rightNext', a: { g: 0 }, b: { g: 1 } }), [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 4],
  ]);
  // один за другим: первый — значит, второй во втором слоте
  assert.deepEqual(applyClue(ctx, state({ 0: bit(0) }), { type: 'next', a: { g: 0 }, b: { k: PLACE, v: 0 } }), [
    [5, 0],
    [5, 2],
    [5, 3],
    [5, 4],
  ]);
  assert.deepEqual(applyClue(ctx, state(), { type: 'next', a: { g: 0 }, b: { g: 1 } }), []);
  // между ними кто-то был: ни в той же колонке, ни рядом
  assert.deepEqual(applyClue(ctx, state({ 0: bit(2) }), { type: 'notNext', a: { g: 0 }, b: { k: ITEM, v: 1 } }), [
    [11, 1],
    [11, 2],
    [11, 3],
  ]);
  assert.deepEqual(applyClue(ctx, state(), { type: 'notNext', a: { g: 0 }, b: { g: 1 } }), []);
  assert.throws(() => applyClue(ctx, state(), { type: 'later', a: { g: 0 }, b: { g: 1 } }));
});

test('applyClue на случайных состояниях: без повторов, только живые клетки, ответ цел', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 60; i++) {
    const puzzle = { ...base, solution: randomSolution(rand, N, 3) };
    const truth = solutionSlots(puzzle);
    // случайно вычеркнутые неверные клетки
    const pos = truth.map((t) => {
      let m = ALL;
      for (let s = 0; s < N; s++) if (s !== t && rand() < 0.4) m &= ~bit(s);
      return m;
    });
    for (const clue of shuffle(rand, trueClues(puzzle)).slice(0, 80)) {
      const removals = applyClue(ctx, pos, clue);
      assertFresh(pos, removals);
      for (const [r, t] of removals) assert.notEqual(t, truth[r], `${clue.type} вычеркнула ответ`);
    }
  }
});

test('nextStep: «один слот у строки» вычёркивает колонку группы', () => {
  const step = nextStep(ctx, state({ 0: bit(2) }));
  assert.deepEqual(step.reason, { kind: 'single', row: 0, slot: 2 });
  assert.deepEqual(step.removals, [
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
  ]);
  // соседи по колонке в другой группе не трогаются
  const place = nextStep(ctx, state({ 6: bit(4), 7: without(4) }));
  assert.deepEqual(place.reason, { kind: 'single', row: 6, slot: 4 });
  assert.deepEqual(place.removals, [
    [5, 4],
    [8, 4],
    [9, 4],
  ]);
});

test('nextStep: «в колонке группы один вариант» ставит его', () => {
  const pos = state({ 5: without(3), 7: without(3), 8: without(3), 9: without(3) });
  const step = nextStep(ctx, pos);
  assert.deepEqual(step.reason, { kind: 'only', row: 6, slot: 3 });
  assert.deepEqual(step.removals, [
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 4],
  ]);
  assert.equal(nextStep(ctx, fullState(ctx)), null, 'без улик на пустой доске выводить нечего');
});

test('nextStep: сперва улики про клетку, затем «один вариант», затем остальные улики', () => {
  const clues = [
    { type: 'left', a: { g: 0 }, b: { g: 1 } },
    { type: 'not', s: { g: 3 }, k: TIME, v: 1 },
  ];
  const c = context({ ...base, clues });
  const pos = state({ 4: bit(0) });
  const first = nextStep(c, pos);
  assert.deepEqual(first.reason, { kind: 'clue', index: 1 });
  assert.deepEqual(first.removals, [[3, 1]]);
  applyRemovals(pos, first.removals);
  assert.equal(nextStep(c, pos).reason.kind, 'single');
  applyRemovals(pos, nextStep(c, pos).removals);
  const third = nextStep(c, pos);
  assert.deepEqual(third.reason, { kind: 'clue', index: 0 });
});

test('isSolved, isBroken, culpritSlot, settled, rowKnown', () => {
  const truth = solutionSlots(base);
  const solved = truth.map((t) => bit(t));
  assert.equal(isSolved(solved), true);
  assert.equal(isSolved(fullState(ctx)), false);
  assert.equal(isBroken(fullState(ctx)), false);
  assert.equal(isBroken(state({ 3: 0 })), true);

  // время — сама колонка, остальное — известно, только когда строка на месте
  assert.equal(culpritSlot(ctx, fullState(ctx), TIME, 3), 3);
  assert.equal(culpritSlot(ctx, fullState(ctx), PLACE, 2), -1);
  assert.equal(culpritSlot(ctx, state({ 7: bit(4) }), PLACE, 2), 4);

  assert.equal(settled(ctx, state({ 7: bit(4) }), 1, 4), 2);
  assert.equal(settled(ctx, state({ 7: bit(4) }), 1, 3), -1);
  assert.equal(settled(ctx, state({ 7: bit(4) }), 0, 4), -1);

  const g = base.culprit;
  const { k, v } = base.culpritClue;
  assert.equal(rowKnown(ctx, fullState(ctx), k, v), false);
  assert.equal(rowKnown(ctx, solved, k, v), true);
  // достаточно колонки преступника: остальная доска может быть не решена
  const slot = base.solution[g][TIME];
  const column = fullState(ctx).map((m, r) => (truth[r] === slot ? bit(slot) : m & ~bit(slot)));
  assert.equal(rowKnown(ctx, column, k, v), true);
  const almost = [...column];
  almost[2 * N + base.solution[g][ITEM]] = ALL;
  assert.equal(rowKnown(ctx, almost, k, v), false);
});

test('решатель никогда не вычёркивает правильный ответ', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const solution = randomSolution(rand, N, 3);
    const puzzle = { ...base, solution };
    const clues = shuffle(rand, trueClues(puzzle)).slice(0, 1 + (i % 25));
    const { pos, broken } = solve(context({ ...puzzle, clues }));
    assert.equal(broken, false);
    solutionSlots(puzzle).forEach((t, r) => assert.ok(has(pos[r], t), `шаг вычеркнул ответ (${i}, строка ${r})`));
  }
});

test('все улики из пула верны и решают дело', () => {
  const puzzle = { ...base, clues: trueClues(base) };
  const { pos, solved } = solve(context(puzzle));
  assert.ok(solved);
  assert.deepEqual(
    pos,
    solutionSlots(base).map((t) => bit(t)),
  );
});

test('solve: trace — причины шагов, stop останавливает раньше', () => {
  const c = context(base);
  const full = solve(c);
  assert.ok(full.solved);
  assert.ok(full.trace.length > 0);
  for (const reason of full.trace) assert.ok(['clue', 'single', 'only'].includes(reason.kind));
  const { k, v } = base.culpritClue;
  const early = solve(c, undefined, (pos) => rowKnown(c, pos, k, v));
  assert.ok(early.trace.length <= full.trace.length);
  assert.equal(rowKnown(c, early.pos, k, v), true);
  // start не портится
  const start = fullState(c);
  solve(c, start);
  assert.deepEqual(start, fullState(c));
});

test('порядок не важен: после любых верных вычёркиваний дело всё равно решается', () => {
  const rand = mulberry32(5);
  for (const key of days(12, '2026-11-01')) {
    const puzzle = dailyPuzzle(key);
    const c = context(puzzle);
    const truth = solutionSlots(puzzle);
    const wrong = truth.flatMap((t, r) => [...Array(N).keys()].filter((s) => s !== t).map((s) => [r, s]));
    for (let i = 0; i < 10; i++) {
      const start = applyRemovals(fullState(c), shuffle(rand, wrong).slice(0, randInt(rand, wrong.length)));
      const result = solve(c, start);
      assert.ok(result.solved, `${key}: не решилось (${i})`);
      assert.deepEqual(
        result.pos,
        truth.map((t) => bit(t)),
        key,
      );
    }
    // и с середины собственного решения, если шаги шли в другом порядке
    const half = solve(c, undefined, (pos) => pos.filter((m) => m !== ALL).length >= 6).pos;
    assert.ok(solve(c, half).solved, key);
  }
});
