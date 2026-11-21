// «Лжёт только виновный» — дело с показаниями.
//
// У каждого из пятерых две фразы — показания. Невиновные говорят правду, виновный лжёт в каждой фразе.
// Ещё несколько фактов протокола — они верны всегда. Главной улики нет: кто лжёт, тот и преступник.
//
// Как это решает человек. Две фразы разных людей, которые не могут быть верны вместе, — противоречие:
// один из этих двоих лжёт. Противоречие в деле одно и неочевидное (не «был — не был»), поэтому под
// подозрением остаются двое. Второго опровергают рассуждением: «допустим, лжёт он» → его фразы наоборот,
// остальные верны → через несколько шагов противоречие. Значит, лжёт первый. Его фразы переворачивают —
// ложь тоже сведения — и обычными шагами узнают о нём всё: время, место, вещь.
//
// Генератор строит дело под этот путь и проверяет каждое звено:
//   1. расклад, преступник и соперник — тот, кто окажется с ним в противоречии;
//   2. две лжи преступника — однозначно переворачиваемые; перевёрнутые, они дают сильный факт;
//   3. фраза соперника, несовместимая с одной из лжей; других противоречий нет;
//   4. остальные фразы — правда, каждая выбрана из тех, что двигают разгадку;
//   5. факты протокола — только если без них не обойтись, и не о преступнике напрямую.
// Затем: протокол сам лжеца не выдаёт; версия «лжёт соперник» опровергается за 3–12 шагов решателя;
// при верной версии решатель узнаёт о лжеце всё; почти все фразы участвуют в решении.
// Несовместимость фраз проверяется перебором, остальное — решателем logic.js, который делает только
// верные шаги. Поэтому ответ единственный и находится без угадывания.

import { hashString, mulberry32, randInt, shuffle } from './rng.js';
import { isTrue, orderIndex } from './puzzle.js';
import { applyRemovals, context, culpritSlot, fullState, nextStep, onlyValue, popcount, settled, solve } from './logic.js';
import { randomSolution } from './generator.js';
import { buildPuzzle, caseNumber, deck, isDateKey } from './daily.js';
import { THEME_KEYS } from './themes.js';

export const TESTIMONY = {
  attempts: 1500, // раскладов на попытку собрать дело (трудное дело — редкая удача, его заготавливают заранее)
  sample: 40, // сколько фраз-кандидатов сравнивать на каждое место
  minEvidence: 2, // протокол есть всегда
  maxEvidence: 6,
  maxRivalSteps: 14, // неверную версию опровергают без изнурительной цепочки
  herring: 5, // ложный след уровня 3: опровергнуть версию можно, только сведя вместе столько фраз и фактов
  maxExact: 2, // фраз с точным временем («пришёл в 22:00») — не больше
  leftover: 2, // хотя бы одна примета лжеца выясняется, пока свободны ещё хотя бы две клетки её группы
  minSteps: 14, // после разоблачения — не прямая подсказка, а работа на доске
  minUsed: 8, // из 10 фраз в решении участвуют хотя бы столько
};

/* ---------- фразы ---------- */

const person = (s) => s.g !== undefined;
const subjectsOf = (c) => (c.type === 'is' || c.type === 'not' ? [c.s, { k: c.k, v: c.v }] : [c.a, c.b].filter(Boolean));

// Обратная фраза, которую человек прочтёт однозначно; null — такую фразу в показания не даём.
// «Я пришёл раньше Павла» наоборот — «Павел пришёл раньше меня»: годится, только если оба — люди
// (у «того, кто был в подвале» «наоборот» может значить и «это один и тот же человек»).
export function negate(c) {
  const keep = { by: c.by, say: c.say };
  switch (c.type) {
    case 'is':
      return { ...c, type: 'not' };
    case 'not':
      return { ...c, type: 'is' };
    case 'edge':
      return { ...c, type: 'notEdge' };
    case 'notEdge':
      return { ...c, type: 'edge' };
    case 'left':
      return person(c.a) && person(c.b) ? { type: 'left', a: c.b, b: c.a, ...keep } : null;
    case 'next':
      return person(c.a) && person(c.b) ? { ...c, type: 'notNext' } : null;
    case 'notNext':
      return person(c.a) && person(c.b) ? { ...c, type: 'next' } : null;
    default:
      return null;
  }
}

