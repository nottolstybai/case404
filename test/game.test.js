import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzle } from '../src/daily.js';
import { solutionSlots } from '../src/logic.js';
import {
  AUTO_CHECK,
  AUTO_CROSS,
  CHECK,
  CROSS,
  EMPTY,
  accuse,
  accuseCategories,
  blocker,
  clueState,
  culpritFacts,
  giveUp,
  hint,
  isBlank,
  isOver,
  mistakes,
  newGame,
  posFromMarks,
  progress,
  redo,
  reset,
  tap,
  toggleClue,
  undo,
  view,
} from '../src/game.js';
import { days } from './helpers.js';

const puzzle = dailyPuzzle('2026-11-06');
const N = 5;
const TIME = 0;
const truth = solutionSlots(puzzle); // truth[row] — правильная колонка строки
const wrongSlot = (r) => (truth[r] + 1) % N;
const value = (g, k) => puzzle.solution[g][k];
const other = (g, k) => (value(g, k) + 1) % N;
const filled = (game) => game.marks.flat().filter((m) => m !== EMPTY).length;
const DONE = 'О преступнике известно всё. Пора выдвигать обвинение.';

// Отметить ✓ весь правильный ответ.
function tickTruth(game, p = puzzle) {
  solutionSlots(p).forEach((t, r) => assert.deepEqual(tap(game, r, t, { want: CHECK }), { mark: CHECK }, `строка ${r}`));
}

test('новая партия: пустая доска 15×5', () => {
  const game = newGame(puzzle);
  assert.equal(game.marks.length, 15);
  assert.ok(game.marks.every((row) => row.length === N && row.every((m) => m === EMPTY)));
  assert.equal(isBlank(game), true);
  assert.equal(isOver(game), false);
});

test('тап по кругу: пусто → ✗ → ✓ → пусто', () => {
  const game = newGame(puzzle);
  assert.deepEqual(tap(game, 0, 1), { mark: CROSS });
  assert.equal(game.marks[0][1], CROSS);
  assert.deepEqual(tap(game, 0, 1), { mark: CHECK });
  assert.equal(game.marks[0][1], CHECK);
  assert.deepEqual(tap(game, 0, 1), { mark: EMPTY });
  assert.equal(game.marks[0][1], EMPTY);
});

test('want: CHECK ставит и снимает ✓ сразу', () => {
  const game = newGame(puzzle);
  assert.deepEqual(tap(game, 3, 2, { want: CHECK }), { mark: CHECK });
  assert.equal(game.marks[3][2], CHECK);
  assert.deepEqual(tap(game, 3, 2, { want: CHECK }), { mark: EMPTY });
  assert.equal(game.marks[3][2], EMPTY);
  tap(game, 3, 2); // ✗
  assert.deepEqual(tap(game, 3, 2, { want: CHECK }), { mark: CHECK }, 'из ✗ — тоже сразу ✓');
});

test('✗ ничего не отмечает сам', () => {
  const game = newGame(puzzle);
  for (let t = 0; t < 4; t++) tap(game, 0, t);
  assert.equal(filled(game), 4);
  const d = view(game, N);
  assert.equal(d.flat().filter((m) => m !== EMPTY).length, 4);
  assert.equal(d[0][4], EMPTY);
});

test('после ✓ строка и колонка группы вычёркиваются только на виду; сняли ✓ — пропали и они', () => {
  const game = newGame(puzzle);
  tap(game, 1, 2, { want: CHECK });
  const d = view(game, N);
  for (let t = 0; t < N; t++) assert.equal(d[1][t], t === 2 ? CHECK : AUTO_CROSS);
  for (let r = 0; r < N; r++) if (r !== 1) assert.equal(d[r][2], AUTO_CROSS);
  // другие группы не трогаются
  for (let r = N; r < 15; r++) assert.equal(d[r][2], EMPTY);
  // в отметках игрока — только сама ✓
  assert.equal(filled(game), 1);
  tap(game, 1, 2, { want: CHECK });
  assert.ok(view(game, N).flat().every((m) => m === EMPTY), 'лишних ✗ не осталось');
  // и через обычный тап (✓ → пусто) тоже
  tap(game, 7, 0, { want: CHECK });
  tap(game, 7, 0);
  assert.ok(view(game, N).flat().every((m) => m === EMPTY));
});

