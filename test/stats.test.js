import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count, record, shareText, solvedCount, streak, untilMidnight } from '../src/stats.js';

const solved = { solved: true, gaveUp: false, elapsed: 754, wrong: 0, hints: 1 };
const gaveUp = { solved: false, gaveUp: true, elapsed: 300, wrong: 2, hints: 3 };

test('результат записывается один раз и только для закрытого дела', () => {
  let stats = record({}, 6, { ...solved, solved: false });
  assert.deepEqual(stats, {});
  stats = record(stats, 6, solved);
  assert.equal(stats[6].result, 'solved');
  assert.equal(record(stats, 6, gaveUp)[6].result, 'solved');
});

test('серия: подряд раскрытые дела, сдача её обрывает', () => {
  const stats = { 3: { result: 'solved' }, 4: { result: 'gaveup' }, 5: { result: 'solved' }, 6: { result: 'solved' } };
  assert.equal(streak(stats, 6), 2);
  assert.equal(streak(stats, 7), 2, 'сегодня ещё не решено — серия со вчера');
  assert.equal(streak(stats, 8), 0, 'пропущенный день обрывает серию');
  assert.equal(streak({ ...stats, 7: { result: 'gaveup' } }, 7), 0);
  assert.equal(solvedCount(stats), 3);
});

test('числа по-русски', () => {
  assert.equal(count(1, 'подсказка', 'подсказки', 'подсказок'), '1 подсказка');
  assert.equal(count(3, 'подсказка', 'подсказки', 'подсказок'), '3 подсказки');
  assert.equal(count(11, 'подсказка', 'подсказки', 'подсказок'), '11 подсказок');
  assert.equal(count(22, 'день', 'дня', 'дней'), '22 дня');
});

test('текст «Поделиться» без спойлеров', () => {
  const url = 'https://nottolstybai.github.io/case404/';
  assert.equal(
    shareText({ number: 6, game: solved, streak: 3, url }),
    `case404 · Дело №6 раскрыто за 12:34\nбез ошибок · 1 подсказка · серия 3 дня\n${url}`,
  );
  assert.equal(shareText({ number: 7, game: gaveUp, streak: 0, url }), `case404 · Дело №7 не раскрыто\n${url}`);
});

test('отсчёт до полуночи', () => {
  assert.equal(untilMidnight(new Date(2026, 10, 6, 16, 17, 50)), '07:42:10');
  assert.equal(untilMidnight(new Date(2026, 10, 6, 23, 59, 59)), '00:00:01');
});
