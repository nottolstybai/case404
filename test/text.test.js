import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clueParts, clueText, confessionText, factText, GROUP_TITLES, hintText, mainClueParts, mainClueText, rowInfo } from '../src/text.js';
import { THEMES } from '../src/themes.js';
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

const join = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');

test('улика по частям: сущности и заглавная буква', () => {
  assert.deepEqual(clueParts(puzzle, { type: 'is', s: G, k: 2, v: 0 }), [
    { kind: 'item', id: 0, text: 'Верёвку' },
    ' нашли у ',
    { kind: 'who', id: 1, text: 'Глеба' },
    '.',
  ]);
  assert.deepEqual(clueParts(puzzle, { type: 'is', s: late, k: 1, v: 1 }), [
    'Тот, кто пришёл в ',
    { kind: 'time', id: 1, text: '21:30' },
    ', был ',
    { kind: 'place', id: 1, text: 'на кухне' },
    '.',
  ]);
  assert.deepEqual(clueParts(puzzle, { type: 'notNext', a: cellar, b: V }), [
    'Между тем, кто был ',
    { kind: 'place', id: 0, text: 'в подвале' },
    ', и ',
    { kind: 'who', id: 0, text: 'Верой' },
    ' приходил кто-то ещё.',
  ]);
});

test('все улики настоящих дел: части складываются в текст, id совпадает с текстом', () => {
  for (let d = 1; d <= 30; d++) {
    const p = dailyPuzzle(`2026-11-${String(d).padStart(2, '0')}`);
    const cat = (key) => p.categories.find((c) => c.key === key);
    for (const clue of p.clues) {
      const parts = clueParts(p, clue);
      assert.equal(join(parts), clueText(p, clue));
      for (const part of parts) {
        if (typeof part === 'string') continue;
        const low = part.text[0].toLowerCase() + part.text.slice(1);
        if (part.kind === 'who') {
          const s = p.suspects[part.id];
          assert.ok([s.name, s.gen, s.ins].includes(part.text), part.text);
        } else {
          const value = cat(part.kind).values[part.id];
          const field = { time: 'name', place: 'loc', item: 'acc' }[part.kind];
          assert.equal(low, value[field]);
        }
      }
    }
  }
});

test('главная улика по частям для всех тем и вариантов', () => {
  assert.deepEqual(mainClueParts(puzzle), [
    'Камера у ворот засняла преступника в ',
    { kind: 'time', id: 1, text: '21:30' },
    '. Лица не разобрать.',
  ]);
  const at = (theme, k, main) => ({ ...puzzle, theme, culpritClue: { k, v: 1 }, story: { main, confession: 0 } });
  assert.deepEqual(mainClueParts(at('house', 1, 3))[0], { kind: 'place', id: 1, text: 'На кухне' });
  for (const theme of Object.keys(THEMES)) {
    puzzle.categories.forEach((cat, k) => {
      THEMES[theme].main[cat.key].forEach((_, main) => {
        const p = at(theme, k, main);
        const parts = mainClueParts(p);
        assert.equal(join(parts), mainClueText(p));
        const marks = parts.filter((part) => typeof part !== 'string');
        assert.ok(marks.length > 0, `${theme} ${cat.key} ${main}`);
        for (const part of marks) {
          assert.equal(part.kind, cat.key);
          assert.equal(part.id, 1);
        }
      });
    });
  }
});

test('строки доски: люди, места, предметы', () => {
  assert.deepEqual(rowInfo(puzzle, 0), { kind: 'who', v: 0, name: 'Вера' });
  assert.deepEqual(rowInfo(puzzle, 1), { kind: 'who', v: 1, name: 'Глеб' });
  assert.deepEqual(rowInfo(puzzle, 3), { kind: 'place', v: 1, name: 'кухня' });
  assert.deepEqual(rowInfo(puzzle, 4), { kind: 'item', v: 0, name: 'верёвка' });
  assert.equal(GROUP_TITLES.who, 'Кто пришёл');
  assert.equal(GROUP_TITLES.place, 'Где был');
  assert.equal(GROUP_TITLES.item, 'Что нашли');
});

test('подсказки по шагам решателя', () => {
  const clue = { reason: { kind: 'clue', index: 6 }, removals: [[2, 1], [0, 1], [2, 0]] };
  assert.equal(hintText(puzzle, clue, false), 'Посмотри на улику №7.');
  assert.equal(hintText(puzzle, clue, true), 'Улика №7. Подвал — не 21:00, 21:30; Вера — не 21:30. Вычеркни подсвеченное.');
  assert.equal(
    hintText(puzzle, { reason: { kind: 'clue', index: 0 }, removals: [[1, 0], [5, 1]] }, true),
    'Улика №1. Глеб — не 21:00; яд — не 21:30. Вычеркни подсвеченное.',
  );

  const single = (row) => ({ reason: { kind: 'single', row, slot: 1 }, removals: [[1, 1]] });
  assert.equal(hintText(puzzle, single(0), false), 'У Веры остался один вариант времени.');
  assert.equal(hintText(puzzle, single(0), true), 'У Веры остался один вариант времени — 21:30. Поставь ✓.');
  assert.equal(hintText(puzzle, single(2), false), 'У места «подвал» остался один вариант времени.');
  assert.equal(hintText(puzzle, single(5), true), 'У предмета «яд» остался один вариант времени — 21:30. Поставь ✓.');

  const only = (row) => ({ reason: { kind: 'only', row, slot: 0 }, removals: [[row, 1]] });
  assert.equal(hintText(puzzle, only(1), false), 'Посмотри на колонку 21:00: в строках «Кто пришёл» там остался один вариант.');
  assert.equal(hintText(puzzle, only(1), true), 'В колонке 21:00 в строках «Кто пришёл» остался один вариант — Глеб. Поставь ✓.');
  assert.equal(hintText(puzzle, only(3), true), 'В колонке 21:00 в строках «Где был» остался один вариант — кухня. Поставь ✓.');
  assert.equal(hintText(puzzle, only(4), false), 'Посмотри на колонку 21:00: в строках «Что нашли» там остался один вариант.');
});