test('клетку держит чужая ✓: { blocked } и ничего не меняется', () => {
  const game = newGame(puzzle);
  tap(game, 0, 2, { want: CHECK });
  const before = JSON.stringify(game);
  assert.deepEqual(tap(game, 0, 3), { blocked: [0, 2] }, 'та же строка');
  assert.deepEqual(tap(game, 4, 2), { blocked: [0, 2] }, 'та же колонка группы');
  assert.deepEqual(tap(game, 4, 2, { want: CHECK }), { blocked: [0, 2] });
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(blocker(game, N, 4, 2), [0, 2]);
  assert.equal(blocker(game, N, 5, 2), null, 'другая группа свободна');
  assert.deepEqual(tap(game, 5, 2), { mark: CROSS });
});

test('своя ✗ в занятой клетке снимается, но ✓ не становится', () => {
  const game = newGame(puzzle);
  tap(game, 0, 3); // ✗
  tap(game, 0, 2, { want: CHECK });
  assert.equal(view(game, N)[0][3], CROSS, 'видна своя ✗');
  assert.deepEqual(tap(game, 0, 3, { want: CHECK }), { blocked: [0, 2] });
  assert.equal(game.marks[0][3], CROSS);
  assert.deepEqual(tap(game, 0, 3), { mark: EMPTY });
  assert.equal(game.marks[0][3], EMPTY);
  assert.equal(view(game, N)[0][3], AUTO_CROSS);
  assert.deepEqual(tap(game, 0, 3), { blocked: [0, 2] });
});

test('упрощённый режим: последний вариант в строке и в колонке отмечается сам, по цепочке', () => {
  const easy = { easy: true };
  const game = newGame(puzzle);
  for (let t = 0; t < 4; t++) tap(game, 0, t, easy);
  let d = view(game, N, true);
  assert.equal(d[0][4], AUTO_CHECK);
  for (let r = 1; r < N; r++) assert.equal(d[r][4], AUTO_CROSS);
  assert.equal(view(game, N)[0][4], EMPTY, 'без упрощения — нет');
  assert.equal(filled(game), 4, 'в отметках только ✗ игрока');
  // цепочка: у строки 1 после автоматической ✗ в слоте 4 остался один слот
  for (let t = 0; t < 3; t++) tap(game, 1, t, easy);
  d = view(game, N, true);
  assert.equal(d[1][3], AUTO_CHECK);
  for (const r of [2, 3, 4]) assert.equal(d[r][3], AUTO_CROSS);
  // колонка группы: в колонке 0 мест остался один вариант
  for (const r of [5, 6, 7, 8]) tap(game, r, 0, easy);
  d = view(game, N, true);
  assert.equal(d[9][0], AUTO_CHECK);
  for (let t = 1; t < N; t++) assert.equal(d[9][t], AUTO_CROSS);
  // тап по автоматической ✓ ничего не меняет
  const before = JSON.stringify(game);
  assert.deepEqual(tap(game, 0, 4, easy), { mark: AUTO_CHECK });
  assert.deepEqual(tap(game, 9, 0, { easy: true, want: CHECK }), { mark: AUTO_CHECK });
  assert.equal(JSON.stringify(game), before);
  // а вот снять ✗ можно — и автоматическая ✓ пропадёт
  tap(game, 5, 0, easy);
  assert.equal(view(game, N, true)[9][0], EMPTY);
});

test('упрощённый режим не ломает отметку ✓', () => {
  const game = newGame(puzzle);
  for (const t of [0, 1, 2]) tap(game, 1, t, { easy: true });
  assert.deepEqual(tap(game, 1, 3, { easy: true, want: CHECK }), { mark: CHECK });
  assert.deepEqual(view(game, N, true)[1], [CROSS, CROSS, CROSS, CHECK, AUTO_CROSS]);
});

