// Решатель, который рассуждает как человек.
//
// Состояние — что ещё возможно: poss[g][k] — битовая маска значений категории k,
// которые могут быть у подозреваемого g. Каждый шаг — одно простое рассуждение:
//   — по одной улике («Вера не была в подвале» → вычеркнуть подвал у Веры);
//   — «у человека остался один вариант» → у остальных его нет;
//   — «этот вариант возможен только у одного» → значит, он его.
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

export function fullState(n, k) {
  return Array.from({ length: n }, () => Array(k).fill(bit(n) - 1));
}

export const cloneState = (poss) => poss.map((row) => [...row]);

// Контекст решателя: размеры и улики.
export function context(puzzle) {
  return {
    n: puzzle.suspects.length,
    k: puzzle.categories.length,
    orderK: puzzle.categories.findIndex((c) => c.ordered),
    clues: puzzle.clues,
  };
}

const RELATIONS = {
  next: (s, t) => Math.abs(s - t) === 1,
  notNext: (s, t) => s !== t && Math.abs(s - t) !== 1,
  left: (s, t) => s < t,
  rightNext: (s, t) => s === t + 1,
};

export const isDirect = (clue) => (clue.type === 'is' || clue.type === 'not') && clue.s.g !== undefined;

// Один шаг рассуждения: { removals: [[g, k, v]], reason } или null, если ничего не выводится.
// reason: { kind: 'clue', index } | { kind: 'single', g, k, v } | { kind: 'only', g, k, v }
export function nextStep(ctx, poss) {
  const { n, k: K } = ctx;
  // 1. Прямые улики про конкретного человека.
  for (const [index, clue] of ctx.clues.entries()) {
    if (!isDirect(clue)) continue;
    const removals = applyClue(ctx, poss, clue);
    if (removals.length) return { removals, reason: { kind: 'clue', index } };
  }
  // 2. Один вариант у человека и один человек на вариант.
  for (let k = 0; k < K; k++) {
    for (let g = 0; g < n; g++) {
      const v = onlyValue(poss[g][k]);
      if (v < 0) continue;
      const removals = [];
      for (let h = 0; h < n; h++) if (h !== g && has(poss[h][k], v)) removals.push([h, k, v]);
      if (removals.length) return { removals, reason: { kind: 'single', g, k, v } };
    }
    for (let v = 0; v < n; v++) {
      const who = [];
      for (let g = 0; g < n; g++) if (has(poss[g][k], v)) who.push(g);
      if (who.length !== 1) continue;
      const g = who[0];
      const removals = [];
      for (let w = 0; w < n; w++) if (w !== v && has(poss[g][k], w)) removals.push([g, k, w]);
      if (removals.length) return { removals, reason: { kind: 'only', g, k, v } };
    }
  }
  // 3. Остальные улики: связи «тот, кто …» и порядок прихода.
  for (const [index, clue] of ctx.clues.entries()) {
    if (isDirect(clue)) continue;
    const removals = applyClue(ctx, poss, clue);
    if (removals.length) return { removals, reason: { kind: 'clue', index } };
  }
  return null;
}

// Что вычёркивает одна улика в текущем состоянии.
export function applyClue(ctx, poss, clue) {
  const { n, orderK } = ctx;
  const out = [];
  const remove = (g, k, v) => {
    if (has(poss[g][k], v) && !out.some(([a, b, c]) => a === g && b === k && c === v)) out.push([g, k, v]);
  };
  const couldBe = (s, g) => (s.g !== undefined ? s.g === g : has(poss[g][s.k], s.v));
  const surely = (s, g) => (s.g !== undefined ? s.g === g : poss[g][s.k] === bit(s.v));

  if (clue.type === 'is' || clue.type === 'not') {
    const { s, k, v } = clue;
    if (s.g !== undefined) {
      if (clue.type === 'not') remove(s.g, k, v);
      else for (let w = 0; w < n; w++) if (w !== v) remove(s.g, k, w);
      return out;
    }
    for (let g = 0; g < n; g++) {
      if (clue.type === 'is') {
        // у одного и того же человека: либо оба значения, либо ни одного
        if (!has(poss[g][k], v)) remove(g, s.k, s.v);
        if (!has(poss[g][s.k], s.v)) remove(g, k, v);
      } else {
        if (surely(s, g)) remove(g, k, v);
        if (poss[g][k] === bit(v)) remove(g, s.k, s.v);
      }
    }
    return out;
  }

  const slots = (g) => {
    const list = [];
    for (let t = 0; t < n; t++) if (has(poss[g][orderK], t)) list.push(t);
    return list;
  };
  // Оставить человеку g только те места в очереди, где он может быть субъектом a.
  const restrict = (a, g, ok) => {
    const feasible = slots(g).filter(ok);
    if (feasible.length === 0) {
      if (a.g === undefined) remove(g, a.k, a.v); // g не может быть «тем, кто …»
    } else if (surely(a, g)) {
      for (const t of slots(g)) if (!feasible.includes(t)) remove(g, orderK, t);
    }
  };

  if (clue.type === 'edge' || clue.type === 'notEdge') {
    const edge = (t) => t === 0 || t === n - 1;
    for (let g = 0; g < n; g++) {
      if (couldBe(clue.a, g)) restrict(clue.a, g, (t) => (clue.type === 'edge' ? edge(t) : !edge(t)));
    }
    return out;
  }

  const rel = RELATIONS[clue.type];
  const { a, b } = clue;
  for (let g = 0; g < n; g++) {
    if (!couldBe(a, g)) continue;
    restrict(a, g, (s) => {
      for (let h = 0; h < n; h++) {
        if (h === g || !couldBe(b, h)) continue;
        if (slots(h).some((t) => rel(s, t))) return true;
      }
      return false;
    });
  }
  for (let h = 0; h < n; h++) {
    if (!couldBe(b, h)) continue;
    restrict(b, h, (t) => {
      for (let g = 0; g < n; g++) {
        if (g === h || !couldBe(a, g)) continue;
        if (slots(g).some((s) => rel(s, t))) return true;
      }
      return false;
    });
  }
  return out;
}

export function applyRemovals(poss, removals) {
  for (const [g, k, v] of removals) poss[g][k] &= ~bit(v);
  return poss;
}

export const isSolved = (poss) => poss.every((row) => row.every((mask) => popcount(mask) === 1));
export const isBroken = (poss) => poss.some((row) => row.some((mask) => mask === 0));

// Известно ли всё о том, у кого значение v в категории k (о преступнике).
export function rowKnown(poss, k, v) {
  const g = poss.findIndex((row) => row[k] === bit(v));
  return g >= 0 && poss[g].every((mask) => popcount(mask) === 1);
}

// Решить до конца или пока не выполнится stop(poss): { poss, trace, solved, broken };
// trace — причины шагов по порядку.
export function solve(ctx, start = fullState(ctx.n, ctx.k), stop = null) {
  const poss = cloneState(start);
  const trace = [];
  for (;;) {
    if (isBroken(poss)) return { poss, trace, solved: false, broken: true };
    if (stop && stop(poss)) break;
    const step = nextStep(ctx, poss);
    if (!step) break;
    applyRemovals(poss, step.removals);
    trace.push(step.reason);
  }
  return { poss, trace, solved: isSolved(poss), broken: isBroken(poss) };
}
