import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseNumber, dailyPuzzle, dateKey, dateLabel } from '../src/daily.js';

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
