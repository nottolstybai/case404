// Перебор переехал в src/brute.js — им пользуется и генератор.
export { countSolutions } from '../src/brute.js';

// count дат подряд, начиная с from: ['2026-11-01', '2026-11-02', …].
export function days(count, from = '2026-11-01') {
  const [y, m, d] = from.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