// Все фразы о деле — верные и неверные.
function allClues(puzzle) {
  const n = puzzle.suspects.length;
  const orderK = orderIndex(puzzle);
  const people = puzzle.suspects.map((_, g) => ({ g }));
  const attrs = [];
  puzzle.categories.forEach((_, k) => {
    for (let v = 0; v < n; v++) attrs.push({ k, v });
  });
  const out = [];
  for (const s of [...people, ...attrs]) {
    puzzle.categories.forEach((_, k) => {
      if (s.k === k) return;
      for (let v = 0; v < n; v++) out.push({ type: 'is', s, k, v }, { type: 'not', s, k, v });
    });
  }
  // как в puzzle.trueClues: «тот, кто пришёл в 21:30, пришёл раньше…» не говорим
  const named = [...people, ...attrs.filter((s) => s.k !== orderK)];
  named.forEach((a, i) => {
    out.push({ type: 'edge', a }, { type: 'notEdge', a });
    named.forEach((b, j) => {
      if (i === j) return;
      if (i < j) out.push({ type: 'next', a, b }, { type: 'notNext', a, b });
      out.push({ type: 'left', a, b }, { type: 'rightNext', a, b });
    });
  });
  return out;
}

/* ---------- перебор по нужным категориям ---------- */

const PERMS = new Map();
function perms(n) {
  if (!PERMS.has(n)) {
    const build = (m) => (m === 0 ? [[]] : build(m - 1).flatMap((p) => Array.from({ length: m }, (_, i) => [...p.slice(0, i), m - 1, ...p.slice(i)])));
    PERMS.set(n, build(n));
  }
  return PERMS.get(n);
}

function categoriesOf(c, orderK) {
  const set = new Set();
  if (c.type === 'is' || c.type === 'not') set.add(c.k);
  else set.add(orderK);
  for (const s of subjectsOf(c)) if (s.k !== undefined) set.add(s.k);
  return set;
}

// Могут ли фразы быть верны вместе. Перебираем только категории, о которых они говорят.
export function satisfiable(puzzle, clues) {
  const n = puzzle.suspects.length;
  const orderK = orderIndex(puzzle);
  const cats = [...new Set(clues.flatMap((c) => [...categoriesOf(c, orderK)]))].sort((a, b) => a - b);
  const checks = cats.map(() => []);
  for (const c of clues) checks[Math.max(...[...categoriesOf(c, orderK)].map((k) => cats.indexOf(k)))].push(c);
  const sol = Array.from({ length: n }, () => Array(puzzle.categories.length).fill(-1));
  const walk = (i) => {
    if (i === cats.length) return true;
    for (const p of perms(n)) {
      for (let g = 0; g < n; g++) sol[g][cats[i]] = p[g];
      if (checks[i].every((c) => isTrue(c, sol, n, orderK)) && walk(i + 1)) return true;
    }
    return false;
  };
  return walk(0);
}

/* ---------- версии ---------- */

// Всё ли известно о человеке g: время, место, предмет.
function personKnown(ctx, pos, g) {
  const slot = onlyValue(pos[g]);
  return slot >= 0 && ctx.groups.every((_, group) => settled(ctx, pos, group, slot) >= 0);
}

// Улики при версии «лжёт L»: его фразы наоборот, остальные — как сказаны, факты протокола — как есть.
export function version(puzzle, L) {
  return [...puzzle.statements.flatMap((st, g) => st.map((c) => (g === L ? negate(c) : c))), ...puzzle.evidence];
}

// Решатель при версии «лжёт L»: { broken, known, steps }.
export function tryVersion(puzzle, L) {
  const ctx = context({ ...puzzle, clues: version(puzzle, L) });
  const r = solve(ctx, fullState(ctx), (p) => personKnown(ctx, p, L));
  return { broken: r.broken, known: !r.broken && personKnown(ctx, r.pos, L), steps: r.trace.length, pos: r.pos };
}