test('несколько тапов по одной клетке — один ход; прощёлкали по кругу — хода нет', () => {
  const game = newGame(puzzle);
  tap(game, 0, 0);
  tap(game, 0, 0);
  assert.equal(game.past.length, 1);
  assert.equal(undo(game), true);
  assert.equal(isBlank(game), true);
  assert.equal(undo(game), false);

  tap(game, 2, 2); // ✗ — отдельный ход
  tap(game, 0, 0);
  tap(game, 0, 0);
  tap(game, 0, 0); // снова пусто
  assert.equal(game.past.length, 1, 'круг по клетке не оставил хода');
  assert.equal(undo(game), true);
  assert.equal(isBlank(game), true);

  // тапы по другой клетке между ними — отдельные ходы
  const g2 = newGame(puzzle);
  tap(g2, 0, 0);
  tap(g2, 6, 1);
  tap(g2, 0, 0);
  assert.equal(g2.past.length, 3);
});

test('отмена и возврат: отметки и вычеркнутые улики', () => {
  const game = newGame(puzzle);
  tap(game, 0, 0); // ✗
  toggleClue(game, 2);
  tap(game, 7, 3, { want: CHECK });
  assert.deepEqual(game.struck, [2]);

  assert.equal(undo(game), true);
  assert.equal(game.marks[7][3], EMPTY);
  assert.deepEqual(game.struck, [2]);
  assert.equal(undo(game), true);
  assert.deepEqual(game.struck, []);
  assert.equal(game.marks[0][0], CROSS);
  assert.equal(undo(game), true);
  assert.equal(isBlank(game), true);
  assert.equal(undo(game), false);

  assert.equal(redo(game), true);
  assert.equal(game.marks[0][0], CROSS);
  assert.equal(redo(game), true);
  assert.deepEqual(game.struck, [2]);
  assert.equal(redo(game), true);
  assert.equal(game.marks[7][3], CHECK);
  assert.equal(redo(game), false);

  // после отмены новый ход стирает возврат
  undo(game);
  tap(game, 1, 1);
  assert.equal(redo(game), false);
  assert.equal(game.marks[7][3], EMPTY);
});

test('после отмены тап по той же клетке — новый ход', () => {
  const game = newGame(puzzle);
  tap(game, 0, 0);
  tap(game, 0, 1);
  undo(game);
  tap(game, 0, 0); // ✗ → ✓
  undo(game);
  assert.equal(game.marks[0][0], CROSS, 'отмена вернула ✗, а не пустую доску');
});

test('вычеркнуть улику и вернуть — каждое отменяется', () => {
  const game = newGame(puzzle);
  toggleClue(game, 0);
  toggleClue(game, 3);
  assert.deepEqual(game.struck, [0, 3]);
  toggleClue(game, 0);
  assert.deepEqual(game.struck, [3]);
  undo(game);
  assert.deepEqual([...game.struck].sort(), [0, 3]);
  undo(game);
  undo(game);
  assert.deepEqual(game.struck, []);
  assert.equal(undo(game), false);
});

test('начать заново: всё стирается, отменяется; на пустой доске — ничего', () => {
  const game = newGame(puzzle);
  assert.equal(reset(game), false);
  assert.equal(game.past.length, 0);
  tap(game, 0, 0, { want: CHECK });
  tap(game, 8, 4);
  toggleClue(game, 1);
  assert.equal(reset(game), true);
  assert.equal(isBlank(game), true);
  assert.equal(reset(game), false);
  assert.equal(undo(game), true);
  assert.equal(game.marks[0][0], CHECK);
  assert.equal(game.marks[8][4], CROSS);
  assert.deepEqual(game.struck, [1]);
  assert.equal(redo(game), true);
  assert.equal(isBlank(game), true);
});

test('история ограничена', () => {
  const game = newGame(puzzle);
  for (let i = 0; i < 400; i++) tap(game, i % 2 ? 0 : 6, i % 2 ? 0 : 3);
  assert.equal(game.past.length, 300);
  let undone = 0;
  while (undo(game)) undone++;
  assert.equal(undone, 300);
});

test('после конца дела ничего не меняется', () => {
  for (const finish of [(g) => giveUp(g), (g) => accuse(g, puzzle, answer())]) {
    const game = newGame(puzzle);
    tap(game, 0, 0);
    tap(game, 1, 1);
    undo(game);
    finish(game);
    assert.equal(isOver(game), true);
    const before = JSON.stringify(game);
    assert.equal(tap(game, 3, 3), null);
    assert.equal(undo(game), false);
    assert.equal(redo(game), false);
    assert.equal(reset(game), false);
    toggleClue(game, 0);
    assert.equal(accuse(game, puzzle, answer()), false);
    assert.equal(accuse(game, puzzle, { g: (puzzle.culprit + 1) % N, values: {} }), false);
    assert.equal(JSON.stringify(game), before);
  }
});

