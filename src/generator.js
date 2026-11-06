// Генератор дела: случайный ответ → набор улик, по которому он выводится логикой.
//
// 1. Случайная раскладка: у каждого своё время, место и предмет.
// 2. Улики берутся из всех верных в случайном порядке; берём только те,
//    что дают что-то новое, пока решатель не заполнит всю таблицу.
//    Лишние убираем: без каждой оставшейся всю таблицу уже не заполнить.
// 3. Для обвинения нужна только строка преступника. Поэтому преступника и главную улику
//    выбираем так, чтобы для ответа были нужны почти все улики (остальные — ложные следы).
// 4. Делаем несколько кандидатов и берём того, чья сложность ближе к цели.

import { randInt, shuffle } from './rng.js';
import { trueClues } from './puzzle.js';
import { applyClue, context, isDirect, rowKnown, solve } from './logic.js';
import { neededShare } from './brute.js';

export const DIFFICULTY = {
  maxDirectIs: 1, // сколько можно улик вида «Вера была в подвале»
  candidates: 8,
  minNeeded: 0.75, // какая доля улик должна быть нужна, чтобы узнать преступника
  target: 45, // сложность до момента, когда известен преступник; подбирается по игре
};

export function randomSolution(rand, n, K) {
  const perms = Array.from({ length: K }, () => shuffle(rand, [...Array(n).keys()]));
  return Array.from({ length: n }, (_, g) => perms.map((p) => p[g]));
}

const directIs = (clue) => clue.type === 'is' && clue.s.g !== undefined;
const solvedBy = (base, clues) => solve(context({ ...base, clues })).solved;

function pickClues(rand, base, maxDirectIs) {
  const pool = shuffle(rand, trueClues(base));
  let clues = [];
  let state = solve(context({ ...base, clues })).poss;
  let solved = false;
  for (const clue of pool) {
    if (directIs(clue) && clues.filter(directIs).length >= maxDirectIs) continue;
    if (applyClue(context(base), state, clue).length === 0) continue; // ничего нового
    clues.push(clue);
    const result = solve(context({ ...base, clues }));
    if (result.solved) {
      solved = true;
      break;
    }
    state = result.poss;
  }
  if (!solved) return null;
  for (const clue of shuffle(rand, clues)) {
    const rest = clues.filter((c) => c !== clue);
    if (solvedBy(base, rest)) clues = rest;
  }
  return clues;
}

// Сложность: сколько и каких рассуждений нужно решателю, пока не станет известно всё о преступнике.
// Прямая улика — 1, «один вариант» — 0.5, связь «тот, кто …» — 2, порядок прихода — 3.
export function difficulty(puzzle, k, v) {
  const { trace } = solve(context(puzzle), undefined, (poss) => rowKnown(poss, k, v));
  let score = 0;
  for (const reason of trace) {
    if (reason.kind !== 'clue') {
      score += 0.5;
      continue;
    }
    const clue = puzzle.clues[reason.index];
    if (isDirect(clue)) score += 1;
    else if (clue.type === 'is' || clue.type === 'not') score += 2;
    else score += 3;
  }
  return score;
}

// Без каких улик не узнать всё о том, у кого v в категории k (жадно выбрасываем лишние).
export function neededClues(base, clues, k, v) {
  const known = (list) => rowKnown(solve(context({ ...base, clues: list }), undefined, (p) => rowKnown(p, k, v)).poss, k, v);
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

// Лучший преступник и главная улика: больше всего нужных улик, потом — сложнее.
function chooseCulprit(base, clues) {
  let best = null;
  base.categories.forEach((_, k) => {
    base.solution.forEach((row, g) => {
      const v = row[k];
      if (leaks(clues, k, v, g)) return;
      const needed = neededClues(base, clues, k, v).length / clues.length;
      const score = difficulty({ ...base, clues }, k, v);
      if (!best || needed > best.needed || (needed === best.needed && score > best.score)) {
        best = { k, v, g, needed, score };
      }
    });
  });
  return best;
}

export function generate(rand, { suspects, categories }, options = DIFFICULTY) {
  const n = suspects.length;
  const candidates = [];
  for (let attempt = 0; attempt < options.candidates * 5 && candidates.length < options.candidates; attempt++) {
    const base = { suspects, categories, solution: randomSolution(rand, n, categories.length) };
    const clues = pickClues(rand, base, options.maxDirectIs);
    if (!clues) continue;
    const choice = chooseCulprit(base, clues);
    if (choice) candidates.push({ ...choice, puzzle: { ...base, clues } });
  }
  if (!candidates.length) throw new Error('не удалось составить дело');
  // Сначала те, где решателю нужны почти все улики, затем — ближе к целевой сложности.
  const rank = (c) => (c.needed >= options.minNeeded ? 0 : 1000) + Math.abs(c.score - options.target);
  candidates.sort((a, b) => rank(a) - rank(b));
  // Перебором проверяем, что и человек с развилками не узнает преступника слишком рано.
  let best = null;
  for (const c of candidates) {
    c.share = neededShare({ ...c.puzzle, culpritClue: { k: c.k, v: c.v } });
    if (!best || c.share > best.share) best = c;
    if (c.share >= options.minNeeded) {
      best = c;
      break;
    }
  }
  const { puzzle, score, share, k, v, g } = best;
  for (const clue of puzzle.clues) {
    if (clue.type === 'left' || clue.type === 'rightNext') clue.flip = rand() < 0.5;
    clue.say = randInt(rand, 2); // какими словами сказать
  }
  return { ...puzzle, score, needed: share, culprit: g, culpritClue: { k, v } };
}