// Противоречия — наборы фраз, которые вместе с протоколом не могут быть верны, хотя любая их часть может:
// одна фраза против протокола, пара фраз, тройка («треугольник»: любые две совместимы, все три — нет).
// Неверные фразы бывают только у лжеца, значит, в каждом наборе есть его фраза: если лжец известен
// (генератор, тесты), смотрим только такие наборы.
// Возвращает [{ size, at: [[g, i], …], protocol }] — g — кто сказал, i — какая фраза; protocol — нужен ли протокол.
export function conflicts(puzzle, maxSize = 3) {
  const { statements, evidence } = puzzle;
  const items = statements.flatMap((st, g) => st.map((c, i) => ({ c, at: [g, i] })));
  const liar = puzzle.culprit;
  const hasLie = (list) => liar === undefined || list.some((x) => x.at[0] === liar);
  const memo = new Map();
  const ok = (list) => {
    const key = list.map((x) => x.at.join(':')).join('|');
    if (!memo.has(key)) {
      const clues = [...list.map((x) => x.c), ...evidence];
      // решатель нашёл противоречие — оно есть; не нашёл — решает перебор
      memo.set(key, !solve(context({ ...puzzle, clues })).broken && satisfiable(puzzle, clues));
    }
    return memo.get(key);
  };
  const sets = [];
  const within = (list) => sets.some((s) => s.at.every((a) => list.some((x) => x.at.join() === a.join())));
  const combos = (size, from = 0, acc = []) => {
    if (acc.length === size) {
      if (hasLie(acc) && !within(acc) && !ok(acc)) {
        // protocol: без фактов протокола эти фразы совместимы — противоречие видно только вместе с ними
        const protocol = evidence.length > 0 && satisfiable(puzzle, acc.map((x) => x.c));
        sets.push({ size, at: acc.map((x) => x.at), protocol });
      }
      return;
    }
    for (let i = from; i < items.length; i++) combos(size, i + 1, [...acc, items[i]]);
  };
  for (let size = 1; size <= maxSize; size++) combos(size);
  return sets;
}

// Кого противоречия оставляют под подозрением: лжец есть в каждом наборе.
export function suspectsLeft(puzzle, found = conflicts(puzzle)) {
  let left = puzzle.suspects.map((_, g) => g);
  for (const set of found) left = left.filter((x) => set.at.some(([g]) => g === x));
  return left;
}

/* ---------- генератор ---------- */

function progressScore(ctx, pos, g) {
  const slot = onlyValue(pos[g]);
  const facts = slot < 0 ? 0 : 1 + ctx.groups.filter((_, group) => settled(ctx, pos, group, slot) >= 0).length;
  const crossed = pos.reduce((sum, mask) => sum + ctx.n - popcount(mask), 0);
  return facts * 10 + crossed;
}

const keyOf = (c) => JSON.stringify([c.type, c.s, c.k, c.v, c.a, c.b]);
const literal = (a, b) => keyOf(negate(a)) === keyOf(b);
// Перевёрнутая ложь — сильный факт: «не был в склепе» → «был в склепе», «первым или последним» → «в середине».
// «Я не был на берегу» наоборот — готовый ответ, такая ложь редка; чаще — про порядок и про других.
const STRONG_LIE = { not: 1, edge: 3, left: 3, notNext: 2, is: 2, notEdge: 2, next: 2 };

function weighted(rand, items, weight) {
  let r = rand() * items.reduce((sum, x) => sum + weight(x), 0);
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
}

// Без каких улик не обойтись (жадно выбрасываем лишние): items — [{ clue, from }], ok(clues) — условие.
function needed(items, ok) {
  let need = [...items];
  for (const item of items) {
    const rest = need.filter((x) => x !== item);
    if (ok(rest.map((x) => x.clue))) need = rest;
  }
  return need;
}