test('ошибки: вычеркнут правильный слот, отмечен неправильный; автоотметки не в счёт', () => {
  const game = newGame(puzzle);
  assert.deepEqual(mistakes(game, puzzle), []);
  tap(game, 0, truth[0]); // ✗ на правильном
  assert.deepEqual(mistakes(game, puzzle), [[0, truth[0]]]);
  undo(game);
  tap(game, 6, wrongSlot(6), { want: CHECK }); // ✓ на неправильном
  // его автоматические ✗ закрыли правильную клетку строки — это не ошибка игрока
  assert.equal(view(game, N)[6][truth[6]], AUTO_CROSS);
  assert.deepEqual(mistakes(game, puzzle), [[6, wrongSlot(6)]]);
  undo(game);
  tap(game, 6, truth[6], { want: CHECK });
  tap(game, 11, wrongSlot(11));
  assert.deepEqual(mistakes(game, puzzle), []);
});

test('posFromMarks: ✓ — один слот, ✗ — вычеркнутые', () => {
  const game = newGame(puzzle);
  tap(game, 0, 1);
  tap(game, 5, 3, { want: CHECK });
  const pos = posFromMarks(game, N);
  assert.equal(pos[0], 0b11101);
  assert.equal(pos[5], 0b01000);
  assert.equal(pos[6], 0b10111, 'автоматическая ✗ в колонке группы');
  assert.equal(pos[1], 0b11111);
});

// Пройти дело одними подсказками: сперва «куда смотреть», потом подробно — и сделать, что сказано.
function walk(p, easy) {
  const game = newGame(p);
  let steps = 0;
  for (; steps < 300; steps++) {
    const brief = hint(game, p, { easy });
    if (brief.kind === 'done') break;
    assert.equal(brief.kind, 'step', p.key);
    assert.deepEqual(brief.cells, [], 'без подробностей клетки не показываются');
    assert.ok(brief.text.length > 10);
    assert.ok(brief.rows.length + brief.slots.length > 0);
    const full = hint(game, p, { easy, detail: true, count: false });
    assert.equal(full.kind, 'step');
    assert.equal(full.key, brief.key, 'та же подсказка, только подробнее');
    assert.deepEqual([full.rows, full.slots, full.clue, full.check], [brief.rows, brief.slots, brief.clue, brief.check]);
    assert.ok(full.cells.length > 0);
    if (full.clue !== null) assert.ok(full.clue >= 0 && full.clue < p.clues.length);
    assert.equal(game.hints, steps + 1, 'одна подсказка — один счёт');
    for (const [r, t] of full.cells) {
      // в упрощённом режиме клетку могли уже вычеркнуть сами предыдущие ✗ этого же шага
      if (!full.check && view(game, p.suspects.length, easy)[r][t] === AUTO_CROSS) continue;
      const result = tap(game, r, t, { easy, want: full.check ? CHECK : null });
      assert.deepEqual(result, { mark: full.check ? CHECK : CROSS }, `${p.key}: ${r}:${t}`);
    }
    assert.deepEqual(mistakes(game, p), [], p.key);
  }
  const last = hint(game, p, { easy });
  assert.equal(last.text, DONE, p.key);
  assert.equal(game.hints, steps, 'итоговая подсказка не считается');
  return { game, steps };
}

test('подсказка находит ошибку первой', () => {
  const game = newGame(puzzle);
  tap(game, 7, truth[7]);
  const h = hint(game, puzzle);
  assert.equal(h.kind, 'mistake');
  assert.deepEqual(h.cells, [[7, truth[7]]]);
  assert.equal(h.check, false);
  assert.equal(game.hints, 1);
  hint(game, puzzle, { count: false });
  assert.equal(game.hints, 1);
  undo(game);
  assert.equal(hint(game, puzzle).kind, 'step');
});

