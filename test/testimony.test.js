import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuseRight, conflicts, knownWithoutLie, levelOf, minRefutation, negate, refutation, satisfiable, settledBefore, suspectsLeft, testimonyPuzzle, tryVersion, usage, version } from '../src/testimony.js';
import { forEachSolution } from '../src/brute.js';
import { isTrue, orderIndex } from '../src/puzzle.js';
import { clueText } from '../src/text.js';

// 2026-12-07, 08 — понедельник и вторник (уровень 1), 09, 10 — среда и четверг (2), 19 — суббота (3)
const KEYS = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-19', 'x-a3f9k2', 'x-q1w2e3'];
const cases = KEYS.map((key) => testimonyPuzzle(key));
const truthOf = (p, c) => isTrue(c, p.solution, p.suspects.length, orderIndex(p));

test('один ключ — одно и то же дело', () => {
  assert.deepEqual(testimonyPuzzle(KEYS[0]), cases[0]);
  assert.notDeepEqual(cases[0].solution, cases[1].solution);
});

test('у каждого две фразы; невиновные говорят правду, виновный лжёт в каждой', () => {
  for (const p of cases) {
    assert.equal(p.statements.length, 5);
    p.statements.forEach((st, g) => {
      assert.equal(st.length, 2);
      for (const c of st) {
        assert.equal(c.by, g);
        assert.ok(negate(c), `фразу нельзя однозначно перевернуть: ${JSON.stringify(c)}`);
        assert.equal(truthOf(p, c), g !== p.culprit, `${p.key}: ${clueText(p, c)}`);
      }
    });
    for (const e of p.evidence) assert.ok(truthOf(p, e), `протокол неверен: ${clueText(p, e)}`);
  }
});

test('противоречия не лобовые и устроены по типу дела; неверные версии опровергаются, чем выше уровень, тем труднее', () => {
  for (const p of cases) {
    const found = conflicts(p);
    for (const set of found) {
      assert.ok(set.at.some(([g]) => g === p.culprit), 'в каждом противоречии есть лжец');
      assert.ok(set.size >= 3 || (set.size === 2 && set.protocol), `${p.key}: лобовое противоречие`);
    }
    if (p.kind === 'triangle') assert.ok(found.some((set) => set.size === 3), p.key);
    if (p.kind === 'protocol') assert.ok(found.some((set) => set.protocol), `${p.key}: противоречие видно только с протоколом`);
    if (p.kind === 'quiet') assert.equal(found.length, 0, `${p.key}: в тихом деле видимых противоречий нет`);
    const left = suspectsLeft(p, found);
    assert.ok(left.includes(p.culprit) && left.length >= (p.level === 1 ? 1 : 2));
    assert.deepEqual(p.rivals, left.filter((g) => g !== p.culprit));
    for (const r of p.rivals) assert.ok(tryVersion(p, r).broken, `${p.key}: версия «лжёт ${p.suspects[r].name}» опровергается`);
    if (!p.rivals.length) continue;
    const need = [0, 3, 4, 5][p.level];
    const refute = p.rivals.map((r) => minRefutation(p, r, need));
    assert.ok(Math.max(...refute) >= need, `${p.key}: уровень ${p.level}, честный минимум ${refute}`);
    if (p.level === 3) assert.ok(p.rivals.some((r, i) => refute[i] >= need && refutation(p, r).protocol), 'ложный след рушится на протоколе');
  }
});

test('ложь нужна, а приметы лжеца выводятся рассуждением, а не остаются последней клеткой', () => {
  for (const p of cases) {
    assert.ok(!(knownWithoutLie(p, 0) && knownWithoutLie(p, 1)), `${p.key}: без лжи всё известно`);
    assert.ok(settledBefore(p) <= 2, `${p.key}: обе приметы — остаток`);
  }
});

test('точного времени в показаниях — не больше двух фраз', () => {
  for (const p of cases) {
    const exact = p.statements.flat().filter((c) => (c.type === 'is' || c.type === 'not') && (c.k === 0 || c.s.k === 0));
    assert.ok(exact.length <= 2, `${p.key}: ${exact.length}`);
  }
});

test('почти все фразы участвуют в решении, и перевёрнутая ложь нужна', () => {
  for (const p of cases) {
    const { used, lieUsed } = usage(p);
    assert.ok(used.size >= 8, `${p.key}: в деле ${used.size} фраз из 10`);
    assert.ok(lieUsed, `${p.key}: ложь не пригодилась`);
  }
});

test('протокол есть всегда; никто из невиновных не называет примет лжеца напрямую', () => {
  for (const p of cases) {
    assert.ok(p.evidence.length >= 2);
    const holderOf = (s) => (s.g !== undefined ? s.g : p.solution.findIndex((row) => row[s.k] === s.v));
    p.statements.forEach((st, g) => {
      if (g === p.culprit) return;
      for (const c of st) assert.ok(!(c.type === 'is' && [c.s, { k: c.k, v: c.v }].some((s) => holderOf(s) === p.culprit)), clueText(p, c));
    });
  }
});

test('протокол не говорит о преступнике напрямую', () => {
  for (const p of cases) {
    const holderOf = (s) => (s.g !== undefined ? s.g : p.solution.findIndex((row) => row[s.k] === s.v));
    for (const e of p.evidence) {
      const subjects = e.type === 'is' || e.type === 'not' ? [e.s, { k: e.k, v: e.v }] : [e.a, e.b].filter(Boolean);
      assert.ok(!subjects.some((s) => holderOf(s) === p.culprit), clueText(p, e));
    }
  }
});

test('после разоблачения решатель без угадывания узнаёт о лжеце всё', () => {
  for (const p of cases) assert.ok(tryVersion(p, p.culprit).known, p.key);
});

test('перебор: ни при каком другом лжеце показания не сходятся, а при настоящем ответ единственный', () => {
  for (const p of cases) {
    p.suspects.forEach((_, L) => {
      let rows = new Set();
      let count = 0;
      forEachSolution(p, version(p, L), (sol) => {
        count++;
        rows.add(sol[L].join());
        return L !== p.culprit; // для невиновного хватит одной раскладки, чтобы упасть
      });
      if (L === p.culprit) assert.deepEqual([...rows], [p.solution[L].join()], `${p.key}: о лжеце всё однозначно`);
      else assert.equal(count, 0, `${p.key}: версия «лжёт ${p.suspects[L].name}» сходится`);
    });
  }
});

test('satisfiable видит прямое противоречие и не видит лишнего', () => {
  const p = cases[0];
  const c = p.statements[0][0];
  assert.equal(satisfiable(p, [c, negate(c)]), false);
  assert.equal(satisfiable(p, [c]), true);
});

test('обвинение: нужны и человек, и время, и место, и вещь', () => {
  const p = cases[0];
  const g = p.culprit;
  const values = Object.fromEntries(p.categories.map((_, k) => [k, p.solution[g][k]]));
  assert.ok(accuseRight(p, g, values));
  assert.ok(!accuseRight(p, (g + 1) % 5, values));
  assert.ok(!accuseRight(p, g, { ...values, 0: (values[0] + 1) % 5 }));
});

test('уровень по дню недели: пн–вт — 1, ср–чт — 2, пт–вс — 3; дела по коду — 1 или 2', () => {
  const rand = () => 0.5;
  assert.deepEqual(['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13'].map((k) => levelOf(k, rand)), [1, 1, 2, 2, 3, 3, 3]);
  for (const r of [0, 0.49, 0.99]) assert.ok([1, 2].includes(levelOf('x-abc123', () => r)));
});
