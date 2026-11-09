// Генератор дела: случайный ответ → набор улик, по которому он выводится логикой.
//
// 1. Случайная раскладка: у каждого своё время, место и предмет.
// 2. Улики берутся из всех верных в случайном порядке; берём только те,
//    что дают что-то новое, пока решатель не заполнит всю доску.
//    Лишние убираем: без каждой оставшейся всю доску уже не заполнить.
// 3. Для обвинения нужна только колонка преступника. Поэтому преступника и главную улику
//    выбираем так, чтобы для ответа были нужны почти все улики (остальные — ложные следы).
//    Про что главная улика (время, место или предмет) — решает жребий, чтобы дни не были похожи.
// 4. Делаем несколько кандидатов и берём того, чья сложность ближе к цели.

import { randInt, shuffle } from './rng.js';
import { trueClues } from './puzzle.js';
import { applyClue, context, isDirect, rowKnown, solve } from './logic.js';
import { neededShare } from './brute.js';

export const DIFFICULTY = {
  maxDirectIs: 1, // сколько можно улик, которые сразу ставят ✓: «Вера пришла в 21:30»
  maxLinks: 3, // сколько можно улик-связок «Вера была в подвале»
  candidates: 16,
  minNeeded: 0.75, // какая доля улик должна быть нужна, чтобы узнать преступника
  target: 48, // сложность до момента, когда известен преступник; подбирается по игре
};

export function randomSolution(rand, n, K) {
  const perms = Array.from({ length: K }, () => shuffle(rand, [...Array(n).keys()]));
  return Array.from({ length: n }, (_, g) => perms.map((p) => p[g]));
}

const solvedBy = (base, clues) => solve(context({ ...base, clues })).solved;

function pickClues(rand, base, options) {
  const ctx = context(base);
  const directIs = (clue) => clue.type === 'is' && isDirect(ctx, clue);
  const link = (clue) => clue.type === 'is' && !isDirect(ctx, clue);
  const pool = shuffle(rand, trueClues(base));
  let clues = [];
  let state = solve(context({ ...base, clues })).pos;
  let solved = false;
  for (const clue of pool) {
    if (directIs(clue) && clues.filter(directIs).length >= options.maxDirectIs) continue;
    if (link(clue) && clues.filter(link).length >= (options.maxLinks ?? Infinity)) continue;
    if (applyClue(ctx, state, clue).length === 0) continue; // ничего нового
    clues.push(clue);
    const result = solve(context({ ...base, clues }));
    if (result.solved) {
      solved = true;
      break;
    }
    state = result.pos;
  }
  if (!solved) return null;
  for (const clue of shuffle(rand, clues)) {
    const rest = clues.filter((c) => c !== clue);
    if (solvedBy(base, rest)) clues = rest;
  }
  return clues;
}

// Сложность: сколько и каких рассуждений нужно решателю, пока не станет известно всё о преступнике.
// Улика про клетку — 1, «один вариант» — 0.5, связь «тот, кто …» — 2, порядок прихода — 3.
export function difficulty(puzzle, k, v) {
  const ctx = context(puzzle);
  const { trace } = solve(ctx, undefined, (pos) => rowKnown(ctx, pos, k, v));
  let score = 0;
  for (const reason of trace) {
    if (reason.kind !== 'clue') {
      score += 0.5;
      continue;
    }
    const clue = puzzle.clues[reason.index];
    if (isDirect(ctx, clue)) score += 1;
    else if (clue.type === 'is' || clue.type === 'not') score += 2;
    else score += 3;
  }
  return score;
}

// Без каких улик не узнать всё о том, у кого v в категории k (жадно выбрасываем лишние).
export function neededClues(base, clues, k, v) {
  const known = (list) => {
    const ctx = context({ ...base, clues: list });
    return rowKnown(ctx, solve(ctx, undefined, (p) => rowKnown(ctx, p, k, v)).pos, k, v);
  };
  let need = [...clues];
  for (const clue of clues) {
    const rest = need.filter((c) => c !== clue);
    if (known(rest)) need = rest;
  }
  return need;
}

// Примета прямо названа в уликах — тогда вместе с главной уликой ответ виден сразу.
function leaks(clues, k, v, g) {
  return clues.some(
    (c) => c.type === 'is' && ((c.s.g === g && c.k === k) || (c.s.k === k && c.s.v === v) || (c.k === k && c.v === v)),
  );
}

// Лучший преступник для главной улики про категорию k: больше всего нужных улик, потом — сложнее.
function bestCulprit(base, clues, k) {
  let best = null;
  base.solution.forEach((row, g) => {
    const v = row[k];
    if (leaks(clues, k, v, g)) return;
    const needed = neededClues(base, clues, k, v).length / clues.length;
    const score = difficulty({ ...base, clues }, k, v);
    if (!best || needed > best.needed || (needed === best.needed && score > best.score)) {
      best = { k, v, g, needed, score };
    }
  });
  return best;
}

export function generate(rand, { suspects, categories }, options = DIFFICULTY) {
  const n = suspects.length;
  // про что будет главная улика: сначала пробуем первую категорию из жребия
  const order = shuffle(rand, categories.map((_, k) => k));
  const candidates = [];
  for (let attempt = 0; attempt < options.candidates * 5 && candidates.length < options.candidates; attempt++) {
    const base = { suspects, categories, solution: randomSolution(rand, n, categories.length) };
    const clues = pickClues(rand, base, options);
    if (!clues) continue;
    order.forEach((k, place) => {
      const choice = bestCulprit(base, clues, k);
      if (choice) candidates.push({ ...choice, place, puzzle: { ...base, clues } });
    });
  }
  if (!candidates.length) throw new Error('не удалось составить дело');
  // Сначала те, где решателю нужны почти все улики; среди них — ближе к целевой сложности,
  // с небольшой форой категории по жребию.
  const rank = (c) => (c.needed >= options.minNeeded ? 0 : 10000) + c.place * 6 + Math.abs(c.score - options.target);
  candidates.sort((a, b) => rank(a) - rank(b));
  // Перебором проверяем, что и человек с развилками не узнает преступника слишком рано.
  let best = null;
  let checked = 0;
  for (const c of candidates) {
    c.share = neededShare({ ...c.puzzle, culpritClue: { k: c.k, v: c.v } });
    if (!best || c.share > best.share) best = c;
    if (c.share >= options.minNeeded) {
      best = c;
      break;
    }
    if (++checked >= options.candidates) break;
  }
  const { score, share, k, v, g } = best;
  // у кандидатов одного расклада общий список улик — копируем, прежде чем дописывать слова
  const clues = best.puzzle.clues.map((clue) => ({
    ...clue,
    ...(clue.type === 'left' || clue.type === 'rightNext' ? { flip: rand() < 0.5 } : {}),
    say: randInt(rand, 2), // какими словами сказать
  }));
  return { ...best.puzzle, clues, score, needed: share, culprit: g, culpritClue: { k, v } };
}