test('по одним подсказкам дело проходится без ошибок — 15 дней, обычный и упрощённый режим', () => {
  for (const key of days(15, '2026-11-01')) {
    const p = dailyPuzzle(key);
    for (const easy of [false, true]) {
      const { game, steps } = walk(p, easy);
      assert.ok(steps > 0);
      const facts = culpritFacts(game, p, easy);
      const c = p.culprit;
      assert.equal(facts.g, c, key);
      assert.equal(facts.slot, p.solution[c][TIME], key);
      p.categories.forEach((_, k) => assert.equal(facts.values[k], p.solution[c][k], `${key}: категория ${k}`));
      assert.equal(accuse(game, p, { g: facts.g, values: facts.values }), true, key);
    }
  }
});

test('culpritFacts в начале почти пуст', () => {
  for (const key of days(10, '2026-11-01')) {
    const p = dailyPuzzle(key);
    const facts = culpritFacts(newGame(p), p);
    assert.equal(facts.g, null, key);
    const { k, v } = p.culpritClue;
    if (k === TIME) {
      // время преступника названо в главной улике — колонка известна сразу
      assert.equal(facts.slot, v);
      assert.deepEqual(facts.values, { [TIME]: v });
    } else {
      assert.equal(facts.slot, -1);
      assert.deepEqual(facts.values, {});
    }
  }
});

test('состояние улик: пусто в начале, всё сходится на правильном ответе', () => {
  const game = newGame(puzzle);
  for (const clue of puzzle.clues) assert.equal(clueState(game, puzzle, clue), null);
  assert.equal(progress(game, puzzle), 0);
  tickTruth(game);
  for (const clue of puzzle.clues) assert.equal(clueState(game, puzzle, clue), 'done', clue.type);
  assert.equal(progress(game, puzzle), 1);
});

test('состояние улик: противоречие, когда строки стоят не там', () => {
  const left = { type: 'left', a: { g: 0 }, b: { g: 1 } };
  const game = newGame(puzzle);
  tap(game, 0, 3, { want: CHECK });
  assert.equal(clueState(game, puzzle, left), null, 'про b ещё ничего не известно');
  tap(game, 1, 1, { want: CHECK });
  assert.equal(clueState(game, puzzle, left), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'left', a: { g: 1 }, b: { g: 0 } }), 'done');
  assert.equal(clueState(game, puzzle, { type: 'rightNext', a: { g: 0 }, b: { g: 1 } }), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'next', a: { g: 0 }, b: { g: 1 } }), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'notNext', a: { g: 0 }, b: { g: 1 } }), 'done');
  assert.equal(clueState(game, puzzle, { type: 'edge', a: { g: 0 } }), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'notEdge', a: { g: 0 } }), 'done');
  // «тот же человек»: строка человека и строка места в разных колонках
  tap(game, 7, 2, { want: CHECK });
  assert.equal(clueState(game, puzzle, { type: 'is', s: { g: 0 }, k: 1, v: 2 }), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'not', s: { g: 0 }, k: 1, v: 2 }), 'done');
  // прямо про время: «0-й пришёл в слот 2»
  assert.equal(clueState(game, puzzle, { type: 'is', s: { g: 0 }, k: TIME, v: 2 }), 'conflict');
  assert.equal(clueState(game, puzzle, { type: 'is', s: { g: 0 }, k: TIME, v: 3 }), 'done');
  // упрощённый режим тоже учитывается: автоматическая ✓ считается
  const easy = newGame(puzzle);
  for (const r of [0, 1, 3, 4]) tap(easy, r, 4, { easy: true });
  assert.equal(view(easy, N, true)[2][4], AUTO_CHECK);
  assert.equal(clueState(easy, puzzle, { type: 'edge', a: { g: 2 } }, true), 'done');
  assert.equal(clueState(easy, puzzle, { type: 'edge', a: { g: 2 } }), null);
});

test('состояние улики «не в это время»: отработана, как только клетка вычеркнута', () => {
  const not = { type: 'not', s: { g: 2 }, k: TIME, v: 3 };
  const game = newGame(puzzle);
  assert.equal(clueState(game, puzzle, not), null);
  tap(game, 2, 3);
  assert.equal(clueState(game, puzzle, not), 'done');
  tap(game, 2, 3); // ✗ → ✓
  assert.equal(clueState(game, puzzle, not), 'conflict');
  tap(game, 2, 3); // пусто
  tap(game, 2, 1, { want: CHECK }); // ✓ в другом слоте — клетка вычеркнута сама
  assert.equal(clueState(game, puzzle, not), 'done');
  // то же, если о времени говорит субъект: «тот, кто пришёл в слот 0, был не в месте 4»
  const g2 = newGame(puzzle);
  const place = { type: 'not', s: { k: TIME, v: 0 }, k: 1, v: 4 };
  assert.equal(clueState(g2, puzzle, place), null);
  tap(g2, 9, 0);
  assert.equal(clueState(g2, puzzle, place), 'done');
});

