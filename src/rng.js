// Детерминированный генератор случайных чисел: одна дата — одна загадка у всех.

// Строка → 32-битное число (FNV-1a).
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: rand() → [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rand, n) => Math.floor(rand() * n);
export const pick = (rand, items) => items[randInt(rand, items.length)];

export function shuffle(rand, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
