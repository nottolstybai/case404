// Партия: отметки игрока на доске, отмена и возврат, сброс, подсказка, обвинение.
// Всё состояние — простой объект, его можно сохранить как JSON.
//
// Доска: строки — люди, места и предметы (группами), колонки — время прихода.
// marks[row][slot] — что поставил сам игрок: пусто, ✗ или ✓.
// Автоотметки (после ✓ остальное в строке и в колонке группы вычёркивается) в партии не хранятся:
// view() каждый раз выводит их из отметок игрока. Снял ✓ — пропали и его автоматические ✗.

import { bit, clueRefs, context, culpritSlot, has, nextStep, onlyValue, ref, rowKnown, settled, solutionSlots } from './logic.js';
import { hintText } from './text.js';

export const EMPTY = 0;
export const CROSS = 1;
export const CHECK = 2;
export const AUTO_CROSS = 3;
export const AUTO_CHECK = 4;

const HISTORY_LIMIT = 300;

export const isCross = (m) => m === CROSS || m === AUTO_CROSS;
export const isCheck = (m) => m === CHECK || m === AUTO_CHECK;

export function newGame(puzzle) {
  const ctx = context(puzzle);
  return {
    marks: Array.from({ length: ctx.rows }, () => Array(ctx.n).fill(EMPTY)),
    struck: [], // номера улик, которые игрок отметил как отработанные
    past: [], // снимки для отмены
    future: [], // снимки для возврата
    last: null, // клетка последнего тапа: несколько тапов подряд по одной клетке — один ход
    wrong: 0, // неверные обвинения
    hints: 0,
    elapsed: 0, // секунды
    started: false,
    solved: false,
    gaveUp: false,
  };
}

// Дело закрыто: раскрыто или игрок сдался.
export const isOver = (game) => game.solved || game.gaveUp;

export function giveUp(game) {
  if (!game.solved) game.gaveUp = true;
}

// Доска, как её видит игрок: его отметки плюс автоматические.
// easy — упрощённый режим: последний оставшийся вариант отмечается сам.
export function view(game, n, easy = false) {
  const d = game.marks.map((row) => [...row]);
  const groups = d.length / n;
  for (let changed = true; changed; ) {
    changed = false;
    const fill = (r, t, value) => {
      if (d[r][t] !== EMPTY) return;
      d[r][t] = value;
      changed = true;
    };
    for (let g = 0; g < groups; g++) {
      for (let v = 0; v < n; v++) {
        const r = g * n + v;
        for (let t = 0; t < n; t++) {
          if (!isCheck(d[r][t])) continue;
          for (let u = 0; u < n; u++) if (u !== t) fill(r, u, AUTO_CROSS);
          for (let w = 0; w < n; w++) if (w !== v) fill(g * n + w, t, AUTO_CROSS);
        }
      }
      if (!easy) continue;
      for (let v = 0; v < n; v++) {
        const row = d[g * n + v];
        if (row.some(isCheck)) continue;
        const open = row.flatMap((m, t) => (m === EMPTY ? [t] : []));
        if (open.length === 1) fill(g * n + v, open[0], AUTO_CHECK);
      }
      for (let t = 0; t < n; t++) {
        const column = Array.from({ length: n }, (_, v) => d[g * n + v][t]);
        if (column.some(isCheck)) continue;
        const open = column.flatMap((m, v) => (m === EMPTY ? [v] : []));
        if (open.length === 1) fill(g * n + open[0], t, AUTO_CHECK);
      }
    }
  }
  return d;
}

const snapshot = (game) => `${game.marks.map((row) => row.join('')).join('')}|${game.struck.join(',')}`;

function restore(game, shot) {
  const [cells, struck] = shot.split('|');
  const n = game.marks[0].length;
  game.marks.forEach((row, r) => row.forEach((_, t) => (row[t] = +cells[r * n + t])));
  game.struck = struck ? struck.split(',').map(Number) : [];
}

// Запомнить доску перед ходом. cell — метка клетки: повторные тапы по ней не плодят ходы.
function remember(game, cell = null) {
  if (cell !== null && game.last === cell) return;
  game.past.push(snapshot(game));
  if (game.past.length > HISTORY_LIMIT) game.past.shift();
  game.future = [];
  game.last = cell;
}

