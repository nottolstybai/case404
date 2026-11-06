import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clueText, confessionText, factText, mainClueText, stepText } from '../src/text.js';
import { SUSPECTS } from '../src/suspects.js';
import { dailyPuzzle } from '../src/daily.js';

const vera = SUSPECTS.find((s) => s.name === 'Вера');
const gleb = SUSPECTS.find((s) => s.name === 'Глеб');
const puzzle = {
  suspects: [vera, gleb],
  categories: [
    { key: 'time', ordered: true, values: [{ name: '21:00' }, { name: '21:30' }] },
    { key: 'place', values: [{ name: 'подвал', to: 'в подвал', loc: 'в подвале' }, { name: 'кухня', to: 'на кухню', loc: 'на кухне' }] },
    { key: 'item', values: [{ name: 'верёвка', acc: 'верёвку' }, { name: 'яд', acc: 'яд' }] },
  ],
  culprit: 0,
  culpritClue: { k: 0, v: 1 },
  theme: 'house',
  story: { main: 0, confession: 0 },
};
const V = { g: 0 };
const G = { g: 1 };
const cellar = { k: 1, v: 0 };
const rope = { k: 2, v: 0 };
const late = { k: 0, v: 1 };
const say = (clue) => clueText(puzzle, clue);

test('факты: место, предмет, время, род глагола', () => {
  assert.equal(say({ type: 'is', s: V, k: 1, v: 0 }), 'Вера была в подвале.');
  assert.equal(say({ type: 'not', s: G, k: 1, v: 1 }), 'Глеб не был на кухне.');
  assert.equal(say({ type: 'is', s: G, k: 2, v: 0 }), 'Верёвку нашли у Глеба.');
  assert.equal(say({ type: 'not', s: V, k: 2, v: 1 }), 'Яд нашли не у Веры.');
  assert.equal(say({ type: 'is', s: V, k: 0, v: 0 }), 'Вера пришла в 21:00.');
  assert.equal(say({ type: 'not', s: G, k: 0, v: 0 }), 'Глеб пришёл не в 21:00.');
});

test('«тот, кто …» с запятыми', () => {
  assert.equal(say({ type: 'is', s: rope, k: 1, v: 0 }), 'Тот, у кого нашли верёвку, был в подвале.');
  assert.equal(say({ type: 'not', s: cellar, k: 2, v: 1 }), 'Яд нашли не у того, кто был в подвале.');
  assert.equal(say({ type: 'is', s: late, k: 1, v: 1 }), 'Тот, кто пришёл в 21:30, был на кухне.');
  assert.equal(say({ type: 'next', a: V, b: cellar }), 'Вера и тот, кто был в подвале, пришли один за другим.');
  assert.equal(say({ type: 'next', a: rope, b: G }), 'Тот, у кого нашли верёвку, и Глеб пришли один за другим.');
  assert.equal(say({ type: 'notNext', a: cellar, b: V }), 'Между тем, кто был в подвале, и Верой приходил кто-то ещё.');
});

test('порядок прихода', () => {
  assert.equal(say({ type: 'left', a: V, b: G }), 'Вера пришла раньше Глеба.');
  assert.equal(say({ type: 'left', a: V, b: G, flip: true }), 'Глеб пришёл позже Веры.');
  assert.equal(say({ type: 'rightNext', a: G, b: cellar }), 'Глеб пришёл сразу после того, кто был в подвале.');
  assert.equal(say({ type: 'rightNext', a: G, b: V, flip: true }), 'Вера пришла прямо перед Глебом.');
  assert.equal(say({ type: 'edge', a: V }), 'Вера пришла первой или последней.');
  assert.equal(say({ type: 'notEdge', a: rope }), 'Тот, у кого нашли верёвку, пришёл не первым и не последним.');
});

test('история и подсказки', () => {
  assert.equal(mainClueText(puzzle), 'Камера у ворот засняла преступника в 21:30. Лица не разобрать.');
  assert.equal(confessionText(puzzle), 'Я не хотела, чтобы так вышло. Он сам открыл мне дверь.');
  assert.equal(factText(puzzle, 1, 1, 0, true), 'Глеб не был в подвале.');
  const full = [[3, 3, 3], [3, 3, 3]];
  assert.equal(
    stepText(puzzle, { reason: { kind: 'clue', index: 2 }, removals: [[0, 2, 1]] }, full),
    'Улика №3. Верёвку нашли у Веры.',
  );
  assert.equal(
    stepText(puzzle, { reason: { kind: 'clue', index: 0 }, removals: [[1, 0, 0], [0, 1, 0]] }, full),
    'Улика №1. Глеб пришёл в 21:30. Всё, что из неё следует, подсвечено.',
  );
  assert.equal(
    stepText(puzzle, { reason: { kind: 'single', g: 1, k: 1, v: 0 }, removals: [] }, full),
    'У Глеба остался один вариант — «подвал». Значит, у остальных его нет.',
  );
});

test('все улики настоящих дел складываются в текст', () => {
  for (let d = 1; d <= 30; d++) {
    const p = dailyPuzzle(`2026-11-${String(d).padStart(2, '0')}`);
    for (const clue of p.clues) {
      const text = clueText(p, clue);
      assert.match(text, /^[А-ЯЁ].*\.$/);
      assert.doesNotMatch(text, /undefined|,,|\s,/);
    }
  }
});


test('синонимы: те же факты другими словами', () => {
  assert.equal(say({ type: 'is', s: V, k: 1, v: 0, say: 1 }), 'Вера находилась в подвале.');
  assert.equal(say({ type: 'is', s: G, k: 2, v: 0, say: 1 }), 'У Глеба нашли верёвку.');
  assert.equal(say({ type: 'not', s: cellar, k: 2, v: 1, say: 1 }), 'У того, кто находился в подвале, не нашли яд.');
  assert.equal(say({ type: 'left', a: V, b: G, say: 1 }), 'Вера появилась раньше Глеба.');
  assert.equal(say({ type: 'next', a: V, b: G, say: 1 }), 'Вера и Глеб появились один за другим.');
  const two = { ...puzzle, suspects: [vera, { ...vera, name: 'Нина', gen: 'Нины', ins: 'Ниной' }] };
  assert.equal(clueText(two, { type: 'next', a: V, b: G }), 'Вера и Нина пришли одна за другой.');
  assert.equal(say({ type: 'notNext', a: V, b: G, say: 1 }), 'Между Верой и Глебом появлялся кто-то ещё.');
  assert.equal(say({ type: 'is', s: late, k: 1, v: 1, say: 1 }), 'Тот, кто появился в 21:30, находился на кухне.');
});

test('главная улика бывает про время, комнату и предмет', () => {
  const at = (k, v, main) => mainClueText({ ...puzzle, culpritClue: { k, v }, story: { main } });
  assert.equal(at(1, 0, 0), 'Следы грязи на полу ведут в подвал: преступник был там.');
  assert.equal(at(1, 1, 3), 'На кухне нашли пуговицу с пальто преступника. Он был там.');
  assert.equal(at(2, 0, 2), 'Хозяин успел нацарапать на полу одно слово: «верёвка». Ищите, у кого нашли верёвку.');
});