test('прогресс растёт от 0 до 1', () => {
  const game = newGame(puzzle);
  assert.equal(progress(game, puzzle), 0);
  tap(game, 0, truth[0], { want: CHECK });
  const one = progress(game, puzzle);
  assert.ok(one > 0 && one < 1);
  tap(game, 1, truth[1], { want: CHECK });
  assert.ok(progress(game, puzzle) > one);
  const g2 = newGame(puzzle);
  tickTruth(g2);
  assert.equal(progress(g2, puzzle), 1);
});

function answer(p = puzzle) {
  const c = p.culprit;
  return { g: c, values: Object.fromEntries(accuseCategories(p).map((k) => [k, p.solution[c][k]])) };
}

test('обвинение: нужно назвать всё верно', () => {
  const game = newGame(puzzle);
  const c = puzzle.culprit;
  const fields = accuseCategories(puzzle);
  assert.equal(fields.includes(puzzle.culpritClue.k), false);
  assert.equal(fields.length, puzzle.categories.length - 1);
  const right = answer().values;
  const wrongValue = { ...right, [fields[0]]: other(c, fields[0]) };
  assert.equal(accuse(game, puzzle, { g: c, values: wrongValue }), false);
  assert.equal(accuse(game, puzzle, { g: (c + 1) % N, values: right }), false);
  assert.equal(accuse(game, puzzle, { g: c, values: {} }), false);
  assert.equal(game.wrong, 3);
  assert.equal(game.solved, false);
  assert.equal(accuse(game, puzzle, { g: c, values: right }), true);
  assert.equal(game.solved, true);
  assert.equal(game.wrong, 3);
});

test('сдаться: дело закрыто, отметки и обвинения больше не принимаются', () => {
  const game = newGame(puzzle);
  assert.equal(isOver(game), false);
  giveUp(game);
  assert.equal(isOver(game), true);
  assert.equal(game.solved, false);
  assert.equal(game.gaveUp, true);
  tap(game, 0, 0);
  assert.equal(game.marks[0][0], EMPTY);
  assert.equal(accuse(game, puzzle, answer()), false);
  assert.equal(game.solved, false);
  // раскрытое дело сдать нельзя
  const won = newGame(puzzle);
  accuse(won, puzzle, answer());
  giveUp(won);
  assert.equal(won.gaveUp, false);
});

test('партия переживает сохранение в JSON посреди игры', () => {
  const game = newGame(puzzle);
  tap(game, 0, truth[0], { want: CHECK });
  tap(game, 6, wrongSlot(6));
  toggleClue(game, 1);
  tap(game, 13, wrongSlot(13));
  undo(game);
  const saved = JSON.parse(JSON.stringify(game));
  assert.deepEqual(saved, game);
  assert.deepEqual(view(saved, N), view(game, N));
  assert.equal(redo(saved), true);
  assert.equal(saved.marks[13][wrongSlot(13)], CROSS);
  assert.equal(undo(saved), true);
  assert.equal(undo(saved), true);
  assert.deepEqual(saved.struck, []);
  assert.deepEqual(tap(saved, 12, 0), { mark: CROSS });
  assert.equal(saved.past.length, 3);
  assert.ok(['step', 'mistake'].includes(hint(saved, puzzle).kind));
  // и дальше проходится до конца по подсказкам
  const again = JSON.parse(JSON.stringify(newGame(puzzle)));
  for (let i = 0; i < 300; i++) {
    const h = hint(again, puzzle, { detail: true });
    if (h.kind === 'done') break;
    for (const [r, t] of h.cells) tap(again, r, t, { want: h.check ? CHECK : null });
    const copy = JSON.parse(JSON.stringify(again));
    Object.assign(again, copy);
  }
  assert.equal(hint(again, puzzle).text, DONE);
});