// Ход ничего не изменил (клетку прощёлкали по кругу) — в отмене он не нужен.
function forgetIfSame(game) {
  if (game.past.length && game.past[game.past.length - 1] === snapshot(game)) {
    game.past.pop();
    game.last = null;
  }
}

// Какая ✓ мешает поставить ✓ в клетку (та же строка или та же колонка группы): [row, slot] или null.
export function blocker(game, n, r, t, easy = false) {
  const d = view(game, n, easy);
  const g = Math.floor(r / n);
  for (let u = 0; u < n; u++) if (u !== t && isCheck(d[r][u])) return [r, u];
  for (let w = 0; w < n; w++) if (g * n + w !== r && isCheck(d[g * n + w][t])) return [g * n + w, t];
  return null;
}

// Тап по клетке: пусто → ✗ → ✓ → пусто. want: CHECK — сразу ✓ (долгое нажатие, правая кнопка).
// Возвращает, что получилось: { mark } или { blocked: [row, slot] } — клетку держит чужая ✓.
export function tap(game, r, t, { easy = false, want = null } = {}) {
  if (isOver(game)) return null;
  const n = game.marks[0].length;
  const cur = game.marks[r][t];
  const block = blocker(game, n, r, t, easy);
  if (cur === EMPTY && view(game, n, easy)[r][t] === AUTO_CHECK) return { mark: AUTO_CHECK }; // уже отмечено само
  if (block && cur !== CROSS) return { blocked: block };
  let next;
  if (want === CHECK) next = cur === CHECK ? EMPTY : block ? cur : CHECK;
  else if (cur === EMPTY) next = CROSS;
  else if (cur === CROSS) next = block ? EMPTY : CHECK;
  else next = EMPTY;
  if (next === cur) return { blocked: block };
  remember(game, `${r}:${t}`);
  game.marks[r][t] = next;
  forgetIfSame(game);
  return { mark: next };
}

export function undo(game) {
  if (isOver(game) || !game.past.length) return false;
  game.future.push(snapshot(game));
  restore(game, game.past.pop());
  game.last = null;
  return true;
}

export function redo(game) {
  if (isOver(game) || !game.future.length) return false;
  game.past.push(snapshot(game));
  restore(game, game.future.pop());
  game.last = null;
  return true;
}

export const isBlank = (game) => game.struck.length === 0 && game.marks.every((row) => row.every((m) => m === EMPTY));

// Начать заново: чистая доска и улики. Отменяется, как обычный ход.
export function reset(game) {
  if (isOver(game) || isBlank(game)) return false;
  remember(game);
  game.marks.forEach((row) => row.fill(EMPTY));
  game.struck = [];
  return true;
}

export function toggleClue(game, index) {
  if (isOver(game)) return;
  remember(game);
  const i = game.struck.indexOf(index);
  if (i >= 0) game.struck.splice(i, 1);
  else game.struck.push(index);
}

// Что игрок уже знает — в виде состояния решателя.
export function posFromMarks(game, n, easy = false) {
  return view(game, n, easy).map((row) => {
    const checked = row.findIndex(isCheck);
    if (checked >= 0) return bit(checked);
    return row.reduce((mask, m, t) => (isCross(m) ? mask : mask | bit(t)), 0);
  });
}

// Неверные отметки игрока: вычеркнут правильный слот или отмечен неправильный.
export function mistakes(game, puzzle) {
  const truth = solutionSlots(puzzle);
  const out = [];
  game.marks.forEach((row, r) =>
    row.forEach((m, t) => {
      if ((m === CROSS && truth[r] === t) || (m === CHECK && truth[r] !== t)) out.push([r, t]);
    }),
  );
  return out;
}

