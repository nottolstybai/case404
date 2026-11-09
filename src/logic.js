// Решатель, который рассуждает как человек за доской.
//
// Доска — «хроника ночи»: колонки — время прихода по порядку (слоты 0…n-1),
// строки — люди, места и предметы. Строки идут группами по n:
// сначала люди, затем значения остальных категорий (кроме времени).
//
// Состояние: pos[r] — битовая маска слотов, где ещё может стоять строка r.
// Каждый шаг — одно простое рассуждение:
//   — по одной улике («Вера пришла раньше того, кто был в подвале» → вычеркнуть лишнее в обеих строках);
//   — «у строки остался один слот» → в этой колонке группы больше никого нет;
//   — «в колонке группы остался один вариант» → значит, это он.
// Шаги только верные: если улики правдивы, правильный ответ никогда не вычёркивается.
// Если так удаётся заполнить всё — ответ единственный и до него можно дойти без угадывания.

export const bit = (v) => 1 << v;
export const has = (mask, v) => (mask >> v) & 1;

export function popcount(mask) {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

export function onlyValue(mask) {
  return popcount(mask) === 1 ? Math.log2(mask) : -1;
}

// Контекст решателя: размеры, группы строк и улики.
// groups — [{ key, k }]: k — номер категории или -1 для людей.
export function context(puzzle) {
  const n = puzzle.suspects.length;
  const orderK = puzzle.categories.findIndex((c) => c.ordered);
  const groups = [{ key: 'who', k: -1 }];
  const groupOf = [];
  puzzle.categories.forEach((cat, k) => {
    if (k === orderK) return;
    groupOf[k] = groups.length;
    groups.push({ key: cat.key, k });
  });
  return { n, orderK, groups, groupOf, rows: groups.length * n, clues: puzzle.clues ?? [] };
}

// Субъект улики на доске: строка { row } или колонка { slot } (если речь о времени).
export function ref(ctx, s) {
  if (s.g !== undefined) return { row: s.g };
  if (s.k === ctx.orderK) return { slot: s.v };
  return { row: ctx.groupOf[s.k] * ctx.n + s.v };
}

// О чём улика: строки и колонки доски — чтобы подсветить их.
export function clueRefs(ctx, clue) {
  const subjects = clue.type === 'is' || clue.type === 'not' ? [clue.s, { k: clue.k, v: clue.v }] : [clue.a, clue.b].filter(Boolean);
  const refs = subjects.map((s) => ref(ctx, s));
  return { rows: refs.filter((r) => r.row !== undefined).map((r) => r.row), slots: refs.filter((r) => r.slot !== undefined).map((r) => r.slot) };
}

export function fullState(ctx) {
  return Array(ctx.rows).fill(bit(ctx.n) - 1);
}

// В каком слоте на самом деле стоит каждая строка.
export function solutionSlots(puzzle) {
  const ctx = context(puzzle);
  const { n, orderK } = ctx;
  const out = Array(ctx.rows).fill(-1);
  puzzle.solution.forEach((row, g) => {
    out[g] = row[orderK];
    row.forEach((v, k) => {
      if (k !== orderK) out[ctx.groupOf[k] * n + v] = row[orderK];
    });
  });
  return out;
}

const RELATIONS = {
  next: (s, t) => Math.abs(s - t) === 1,
  notNext: (s, t) => s !== t && Math.abs(s - t) !== 1,
  left: (s, t) => s < t,
  rightNext: (s, t) => s === t + 1,
};

// Улика, которая прямо говорит про клетку доски: «Вера пришла (не) в 21:30».
export function isDirect(ctx, clue) {
  if (clue.type !== 'is' && clue.type !== 'not') return false;
  return ref(ctx, clue.s).slot !== undefined || clue.k === ctx.orderK;
}

// Что вычёркивает одна улика в текущем состоянии: [[row, slot], …].
export function applyClue(ctx, pos, clue) {
  const { n } = ctx;
  const out = [];
  const seen = new Set();
  const remove = (r, t) => {
    if (!has(pos[r], t) || seen.has(r * n + t)) return;
    seen.add(r * n + t);
    out.push([r, t]);
  };
  const keep = (r, mask) => {
    for (let t = 0; t < n; t++) if (!has(mask, t)) remove(r, t);
  };

  if (clue.type === 'is' || clue.type === 'not') {
    const a = ref(ctx, clue.s);
    const b = ref(ctx, { k: clue.k, v: clue.v });
    if (a.slot !== undefined || b.slot !== undefined) {
      const r = a.row ?? b.row;
      const t = a.slot ?? b.slot;
      if (clue.type === 'is') keep(r, bit(t));
      else remove(r, t);
    } else if (clue.type === 'is') {
      // один и тот же человек: обе строки стоят в одной колонке
      const both = pos[a.row] & pos[b.row];
      keep(a.row, both);
      keep(b.row, both);
    } else {
      // разные люди: где точно стоит одна строка, там нет другой
      const ta = onlyValue(pos[a.row]);
      const tb = onlyValue(pos[b.row]);
      if (ta >= 0) remove(b.row, ta);
      if (tb >= 0) remove(a.row, tb);
    }
    return out;
  }

  if (clue.type === 'edge' || clue.type === 'notEdge') {
    const edges = bit(0) | bit(n - 1);
    keep(ref(ctx, clue.a).row, clue.type === 'edge' ? edges : ~edges);
    return out;
  }

  const rel = RELATIONS[clue.type];
  if (!rel) throw new Error(`unknown clue ${clue.type}`);
  const ra = ref(ctx, clue.a).row;
  const rb = ref(ctx, clue.b).row;
  for (let s = 0; s < n; s++) {
    if (!has(pos[ra], s)) continue;
    let ok = false;
    for (let t = 0; t < n && !ok; t++) ok = has(pos[rb], t) && rel(s, t);
    if (!ok) remove(ra, s);
  }
  for (let t = 0; t < n; t++) {
    if (!has(pos[rb], t)) continue;
    let ok = false;
    for (let s = 0; s < n && !ok; s++) ok = has(pos[ra], s) && rel(s, t);
    if (!ok) remove(rb, t);
  }
  return out;
}

// Один шаг рассуждения: { removals: [[row, slot]], reason } или null, если ничего не выводится.
// reason: { kind: 'clue', index } | { kind: 'single', row, slot } | { kind: 'only', row, slot }
export function nextStep(ctx, pos) {
  const { n } = ctx;
  // 1. Улики про конкретную клетку.
  for (const [index, clue] of ctx.clues.entries()) {
    if (!isDirect(ctx, clue)) continue;
    const removals = applyClue(ctx, pos, clue);
    if (removals.length) return { removals, reason: { kind: 'clue', index } };
  }
  // 2. Один слот у строки и одна строка на слот — внутри группы.
  for (let g = 0; g < ctx.groups.length; g++) {
    for (let v = 0; v < n; v++) {
      const row = g * n + v;
      const slot = onlyValue(pos[row]);
      if (slot < 0) continue;
      const removals = [];
      for (let w = 0; w < n; w++) if (w !== v && has(pos[g * n + w], slot)) removals.push([g * n + w, slot]);
      if (removals.length) return { removals, reason: { kind: 'single', row, slot } };
    }
    for (let slot = 0; slot < n; slot++) {
      const rows = [];
      for (let v = 0; v < n; v++) if (has(pos[g * n + v], slot)) rows.push(g * n + v);
      if (rows.length !== 1) continue;
      const row = rows[0];
      const removals = [];
      for (let t = 0; t < n; t++) if (t !== slot && has(pos[row], t)) removals.push([row, t]);
      if (removals.length) return { removals, reason: { kind: 'only', row, slot } };
    }
  }
  // 3. Остальные улики: связи «тот, кто …» и порядок прихода.
  for (const [index, clue] of ctx.clues.entries()) {
    if (isDirect(ctx, clue)) continue;
    const removals = applyClue(ctx, pos, clue);
    if (removals.length) return { removals, reason: { kind: 'clue', index } };
  }
  return null;
}

export function applyRemovals(pos, removals) {
  for (const [r, t] of removals) pos[r] &= ~bit(t);
  return pos;
}

export const isSolved = (pos) => pos.every((mask) => popcount(mask) === 1);
export const isBroken = (pos) => pos.some((mask) => mask === 0);

// Колонка преступника: слот того, у кого значение v в категории k; -1 — ещё неизвестна.
export function culpritSlot(ctx, pos, k, v) {
  if (k === ctx.orderK) return v;
  return onlyValue(pos[ctx.groupOf[k] * ctx.n + v]);
}

// Кто (или что) точно стоит в колонке slot в группе g: номер значения или -1.
export function settled(ctx, pos, g, slot) {
  for (let v = 0; v < ctx.n; v++) if (pos[g * ctx.n + v] === bit(slot)) return v;
  return -1;
}

// Известно ли всё о том, у кого значение v в категории k (о преступнике).
export function rowKnown(ctx, pos, k, v) {
  const slot = culpritSlot(ctx, pos, k, v);
  return slot >= 0 && ctx.groups.every((_, g) => settled(ctx, pos, g, slot) >= 0);
}

// Решить до конца или пока не выполнится stop(pos): { pos, trace, solved, broken };
// trace — причины шагов по порядку.
export function solve(ctx, start = fullState(ctx), stop = null) {
  const pos = [...start];
  const trace = [];
  for (;;) {
    if (isBroken(pos)) return { pos, trace, solved: false, broken: true };
    if (stop && stop(pos)) break;
    const step = nextStep(ctx, pos);
    if (!step) break;
    applyRemovals(pos, step.removals);
    trace.push(step.reason);
  }
  return { pos, trace, solved: isSolved(pos), broken: isBroken(pos) };
}
