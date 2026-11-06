import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUSPECTS } from '../src/suspects.js';
import { ITEMS, PLACES } from '../src/puzzle.js';
import { ROLES, house, portrait } from '../src/art.js';

test('у каждой роли есть силуэт, роли не повторяются', () => {
  const roles = SUSPECTS.map((s) => s.role);
  assert.equal(new Set(roles).size, roles.length);
  for (const role of roles) assert.ok(ROLES.includes(role), role);
  assert.ok(portrait('сторож').includes('<svg'));
});

test('имена уникальны, падежи заполнены', () => {
  assert.equal(new Set(SUSPECTS.map((s) => s.name)).size, SUSPECTS.length);
  for (const s of SUSPECTS) {
    assert.ok(s.gen && s.ins && ['m', 'f'].includes(s.gender), s.name);
  }
});

test('комнаты и предметы помещаются в кнопку и имеют все формы', () => {
  for (const p of PLACES) assert.ok(p.name.length <= 9 && p.loc && p.to, p.name);
  for (const i of ITEMS) assert.ok(i.name.length <= 9 && i.acc, i.name);
  assert.equal(new Set(PLACES.map((p) => p.name)).size, PLACES.length);
  assert.equal(new Set(ITEMS.map((i) => i.name)).size, ITEMS.length);
});

test('картинка дня собирается при любых настройках', () => {
  for (let window = 0; window < 6; window++) {
    for (let moon = 0; moon < 2; moon++) {
      for (let weather = 0; weather < 4; weather++) {
        const svg = house({ window, moon, weather });
        assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
        assert.doesNotMatch(svg, /undefined|NaN/);
      }
    }
  }
});