// Состояние улики при нынешних отметках:
//   'done' — все, о ком она говорит, уже стоят на местах, и улика сходится;
//   'conflict' — все стоят на местах, но улика нарушена: где-то ошибка;
//   null — с уликой ещё можно работать.
export function clueState(game, puzzle, clue, easy = false) {
  const ctx = context(puzzle);
  const pos = posFromMarks(game, ctx.n, easy);
  const subjects = clue.type === 'is' || clue.type === 'not' ? [clue.s, { k: clue.k, v: clue.v }] : [clue.a, clue.b].filter(Boolean);
  const refs = subjects.map((s) => ref(ctx, s));
  const column = refs.find((r) => r.slot !== undefined);
  if (clue.type === 'not' && column) {
    // «Вера пришла не в 21:30» — отработана, как только клетка вычеркнута
    const { row } = refs.find((r) => r.row !== undefined);
    if (pos[row] === bit(column.slot)) return 'conflict';
    return has(pos[row], column.slot) ? null : 'done';
  }
  if (clue.type === 'is' && column) {
    // «Вера пришла в 21:30», а клетка вычеркнута — улика нарушена, даже если ✓ ещё нигде не стоит
    const { row } = refs.find((r) => r.row !== undefined);
    if (!has(pos[row], column.slot)) return 'conflict';
  }
  const at = refs.map((r) => r.slot ?? onlyValue(pos[r.row]));
  if (at.some((t) => t < 0)) return null;
  const edge = (t) => t === 0 || t === ctx.n - 1;
  const ok = {
    is: () => at[0] === at[1],
    not: () => at[0] !== at[1],
    next: () => Math.abs(at[0] - at[1]) === 1,
    notNext: () => at[0] !== at[1] && Math.abs(at[0] - at[1]) !== 1,
    left: () => at[0] < at[1],
    rightNext: () => at[0] === at[1] + 1,
    edge: () => edge(at[0]),
    notEdge: () => !edge(at[0]),
  }[clue.type]();
  return ok ? 'done' : 'conflict';
}

// Сколько строк доски уже стоит на месте — доля от всех (для музыки и счётчика).
export function progress(game, puzzle, easy = false) {
  const ctx = context(puzzle);
  const pos = posFromMarks(game, ctx.n, easy);
  return pos.filter((mask) => onlyValue(mask) >= 0).length / pos.length;
}

// Что на доске известно о преступнике: { slot, g, values: { [k]: v } } — чего не знаем, того нет.
export function culpritFacts(game, puzzle, easy = false) {
  const ctx = context(puzzle);
  const pos = posFromMarks(game, ctx.n, easy);
  const { k, v } = puzzle.culpritClue;
  const slot = culpritSlot(ctx, pos, k, v);
  const facts = { slot, g: null, values: {} };
  if (slot < 0) return facts;
  facts.values[ctx.orderK] = slot;
  ctx.groups.forEach((group, g) => {
    const value = settled(ctx, pos, g, slot);
    if (value < 0) return;
    if (group.k < 0) facts.g = value;
    else facts.values[group.k] = value;
  });
  return facts;
}

// Подсказка: сперва ошибка в отметках, иначе — очередной шаг решателя.
// detail: false — только куда смотреть; true — что именно отметить.
// { kind: 'mistake' | 'step' | 'done', text, cells: [[row, slot]], check, clue, rows, slots, key }
//   check — подсвеченную клетку надо отметить ✓ (иначе подсвеченное вычеркнуть);
//   key — отпечаток шага: по нему экран понимает, что это та же подсказка, только подробнее.
export function hint(game, puzzle, { easy = false, detail = false, count = true } = {}) {
  const ctx = context(puzzle);
  const wrong = mistakes(game, puzzle);
  if (wrong.length) {
    if (count) game.hints++;
    return { kind: 'mistake', cells: [wrong[0]], check: false, clue: null, rows: [], slots: [], key: `m${wrong[0]}`, text: 'Эта отметка не сходится с уликами. Сними её.' };
  }
  const pos = posFromMarks(game, ctx.n, easy);
  const { k, v } = puzzle.culpritClue;
  const none = { cells: [], check: false, clue: null, rows: [], slots: [], key: 'done' };
  if (rowKnown(ctx, pos, k, v)) {
    return { ...none, kind: 'done', text: 'О преступнике известно всё. Пора выдвигать обвинение.' };
  }
  const step = nextStep(ctx, pos);
  if (!step) return { ...none, kind: 'done', text: 'Дальше логикой не продвинуться — проверь отметки.' };
  if (count) game.hints++;
  const { reason } = step;
  const isClue = reason.kind === 'clue';
  const refs = isClue ? clueRefs(ctx, puzzle.clues[reason.index]) : { rows: [reason.row], slots: [reason.slot] };
  return {
    kind: 'step',
    cells: detail ? (isClue ? step.removals : [[reason.row, reason.slot]]) : [],
    check: !isClue,
    clue: isClue ? reason.index : null,
    rows: refs.rows,
    slots: refs.slots,
    key: isClue ? `c${reason.index}` : `${reason.kind}${reason.row}:${reason.slot}`,
    text: hintText(puzzle, step, detail),
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
