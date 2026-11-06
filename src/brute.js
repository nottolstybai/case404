// Полный перебор раскладок — «как человек, который не боится развилок».
// Решатель в logic.js рассуждает только прямыми шагами; перебор же видит любые выводы,
// в том числе «если Павел пришёл в 19:40, то противоречие». Им проверяем,
// сколько улик на самом деле нужно, чтобы узнать преступника.

import { isTrue, orderIndex } from './puzzle.js';

function permutations(n) {
  if (n === 0) return [[]];
  const out = [];
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  }
  return out;
}

const PERMS = new Map();
const perms = (n) => {
  if (!PERMS.has(n)) PERMS.set(n, permutations(n));
  return PERMS.get(n);
};

// Последняя категория, о которой говорит улика: после неё улику уже можно проверить.
function lastCategory(clue, orderK) {
  const set = new Set();
  if (clue.type === 'is' || clue.type === 'not') {
    set.add(clue.k);
    if (clue.s.k !== undefined) set.add(clue.s.k);
  } else {
    set.add(orderK);
    for (const s of [clue.a, clue.b]) if (s && s.k !== undefined) set.add(s.k);
  }
  return Math.max(...set);
}

// Обойти все раскладки, где верны улики; visit(sol) === true — остановиться.
export function forEachSolution(puzzle, clues, visit) {
  const n = puzzle.suspects.length;
  const K = puzzle.categories.length;
  const orderK = orderIndex(puzzle);
  const checks = Array.from({ length: K }, () => []);
  for (const clue of clues) checks[lastCategory(clue, orderK)].push(clue);
  const sol = Array.from({ length: n }, () => Array(K).fill(-1));
  let stop = false;
  const walk = (k) => {
    if (k === K) {
      stop = visit(sol) === true;
      return;
    }
    for (const p of perms(n)) {
      for (let g = 0; g < n; g++) sol[g][k] = p[g];
      if (checks[k].every((clue) => isTrue(clue, sol, n, orderK))) walk(k + 1);
      if (stop) return;
    }
  };
  walk(0);
}

export function countSolutions(puzzle, clues = puzzle.clues, limit = 2) {
  let count = 0;
  forEachSolution(puzzle, clues, () => ++count >= limit);
  return count;
}

// Однозначно ли улики называют всё о том, у кого v в категории k.
export function culpritUnique(puzzle, clues, k, v) {
  let first = null;
  let unique = true;
  forEachSolution(puzzle, clues, (sol) => {
    const row = sol.find((r) => r[k] === v).join();
    if (first === null) first = row;
    else if (row !== first) unique = false;
    return !unique;
  });
  return first !== null && unique;
}

// Какая доля улик нужна, чтобы узнать преступника (жадно выбрасываем лишние).
export function neededShare(puzzle, k = puzzle.culpritClue.k, v = puzzle.culpritClue.v) {
  let need = [...puzzle.clues];
  for (const clue of puzzle.clues) {
    const rest = need.filter((c) => c !== clue);
    if (culpritUnique(puzzle, rest, k, v)) need = rest;
  }
  return need.length / puzzle.clues.length;
}
