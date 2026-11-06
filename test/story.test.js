import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzle } from '../src/daily.js';
import { buildPrompt, clean, facts, mockStory, validate } from '../scripts/story-lib.mjs';

const keys = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-11'];

test('запрос содержит все факты дела и преступника', () => {
  for (const key of keys) {
    const p = dailyPuzzle(key);
    const prompt = buildPrompt(p);
    for (const f of facts(p)) {
      assert.ok(prompt.includes(f.person.name), key);
      assert.ok(prompt.includes(f.place.loc), key);
      assert.ok(prompt.includes(f.item.acc), key);
    }
    assert.ok(prompt.includes(`Преступник — ${p.suspects[p.culprit].name}`), key);
  }
});

test('заглушка проходит проверку во всех темах', () => {
  for (const key of keys) {
    const p = dailyPuzzle(key);
    assert.deepEqual(validate(mockStory(p), p).problems, [], key);
  }
});

test('проверка ловит плохие ответы', () => {
  const p = dailyPuzzle('2026-11-06');
  const good = mockStory(p);
  const culprit = p.suspects[p.culprit];
  const noName = good.replaceAll(culprit.name, 'некто');
  assert.ok(validate(noName, p).problems.some((x) => x.startsWith('нет имени')));
  assert.ok(validate('Коротко и всё.', p).problems.some((x) => x.startsWith('слишком коротко')));
  const stranger = ['Вера', 'Глеб', 'Яков', 'Зоя'].find((n) => !p.suspects.some((s) => s.name === n));
  assert.ok(validate(`${good} Потом пришёл ${stranger}.`, p).problems.some((x) => x.startsWith('чужое имя')));
  assert.ok(validate(`**${good}**`, p).problems.includes('разметка в тексте'));
});

test('места-прилагательные узнаются в любом падеже', () => {
  const p = dailyPuzzle('2026-11-06');
  const c = facts(p).find((f) => f.culprit);
  const text = mockStory(p);
  for (const form of ['в душевой', 'в душевую', 'душевая']) {
    const replaced = text.replace(c.place.loc, form);
    assert.equal(validate(replaced, p).problems.filter((x) => x.startsWith('нет места')).length, 0, form);
  }
});

test('имена и предметы узнаются в разных падежах', () => {
  const p = dailyPuzzle('2026-11-06');
  const c = facts(p).find((f) => f.culprit);
  const base = mockStory(p);
  const declined = base.replaceAll(c.person.name, c.person.ins);
  assert.equal(validate(declined, p).problems.filter((x) => x.startsWith('нет имени')).length, 0);
});

test('очистка ответа', () => {
  assert.equal(clean('  «Текст истории.»  '), 'Текст истории.');
  assert.equal(clean('Раз.\n\n\nДва.'), 'Раз.\nДва.');
});

test('все места и предметы всех тем узнаются в тексте', async () => {
  const { THEMES } = await import('../src/themes.js');
  const { mentions } = await import('../scripts/story-lib.mjs');
  for (const [key, theme] of Object.entries(THEMES)) {
    for (const p of theme.places) {
      assert.ok(mentions(`Он был ${p.loc}.`, p.name), `${key}: ${p.loc}`);
      assert.ok(mentions(`Следы вели ${p.to}.`, p.name), `${key}: ${p.to}`);
    }
    for (const i of theme.items) assert.ok(mentions(`У него нашли ${i.acc}.`, i.name), `${key}: ${i.acc}`);
  }
});

test('проверка отбрасывает черновики и оборванные истории (как пришли от модели)', () => {
  const p = dailyPuzzle('2026-11-06');
  const good = mockStory(p);
  const draft = `ова ${good}\n    3. Главный след вёл вниз.\n    4. Ещё строка.\n    Sentences: 6.\n    Word count breakdown:\n    S1: На (1) штормовом (2)`;
  const problems = validate(draft, p).problems;
  for (const expected of ['латиница в тексте', 'нумерованные строки', 'начинается не с заглавной буквы', 'оборвано: нет точки в конце']) {
    assert.ok(problems.includes(expected), expected);
  }
  const cut = good.replace(/[^.]*\.$/, 'Найденный у него яд окончательно изобличил');
  assert.ok(validate(cut, p).problems.includes('оборвано: нет точки в конце'));
});

test('проверка фактов: чужое время или место в предложении, «до ЧЧ:ММ»', () => {
  const p = dailyPuzzle('2026-11-07');
  const all = facts(p);
  const culprit = all.find((f) => f.culprit);
  const other = all.find((f) => !f.culprit);
  const base = mockStory(p);
  const swap = `${base} ${other.person.name} пришёл в ${culprit.time.name}.`;
  assert.ok(validate(swap, p).problems.some((x) => x.includes('приписано не тому')));
  const before = `${base} ${other.person.name} оставался там до ${other.time.name}.`;
  assert.ok(validate(before, p).problems.some((x) => x.startsWith('«до ЧЧ:ММ»')));
  const fair = `${base} ${other.person.name} пришёл в ${other.time.name} и был ${other.place.loc}.`;
  assert.deepEqual(validate(fair, p).problems, []);
});

test('хорошая история модели за 7 ноября проходит проверку', () => {
  const p = dailyPuzzle('2026-11-07');
  const text =
    'Старый граф собрал гостей в усадьбе, чтобы огласить завещание, но до утра не дожил. Собака во дворе завыла в 19:20 — именно в этот момент пришёл преступник. Это сразу вычеркнуло из списка подозреваемых садовника Глеба в детской с цепью, репортёра Мирона в гостиной с ножницами, певицу Дину в холле с вазой и доктора Павла в кладовой с гирей. Лишь вдова Марта пришла в 19:20, затаившись в прачечной, где у неё и нашли молоток. Загнанная в угол, она тихо произнесла: «Завещание. Всё дело в завещании. Остальное вы и так знаете.» В её померкших глазах я увидел лишь холодную, нечеловеческую пустоту.';
  assert.deepEqual(validate(text, p).problems, []);
});
