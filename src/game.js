// Партия: отметки игрока, отмена, упрощённый режим, подсказка, обвинение.
// Всё состояние — простой объект, его можно сохранить как JSON.

import { bit, context, nextStep, rowKnown } from './logic.js';
import { stepText } from './text.js';

export const EMPTY = 0;
export const CROSS = 1;
export const CHECK = 2;

export function newGame(puzzle) {
  const n = puzzle.suspects.length;
  const K = puzzle.categories.length;
  return {
    marks: Array.from({ length: n }, () => Array.from({ length: K }, () => Array(n).fill(EMPTY))),
    history: [], // ходы для отмены: [[g, k, v, было], …]
    struck: [], // номера зачёркнутых улик
    wrong: 0, // неверные обвинения
    hints: 0,
    elapsed: 0, // секунды
    solved: false,
    gaveUp: false,
  };
}

// Дело закрыто: раскрыто или игрок сдался.
export const isOver = (game) => game.solved || game.gaveUp;

export function giveUp(game) {
  if (!game.solved) game.gaveUp = true;
}

// Тап по варианту. mode — что ставим: CROSS (✗) или CHECK (✓); повторный тап стирает.
// После ✓ остальное в строке и этот же вариант у других вычёркиваются сами — это учёт, а не логика.
// easy — упрощённый режим: последний невычеркнутый вариант ещё и отмечается сам.
export function tap(game, g, k, v, mode = CROSS, easy = false) {
  if (isOver(game)) return;
  const { marks } = game;
  const changes = [];
  const set = (g, k, v, value) => {
    const prev = marks[g][k][v];
    if (prev === value) return false;
    changes.push([g, k, v, prev]);
    marks[g][k][v] = value;
    return true;
  };
  set(g, k, v, marks[g][k][v] === mode ? EMPTY : mode);
  autoMarks(marks, set, easy);
  if (changes.length) game.history.push(changes);
}

// Автоотметки. Отметки игрока не трогаем — заполняем только пустые клетки.
function autoMarks(marks, set, easy) {
  const n = marks.length;
  const K = marks[0].length;
  const fill = (g, k, v, value) => marks[g][k][v] === EMPTY && set(g, k, v, value);
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 0; k < K; k++) {
      for (let g = 0; g < n; g++) {
        const v = marks[g][k].indexOf(CHECK);
        if (v < 0) continue;
        for (let w = 0; w < n; w++) if (w !== v && fill(g, k, w, CROSS)) changed = true;
        for (let h = 0; h < n; h++) if (h !== g && fill(h, k, v, CROSS)) changed = true;
      }
      if (!easy) continue;
      for (let g = 0; g < n; g++) {
        const row = marks[g][k];
        if (row.includes(CHECK)) continue;
        const open = row.flatMap((m, v) => (m === EMPTY ? [v] : []));
        if (open.length === 1 && fill(g, k, open[0], CHECK)) changed = true;
      }
      for (let v = 0; v < n; v++) {
        if (marks.some((row) => row[k][v] === CHECK)) continue;
        const open = marks.flatMap((row, g) => (row[k][v] === EMPTY ? [g] : []));
        if (open.length === 1 && fill(open[0], k, v, CHECK)) changed = true;
      }
    }
  }
}

export function undo(game) {
  const changes = game.history.pop();
  if (!changes) return false;
  for (let j = changes.length - 1; j >= 0; j--) {
    const change = changes[j];
    // в старых сохранениях был ещё признак доски: 'p' — люди, 't' — убранная доска по времени
    if (change.length === 5 && change[0] !== 'p') continue;
    const [g, k, v, prev] = change.length === 5 ? change.slice(1) : change;
    game.marks[g][k][v] = prev;
  }
  return true;
}

export function toggleClue(game, index) {
  const i = game.struck.indexOf(index);
  if (i >= 0) game.struck.splice(i, 1);
  else game.struck.push(index);
}

// Что игрок уже знает — в виде состояния решателя.
export function possFromMarks(game) {
  return game.marks.map((row) =>
    row.map((values) => {
      const checked = values.indexOf(CHECK);
      if (checked >= 0) return bit(checked);
      return values.reduce((mask, m, v) => (m === CROSS ? mask : mask | bit(v)), 0);
    }),
  );
}

// Неверные отметки: вычеркнут правильный вариант или отмечен неправильный.
export function mistakes(game, puzzle) {
  const out = [];
  game.marks.forEach((row, g) =>
    row.forEach((values, k) =>
      values.forEach((m, v) => {
        const truth = puzzle.solution[g][k] === v;
        if ((m === CROSS && truth) || (m === CHECK && !truth)) out.push([g, k, v]);
      }),
    ),
  );
  return out;
}

// Подсказка: сперва ошибка в отметках, иначе — что следует из очередной улики целиком.
// { kind: 'mistake' | 'step' | 'done', text, cells: [[g, k, v]], clue: номер улики или null }
export function hint(game, puzzle) {
  const wrong = mistakes(game, puzzle);
  if (wrong.length) {
    game.hints++;
    return { kind: 'mistake', cells: [wrong[0]], clue: null, text: 'Эта отметка не сходится с уликами.' };
  }
  const poss = possFromMarks(game);
  const { k, v } = puzzle.culpritClue;
  if (rowKnown(poss, k, v)) {
    return { kind: 'done', cells: [], clue: null, text: 'О преступнике известно всё. Пора выдвигать обвинение.' };
  }
  const step = nextStep(context(puzzle), poss);
  if (!step) return { kind: 'done', cells: [], clue: null, text: 'Дальше логикой не продвинуться — проверь отметки.' };
  game.hints++;
  return {
    kind: 'step',
    cells: step.removals,
    clue: step.reason.kind === 'clue' ? step.reason.index : null,
    text: stepText(puzzle, step, poss),
  };
}

// В обвинении называют преступника и всё, кроме того, что сказано в главной улике.
export const accuseCategories = (puzzle) =>
  puzzle.categories.map((_, k) => k).filter((k) => k !== puzzle.culpritClue.k);

// answer = { g, values: { [k]: v } }
export function accuse(game, puzzle, answer) {
  if (isOver(game)) return false;
  const { culprit, solution } = puzzle;
  const right = answer.g === culprit && accuseCategories(puzzle).every((k) => answer.values[k] === solution[culprit][k]);
  if (right) game.solved = true;
  else game.wrong++;
  return right;
}
