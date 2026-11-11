import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUSPECTS } from '../src/suspects.js';
import { THEMES } from '../src/themes.js';
import { ROLES, portrait, scene } from '../src/art.js';

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

test('места и предметы каждой темы помещаются в кнопку и имеют все формы', () => {
  for (const [key, theme] of Object.entries(THEMES)) {
    const { places, items } = theme;
    for (const p of places) assert.ok(p.name.length <= 9 && p.loc && p.to, `${key}: ${p.name}`);
    for (const i of items) assert.ok(i.name.length <= 9 && i.acc, `${key}: ${i.name}`);
    assert.equal(new Set(places.map((p) => p.name)).size, places.length, key);
    assert.equal(new Set(items.map((i) => i.name)).size, items.length, key);
    assert.ok(places.length >= 8 && items.length >= 8, key);
    assert.ok(SUSPECTS.filter((s) => !theme.skipRoles.includes(s.role)).length >= 10, key);
  }
});

test('у каждой темы есть короткая строка для шапки', () => {
  for (const [key, theme] of Object.entries(THEMES)) {
    // в шапке телефона помещается около 26 знаков
    assert.ok(theme.gone && theme.gone.length <= 26, key);
  }
});

test('у каждой темы есть вступления и главные улики для всех категорий', () => {
  for (const [key, theme] of Object.entries(THEMES)) {
    assert.ok(theme.intros.length >= 6, key);
    assert.ok(theme.intros.some((i) => i.body === false), `${key}: нужно и вступление без тела`);
    for (const cat of ['time', 'place', 'item']) {
      const list = theme.main[cat];
      assert.ok(list.some((m) => !m.body), `${key}/${cat}: нужна улика, которая подходит к любому вступлению`);
      for (const m of list) {
        const text = m.text({ name: 'X', acc: 'X', loc: 'в X', to: 'в X' });
        assert.match(text, /^[А-ЯЁ«].*[.»]$/, `${key}/${cat}: ${text}`);
      }
    }
  }
});

test('картинка дня собирается для каждой темы при любых настройках', () => {
  for (const theme of Object.keys(THEMES)) {
    for (let window = 0; window < 6; window++) {
      for (let moon = 0; moon < 2; moon++) {
        for (let weather = 0; weather < 4; weather++) {
          const svg = scene(theme, { window, moon, weather });
          assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
          assert.doesNotMatch(svg, /undefined|NaN/);
        }
      }
    }
  }
});
