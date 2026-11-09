import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseNumber, casePuzzle, caseTitle, dailyPuzzle, dateKey, dateLabel, isCaseKey, isRandomKey, randomKey } from '../src/daily.js';
import { context, solve } from '../src/logic.js';
import { countSolutions } from '../src/brute.js';
import { mulberry32 } from '../src/rng.js';

const CODES = ['x-a3f9k2', 'x-000000', 'x-zzzzzz', 'x-q1w2e3', 'x-dead00', 'x-1234', 'x-mnbvcx', 'x-p0p0p0', 'x-abcdefgh'];

test('одна дата — одно и то же дело', () => {
  assert.deepEqual(dailyPuzzle('2026-11-06'), dailyPuzzle('2026-11-06'));
  assert.notDeepEqual(dailyPuzzle('2026-11-06').solution, dailyPuzzle('2026-11-07').solution);
});

test('номер дела и дата', () => {
  assert.equal(caseNumber('2026-11-01'), 1);
  assert.equal(caseNumber('2026-11-06'), 6);
  assert.equal(caseNumber('2027-01-01'), 62);
  assert.equal(dateKey(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
  assert.equal(dateLabel('2026-11-06'), '6 ноября 2026');
});

test('время прихода идёт по порядку', () => {
  for (let d = 1; d <= 20; d++) {
    const p = dailyPuzzle(`2026-12-${String(d).padStart(2, '0')}`);
    const times = p.categories[0].values.map((v) => v.name);
    assert.deepEqual([...times].sort(), times);
  }
});

test('вступления и признания не повторяются 12 дней подряд', async () => {
  const { deck } = await import('../src/daily.js');
  for (const size of [12]) {
    for (let start = 1; start < 200; start += size) {
      const seen = new Set();
      for (let d = start; d < start + size; d++) seen.add(deck(size, d, 'intro'));
      assert.equal(seen.size, size);
    }
  }
});

test('главная улика не спорит со вступлением', async () => {
  const { THEMES } = await import('../src/themes.js');
  for (let d = 1; d <= 60; d++) {
    const key = new Date(Date.UTC(2026, 10, d)).toISOString().slice(0, 10);
    const p = dailyPuzzle(key);
    const theme = THEMES[p.theme];
    const main = theme.main[p.categories[p.culpritClue.k].key][p.story.main];
    if (main.body) assert.notEqual(theme.intros[p.story.intro].body, false, key);
  }
});

test('темы идут по очереди, подозреваемые подходят к месту', async () => {
  const { THEMES, THEME_KEYS } = await import('../src/themes.js');
  const seen = new Set();
  for (let d = 1; d <= 8; d++) {
    const p = dailyPuzzle(`2026-11-${String(d).padStart(2, '0')}`);
    seen.add(p.theme);
    for (const s of p.suspects) assert.ok(!THEMES[p.theme].skipRoles.includes(s.role), `${p.theme}: ${s.role}`);
    const places = THEMES[p.theme].places.map((x) => x.name);
    for (const v of p.categories[1].values) assert.ok(places.includes(v.name), `${p.theme}: ${v.name}`);
  }
  assert.equal(seen.size, THEME_KEYS.length);
});

test('случайное дело: один код — одно дело, разные коды — разные', () => {
  assert.deepEqual(casePuzzle('x-a3f9k2'), casePuzzle('x-a3f9k2'));
  assert.notDeepEqual(casePuzzle('x-a3f9k2').solution, casePuzzle('x-a3f9k3').solution);
  const p = casePuzzle('x-a3f9k2');
  assert.equal(p.key, 'x-a3f9k2');
  assert.equal(p.number, null);
  assert.equal(p.random, true);
  assert.equal(p.code, 'A3F9K2');
  assert.equal(dailyPuzzle('2026-11-06').random, false);
  assert.deepEqual(casePuzzle('2026-11-06'), dailyPuzzle('2026-11-06'));
});

test('коды случайных дел', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const key = randomKey(rand);
    assert.match(key, /^x-[0-9a-z]{6}$/);
    assert.ok(isCaseKey(key) && isRandomKey(key), key);
  }
  assert.ok(isRandomKey(randomKey()));
  assert.ok(isCaseKey('2026-11-06'));
  assert.equal(isRandomKey('2026-11-06'), false);
  for (const bad of ['x-', 'x-abc', 'x-ABCDEF', 'x-abcdefghi', 'y-abcdef', '', null, undefined]) {
    assert.equal(isCaseKey(bad), false, String(bad));
  }
});

test('случайное дело решается и решение одно', () => {
  for (const key of CODES) {
    const p = casePuzzle(key);
    assert.ok(solve(context(p)).solved, key);
    assert.equal(countSolutions(p), 1, key);
  }
});

test('случайные дела: все места, подозреваемые подходят, улика не спорит со вступлением', async () => {
  const { THEMES, THEME_KEYS } = await import('../src/themes.js');
  const seen = new Set();
  const rand = mulberry32(404);
  for (let i = 0; i < 40; i++) {
    const key = randomKey(rand);
    const p = casePuzzle(key);
    const theme = THEMES[p.theme];
    seen.add(p.theme);
    for (const s of p.suspects) assert.ok(!theme.skipRoles.includes(s.role), `${key}: ${s.role}`);
    const main = theme.main[p.categories[p.culpritClue.k].key][p.story.main];
    if (main.body) assert.notEqual(theme.intros[p.story.intro].body, false, key);
  }
  assert.equal(seen.size, THEME_KEYS.length);
});

test('заголовок дела', () => {
  assert.equal(caseTitle(dailyPuzzle('2026-11-09')), 'Дело №9');
  assert.equal(caseTitle(casePuzzle('x-a3f9k2')), 'Дело ×A3F9K2');
});

test('отпечаток дела есть у обоих видов', async () => {
  const { caseId } = await import('../src/daily.js');
  assert.equal(caseId(casePuzzle('x-a3f9k2')), caseId(casePuzzle('x-a3f9k2')));
  assert.notEqual(caseId(casePuzzle('x-a3f9k2')), caseId(dailyPuzzle('2026-11-09')));
});