// Какие фразы участвуют в решении: в противоречиях, в опровержении соперников, в разгадке после разоблачения.
// Возвращает { used: Set('g:i'), lieUsed } — lieUsed: перевёрнутая ложь нужна для разгадки.
export function usage(puzzle, found = conflicts(puzzle)) {
  const items = (L) => [
    ...puzzle.statements.flatMap((st, g) => st.map((c, i) => ({ clue: g === L ? negate(c) : c, from: `${g}:${i}` }))),
    ...puzzle.evidence.map((c, i) => ({ clue: c, from: `e${i}` })),
  ];
  const known = (clues) => {
    const ctx = context({ ...puzzle, clues });
    return personKnown(ctx, solve(ctx, fullState(ctx), (p) => personKnown(ctx, p, puzzle.culprit)).pos, puzzle.culprit);
  };
  const broken = (clues) => solve(context({ ...puzzle, clues })).broken;
  const used = new Set();
  for (const set of found) for (const [g, i] of set.at) used.add(`${g}:${i}`);
  const solveNeed = needed(items(puzzle.culprit), known);
  solveNeed.forEach((x) => used.add(x.from));
  for (const r of puzzle.rivals ?? []) needed(items(r), broken).forEach((x) => used.add(x.from));
  const lieUsed = solveNeed.some((x) => x.from.startsWith(`${puzzle.culprit}:`));
  return { used: new Set([...used].filter((x) => !x.startsWith('e'))), lieUsed };
}

// Сколько фраз и фактов нужно, чтобы опровергнуть версию «лжёт L»: минимальный набор (жадно).
// Это мера для человека: решатель считает и мелкие шаги, а человек смотрит, сколько сведений свести вместе.
// Возвращает { size, protocol } — protocol: среди нужного есть факты протокола.
export function refutation(puzzle, L) {
  const items = [
    ...puzzle.statements.flatMap((st, g) => st.map((c) => ({ clue: g === L ? negate(c) : c, from: 's' }))),
    ...puzzle.evidence.map((c) => ({ clue: c, from: 'e' })),
  ];
  const broken = (clues) => solve(context({ ...puzzle, clues })).broken;
  if (!broken(items.map((x) => x.clue))) return { size: Infinity, protocol: false };
  const need = needed(items, broken);
  return { size: need.length, protocol: need.some((x) => x.from === 'e') };
}

// Честный минимум: сколько фраз и фактов нужно свести вместе, чтобы версия «лжёт L» пришла к противоречию.
// Человек ищет самый короткий путь, поэтому мерить надо минимум, а не любой неупрощаемый набор.
// Перебираем наборы по возрастанию; противоречие видит решатель, а в парах — ещё и перебор (лобовое «был — не был»).
// Возвращает размер или cap + 1, если до cap противоречия нет.
export function minRefutation(puzzle, L, cap = 6) {
  const items = [...puzzle.statements.flatMap((st, g) => st.map((c) => (g === L ? negate(c) : c))), ...puzzle.evidence];
  const bad = (clues) => solve(context({ ...puzzle, clues })).broken || (clues.length === 2 && !satisfiable(puzzle, clues));
  for (let size = 1; size <= cap; size++) {
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      if (bad(idx.map((i) => items[i]))) return size;
      let i = size - 1;
      while (i >= 0 && idx[i] === items.length - size + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return cap + 1;
}

// Узнаётся ли всё о лжеце без одной из его перевёрнутых фраз (drop — какой). Если да — эта ложь как улика не нужна.
export function knownWithoutLie(puzzle, drop) {
  const c = puzzle.culprit;
  const lies = puzzle.statements[c].filter((_, i) => i !== drop).map(negate);
  const clues = [...puzzle.statements.filter((_, g) => g !== c).flat(), ...lies, ...puzzle.evidence];
  const ctx = context({ ...puzzle, clues });
  return personKnown(ctx, solve(ctx, fullState(ctx), (p) => personKnown(ctx, p, c)).pos, c);
}

// Не «остатком» ли достаются приметы лжеца. Идём шагами решателя при верной версии и смотрим, сколько других
// мест (вещей) уже стоит на своих местах, когда выясняется место (вещь) лжеца. Возвращаем меньшее из двух:
// 4 — обе приметы — последние свободные клетки; 0–2 — хотя бы одна выведена рассуждением.
export function settledBefore(puzzle) {
  const ctx = context({ ...puzzle, clues: version(puzzle, puzzle.culprit) });
  const { n } = ctx;
  const c = puzzle.culprit;
  const rows = ctx.groups.flatMap((group, gi) => (group.k < 0 ? [] : [gi * n + puzzle.solution[c][group.k]]));
  const seen = new Map();
  const pos = fullState(ctx);
  for (let guard = 0; guard < 500; guard++) {
    for (const r of rows) {
      if (seen.has(r) || onlyValue(pos[r]) < 0) continue;
      const g = Math.floor(r / n);
      seen.set(r, Array.from({ length: n }, (_, v) => g * n + v).filter((x) => x !== r && onlyValue(pos[x]) >= 0).length);
    }
    if (seen.size === rows.length) break;
    const step = nextStep(ctx, pos);
    if (!step) break;
    applyRemovals(pos, step.removals);
  }
  return seen.size === rows.length ? Math.min(...seen.values()) : Infinity;
}

// Уровень по дню недели: пн–вт — 1, ср–чт — 2, пт–вс — 3. Случайные дела — 1 или 2.
export function levelOf(key, rand) {
  if (!isDateKey(key)) return 1 + randInt(rand, 2); // дело по коду собирается в браузере — без трудного уровня
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 — воскресенье
  return [3, 1, 1, 2, 2, 3, 3][day];
}

// Как устроено дело (kind) — чтобы дни не были похожи друг на друга:
//   triangle — «треугольник»: три фразы вместе неверны, любые две — нет; под подозрением трое;
//   protocol — две фразы неверны только вместе с фактом протокола о месте или вещи: одним порядком
//              прихода лжеца не найти; под подозрением двое;
//   quiet    — видимого противоречия нет вовсе: лжеца находят, проверяя версии.
// Уровень — сколько сведений нужно, чтобы опровергнуть самую стойкую неверную версию (честный минимум):
//   1 — не меньше трёх (только triangle);
//   2 — не меньше четырёх (triangle или protocol);
//   3 — не меньше herring, и среди них факт протокола: ложный след, который проходит порядок прихода
//       и рушится на местах и вещах (protocol или quiet).
function attempt(rand, base, options, level) {
  // почему расклад не подошёл — для настройки (options.stats)
  const fail = (why) => {
    if (options.stats) options.stats[why] = (options.stats[why] ?? 0) + 1;
    return null;
  };
  const { solution, suspects } = base;
  const n = suspects.length;
  const orderK = orderIndex(base);
  const culprit = randInt(rand, n);
  const others = suspects.map((_, g) => g).filter((g) => g !== culprit);
  const all = allClues(base);
  const truth = (c) => isTrue(c, solution, n, orderK);
  const holderOf = (s) => (s.g !== undefined ? s.g : solution.findIndex((row) => row[s.k] === s.v));
  // никто, кроме самого лжеца, не называет его примет напрямую: «у Ольги верёвка», «в кабинете была Ольга»
  const names = (c) => c.type === 'is' && subjectsOf(c).some((s) => holderOf(s) === culprit);
  const sayable = all.filter((c) => negate(c) && truth(c) && !names(c));
  const lies = all.filter((c) => negate(c) && !truth(c) && truth(negate(c)));
  const about = (c, g) => subjectsOf(c).some((s) => s.g === g);
  const aboutOther = (c, g) => subjectsOf(c).some((s) => person(s) && s.g !== g);

  // ложь: первая — о себе, вторая — о другом; перевёрнутые, они дают сильный факт
  const lie1 = weighted(rand, lies.filter((c) => about(c, culprit)), (c) => STRONG_LIE[c.type]);
  const lie2Pool = shuffle(rand, lies.filter((c) => c !== lie1 && aboutOther(c, culprit))).filter((c) => satisfiable(base, [lie1, c]));
  if (!lie1 || !lie2Pool.length) return fail('ложь');
  const lie2 = weighted(rand, lie2Pool.slice(0, 40), (c) => STRONG_LIE[c.type]);
  const statements = suspects.map(() => []);
  statements[culprit] = [lie1, lie2];
  const taken = new Set([lie1, lie2].map(keyOf));
  const put = (g, c) => {
    statements[g].push(c);
    taken.add(keyOf(c));
  };
  const free = (c) => !taken.has(keyOf(c));
  // «пришёл в 22:00» — точное время: такие фразы выдают противоречие с одного взгляда, их немного
  const exact = (c) => (c.type === 'is' || c.type === 'not') && (c.k === orderK || c.s.k === orderK);
  const exactLeft = () => options.maxExact - statements.flat().filter(exact).length;
  const quickSat = (clues) => !solve(context({ ...base, clues })).broken && satisfiable(base, clues);
  const pairOk = (c) => quickSat([c, lie1]) && quickSat([c, lie2]);

  const quiet = (c) => !subjectsOf(c).some((s) => holderOf(s) === culprit);
  const touchesGrid = (c) => [...categoriesOf(c, orderK)].some((k) => k !== orderK); // о месте или вещи
  const required = []; // факты протокола, без которых нет противоречия
  let clashLie = null; // ложь, на которой построено противоречие; другая должна пригодиться для разгадки
  const witnesses = shuffle(rand, others);
  const kind = level === 1 ? 'triangle' : level === 2 ? (rand() < 0.5 ? 'triangle' : 'protocol') : rand() < 0.5 ? 'protocol' : 'quiet';
  if (kind === 'quiet') {
    // ничего не строим: остальные фразы подберутся так, чтобы лобовых противоречий не было
  } else if (kind === 'protocol') {
    // ложь + фраза A + факт протокола о месте или вещи: вместе неверны, любые два совместимы
    const a = witnesses[0];
    const solveFrom = (clues, start) => solve(context({ ...base, clues }), start);
    const facts = shuffle(rand, all.filter((c) => truth(c) && quiet(c) && free(c) && touchesGrid(c))).slice(0, 200);
    let found = null;
    search: for (const lie of rand() < 0.5 ? [lie1, lie2] : [lie2, lie1]) {
      for (const tA of shuffle(rand, sayable.filter((c) => free(c) && !exact(c) && (about(c, a) || aboutOther(c, a)))).slice(0, 80)) {
        const withA = solveFrom([lie, tA]);
        if (withA.broken) continue;
        for (const e of facts) {
          if (!solveFrom([lie, tA, e], withA.pos).broken) continue;
          if (!solveFrom([lie, e]).broken && satisfiable(base, [lie, e]) && pairOk(tA) && satisfiable(base, [lie, tA])) {
            found = [tA, e, lie];
            break search;
          }
        }
      }
    }
    if (!found) return fail('противоречие с протоколом');
    clashLie = found[2];
    put(a, found[0]);
    required.push(found[1]);
    taken.add(keyOf(found[1]));
  } else {
    // «треугольник»: ложь + фраза A + фраза B вместе неверны, любые две совместимы
    // Ищем решателем: если он из трёх фраз пришёл к противоречию, оно точно есть, и человек его тоже найдёт.
    // Перебором проверяем только, что любые две из трёх совместимы.
    const [a, b] = witnesses;
    const solveFrom = (clues, start) => solve(context({ ...base, clues }), start);
    const sat = (clues) => !solveFrom(clues).broken && satisfiable(base, clues);
    let found = null;
    search: for (const lie of rand() < 0.5 ? [lie1, lie2] : [lie2, lie1]) {
      const poolB = shuffle(rand, sayable.filter((c) => free(c) && (about(c, b) || aboutOther(c, b)))).slice(0, 150);
      for (const tA of shuffle(rand, sayable.filter((c) => free(c) && !exact(c) && (about(c, a) || aboutOther(c, a)))).slice(0, 80)) {
        const withA = solveFrom([lie, tA]);
        if (withA.broken) continue; // лобовая пара — не то
        for (const tB of poolB) {
          if (tB === tA || !solveFrom([lie, tA, tB], withA.pos).broken) continue;
          if (sat([lie, tB]) && pairOk(tA) && pairOk(tB) && satisfiable(base, [lie, tA])) {
            found = [tA, tB, lie];
            break search;
          }
        }
      }
    }
    if (!found) return fail('треугольник');
    clashLie = found[2];
    put(a, found[0]);
    put(b, found[1]);
  }

  const puzzle = { ...base, culprit, statements, evidence: [...required] };
  // подозреваемые по задумке: двое из треугольника, один — из противоречия с протоколом, в тихом деле — все
  const planned = kind === 'triangle' ? witnesses.slice(0, 2) : kind === 'protocol' ? witnesses.slice(0, 1) : others;
  const score = () => {
    const right = tryVersion(puzzle, culprit);
    const ctx = context({ ...puzzle, clues: version(puzzle, culprit) });
    let total = right.known ? 1000 : progressScore(ctx, right.pos, culprit);
    for (const r of planned) {
      const versus = tryVersion(puzzle, r);
      // опровержимость версии — в помощь, но не важнее разгадки (долгий обвал уровня 3 отбирается после)
      if (versus.broken) total += 40 - versus.steps;
    }
    return total;
  };

  // остальные фразы — правда; каждая чуть двигает разгадку, но не самая сильная из возможных
  const slots = shuffle(
    rand,
    others.flatMap((g) => {
      const need = 2 - statements[g].length;
      const kinds = statements[g].some((c) => about(c, g)) ? ['other', 'self'] : ['self', 'other'];
      return kinds.slice(0, need).map((kind) => [g, kind]);
    }),
  );
  for (const [g, kind] of slots) {
    const pool = shuffle(rand, sayable.filter((c) => free(c) && (exactLeft() > 0 || !exact(c)) && (kind === 'self' ? about(c, g) : aboutOther(c, g)))).slice(0, options.sample);
    const scored = [];
    const before = score();
    for (const c of pool) {
      if (!pairOk(c)) continue; // новое лобовое противоречие выдало бы лжеца
      statements[g].push(c);
      scored.push({ c, score: score() });
      statements[g].pop();
    }
    if (!scored.length) return fail('фразы');
    // полезные — те, что что-то дают; из них берём случайную из верхней половины
    const useful = scored.filter((x) => x.score > before).sort((x, y) => y.score - x.score);
    const pick = useful.length ? useful[randInt(rand, Math.max(1, Math.ceil(useful.length * 0.3)))] : scored[randInt(rand, scored.length)];
    put(g, pick.c);
  }

  // протокол: верные факты не о лжеце; сперва — сколько нужно для разгадки, потом — до minEvidence
  const evidencePool = shuffle(rand, all.filter((c) => truth(c) && quiet(c) && free(c) && pairOk(c))).slice(0, options.sample * 2);
  const known = () => tryVersion(puzzle, culprit).known;
  while (!known() && puzzle.evidence.length < options.maxEvidence) {
    let best = null;
    for (const e of evidencePool) {
      if (puzzle.evidence.includes(e)) continue;
      puzzle.evidence.push(e);
      const s = score();
      puzzle.evidence.pop();
      if (!best || s > best.s) best = { e, s };
    }
    if (!best) return fail('протокол');
    puzzle.evidence.push(best.e);
  }
  if (!known()) return fail('не решается');
  for (const e of [...puzzle.evidence]) {
    if (required.includes(e)) continue;
    const i = puzzle.evidence.indexOf(e);
    puzzle.evidence.splice(i, 1);
    if (!known()) puzzle.evidence.splice(i, 0, e);
  }
  for (const e of evidencePool) {
    if (puzzle.evidence.length >= options.minEvidence) break;
    if (!puzzle.evidence.includes(e)) puzzle.evidence.push(e);
  }

  // как сказано: порядок фраз и слова
  puzzle.statements = statements.map((st, g) => shuffle(rand, st).map((c) => ({ ...c, by: g, say: randInt(rand, 2) })));
  puzzle.evidence = shuffle(rand, puzzle.evidence).map((c) => ({ ...c, say: randInt(rand, 2) }));

  // проверки
  const found = conflicts(puzzle);
  const left = suspectsLeft(puzzle, found);
  if (!left.includes(culprit)) return fail('лжец не в подозрении');
  // лобовое: одна фраза против протокола или две фразы, несовместимые и без протокола
  if (found.some((s) => s.size === 1 || (s.size === 2 && !s.protocol))) return fail('лобовое противоречие');
  if (kind === 'protocol' && !found.some((s) => s.protocol)) return fail('противоречие без протокола');
  if (kind === 'quiet' && found.length) return fail('в тихом деле видно противоречие');
  // на лёгком уровне лжеца могут указать сразу два треугольника; иначе — не меньше двух подозреваемых
  if (left.length < (level === 1 ? 1 : 2)) return fail(`подозреваемых ${left.length}`);
  if (statements.flat().filter(exact).length > options.maxExact) return fail('много точного времени');
  const rivals = left.filter((g) => g !== culprit);
  const rivalSteps = rivals.map((r) => tryVersion(puzzle, r));
  if (rivalSteps.some((v) => !v.broken)) return fail('версия не опровергается решателем');
  if (rivalSteps.some((v) => v.steps < 2 || v.steps > options.maxRivalSteps)) return fail('шагов на версию');
  // честный минимум сведений на каждую неверную версию (до порога уровня — дальше считать незачем)
  const need = [0, 3, 4, options.herring][level];
  const refute = rivals.map((r) => minRefutation(puzzle, r, need));
  const hardest = rivals.length ? Math.max(...refute) : need;
  if (hardest < need) return fail(level === 3 ? 'нет ложного следа' : 'версии рушатся сразу');
  if (level === 3 && !rivals.some((r, i) => refute[i] >= need && refutation(puzzle, r).protocol)) return fail('ложный след без протокола');
  // у каждой лжи своя роль: одна — в противоречии, другая — нужна, чтобы узнать о лжеце всё
  const said = puzzle.statements[culprit];
  const other = clashLie ? said.findIndex((c) => keyOf(c) !== keyOf(clashLie)) : -1;
  if (other >= 0 ? knownWithoutLie(puzzle, other) : knownWithoutLie(puzzle, 0) && knownWithoutLie(puzzle, 1)) return fail('ложь не нужна');
  if (settledBefore(puzzle) > options.leftover) return fail('приметы остатком');
  const right = tryVersion(puzzle, culprit);
  if (!right.known || right.steps < options.minSteps) return fail('коротко после разоблачения');
  const { used, lieUsed } = usage({ ...puzzle, rivals }, found);
  if (used.size < options.minUsed) return fail('лишние фразы');
  if (!lieUsed) return fail('ложь не нужна');
  return { ...puzzle, level, kind, rivals, conflicts: found, steps: right.steps, rivalSteps: rivalSteps.map((v) => v.steps), refute, used: used.size };
}

export function testimony(rand, { suspects, categories }, options = TESTIMONY, level = 2) {
  for (let i = 0; i < options.attempts; i++) {
    const base = { suspects, categories, solution: randomSolution(rand, suspects.length, categories.length) };
    const puzzle = attempt(rand, base, options, level);
    if (!puzzle) continue;
    // для buildPuzzle: главной улики нет, но тексты дня выбираются по её категории — берём место преступника
    const placeK = categories.findIndex((c) => c.key === 'place');
    const clues = [...puzzle.statements.flat(), ...puzzle.evidence];
    return { ...puzzle, clues, culpritClue: { k: placeK, v: puzzle.solution[puzzle.culprit][placeK] } };
  }
  throw new Error('не удалось составить дело с показаниями');
}

// Дело с показаниями: по дате — та же тема, что у дела дня, но свой расклад; по коду x-… — случайное.
export function testimonyPuzzle(key) {
  const hash = hashString(`case-testimony:${key}`);
  const rand = mulberry32(hash);
  const level = levelOf(key, rand);
  const make = (r, shell) => testimony(r, shell, TESTIMONY, level);
  if (isDateKey(key)) {
    const number = caseNumber(key);
    const themeKey = THEME_KEYS[deck(THEME_KEYS.length, number, 'theme')];
    return { ...buildPuzzle(rand, number, themeKey, make), key, number, random: false };
  }
  const themeKey = THEME_KEYS[hash % THEME_KEYS.length];
  const puzzle = buildPuzzle(rand, 1 + (hash % 9973), themeKey, make);
  return { ...puzzle, key, number: null, random: true, code: key.slice(2).toUpperCase() };
}

// Верно ли обвинение: кто и всё о нём — время, место, предмет.
export const accuseRight = (puzzle, g, values) => g === puzzle.culprit && puzzle.categories.every((_, k) => values[k] === puzzle.solution[g][k]);

export { culpritSlot };
