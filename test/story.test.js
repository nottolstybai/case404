import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseId, dailyPuzzle } from '../src/daily.js';
import { THEMES } from '../src/themes.js';
import { confessionText } from '../src/text.js';
import {
  BODY_NOTE,
  buildPrompt,
  clean,
  facts,
  isCurrent,
  looseAnswer,
  mockMotive,
  mockStory,
  normalMotive,
  validate,
  validateMotive,
} from '../scripts/story-lib.mjs';
import { days } from './helpers.js';

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
    const culprit = p.suspects[p.culprit];
    assert.ok(prompt.includes(`Преступник — ${culprit.name} (${culprit.role}`), key);
    assert.ok(prompt.includes(`«${confessionText(p)}»`), key);
    assert.ok(prompt.includes(`Исходи из его роли (${culprit.role})`), key);
    assert.ok(prompt.includes('Ответ — JSON вида {"motive": "…", "story": "…"}'), key);
    assert.ok(!prompt.includes('следователя, прошедшее'), key);
  }
});

test('«тела не нашли» — только в делах, где тела нет', () => {
  const body = (p) => THEMES[p.theme].intros[p.story.intro].body;
  const all = days(60, '2026-11-01').map(dailyPuzzle);
  const missing = all.find((p) => body(p) === false);
  const found = all.find((p) => body(p) !== false);
  assert.ok(missing && found, 'за 60 дней нет дела с телом или без тела');
  assert.ok(buildPrompt(missing).includes('тела не нашли'));
  assert.ok(buildPrompt(missing).includes(BODY_NOTE));
  assert.ok(!buildPrompt(found).includes('тела не нашли'));
  // без пометки нет и лишней пустой строки между правилами
  assert.ok(buildPrompt(found).includes('только если так сказано в главной улике.\n\nОтвет'));
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
  // нужен день, где преступник был в месте-прилагательном (душевая, кладовая …)
  let p = null;
  for (const key of days(60, '2026-11-01')) {
    p = dailyPuzzle(key);
    if (/ая$/.test(facts(p).find((f) => f.culprit).place.name)) break;
    p = null;
  }
  assert.ok(p, 'за 60 дней нет преступника в месте-прилагательном');
  const c = facts(p).find((f) => f.culprit);
  const text = mockStory(p);
  assert.ok(text.includes(c.place.loc));
  for (const form of [c.place.loc, c.place.to, c.place.name, c.place.name.replace(/ая$/, 'ой')]) {
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
  assert.equal(clean('Она сказала: "Я ни при чём." И ушла.'), 'Она сказала: «Я ни при чём.» И ушла.');
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
  assert.ok(validate(before, p).problems.some((x) => x.startsWith('«до/к/с ЧЧ:ММ»')));
  for (const phrase of [`к ${other.time.name}`, `с ${other.time.name}`]) {
    assert.ok(validate(`${base} ${other.person.name} был там ${phrase}.`, p).problems.some((x) => x.startsWith('«до/к/с')), phrase);
  }
  const fair = `${base} ${other.person.name} пришёл в ${other.time.name} и был ${other.place.loc}.`;
  assert.deepEqual(validate(fair, p).problems, []);
});

test('хорошая история в новом духе проходит проверку', () => {
  // мотив, та ночь, маленькая тайна невиновного, признание дословно, короткий финал
  const p = dailyPuzzle('2026-11-07');
  const all = facts(p);
  const c = all.find((f) => f.culprit);
  const o = all.find((f) => !f.culprit);
  const x = (m, f) => (c.person.gender === 'f' ? f : m);
  const y = (m, f) => (o.person.gender === 'f' ? f : m);
  const text = [
    `Двадцать лет назад граф выгнал из дома отца ${c.person.gen}, и тот так и не оправился.`,
    `Много лет спустя ${x('он', 'она')} ${x('вернулся', 'вернулась')} в усадьбу под чужой маской — ${x('тихим', 'тихой')} и ${x('услужливым', 'услужливой')}.`,
    `В ${c.time.name} ${c.person.name} ${x('пришёл', 'пришла')} и ${x('встал', 'встала')} ${c.place.loc}, где граф каждую ночь проходил один.`,
    `У ${x('него', 'неё')} потом нашли ${c.item.acc}, и объяснить это было нечем.`,
    `${o.person.name} в ту же ночь ${y('пришёл', 'пришла')} в ${o.time.name} и ${y('был', 'была')} ${o.place.loc} совсем по другой причине: ${y('он', 'она')} тайком ${y('писал', 'писала')} письма, которые никогда не ${y('решался', 'решалась')} отправить.`,
    `Поэтому на допросе ${y('он', 'она')} ${y('отвечал', 'отвечала')} невпопад, а у ${y('него', 'неё')} нашли ${o.item.acc}.`,
    `Когда всё открылось, ${c.person.name} не ${x('стал', 'стала')} спорить: «${confessionText(p)}»`,
    'Портрет графа в гостиной с утра повернули к стене.',
  ].join(' ');
  assert.deepEqual(validate(text, p).problems, []);
  // а если перепутать место преступника с чужим — проверка это видит
  const swapped = text.replace(`встала ${c.place.loc}`, `встала ${o.place.loc}`).replace(`встал ${c.place.loc}`, `встал ${o.place.loc}`);
  assert.ok(validate(swapped, p).problems.some((x) => x.includes('приписано не тому')));
});

test('у соседних дней разные приёмы рассказа', async () => {
  const { ANGLES } = await import('../scripts/story-lib.mjs');
  const angle = (key) => ANGLES.find((a) => buildPrompt(dailyPuzzle(key)).includes(a));
  assert.notEqual(angle('2026-11-06'), angle('2026-11-07'));
  assert.ok(angle('2026-11-06'));
});

test('ответ Interactions API (Gemma): текст в steps или outputs', async () => {
  const { interactionText } = await import('../scripts/story-lib.mjs');
  const steps = {
    status: 'completed',
    steps: [
      { type: 'thought', content: [{ type: 'text', text: 'размышления' }] },
      { type: 'model_output', content: [{ type: 'text', text: '{"story": "Раз."}' }] },
    ],
  };
  assert.equal(interactionText(steps), '{"story": "Раз."}');
  assert.equal(interactionText({ outputs: [{ type: 'text', text: 'Два.' }] }), 'Два.');
  assert.equal(interactionText({ status: 'completed' }), '');
});

test('мягкий разбор ответа: JSON, JSON в ```json, просто текст, мусор', async () => {
  const { looseStory } = await import('../scripts/story-lib.mjs');
  assert.equal(looseStory('{"story": "Текст."}'), 'Текст.');
  assert.equal(looseStory('```json\n{"story": "Текст."}\n```'), 'Текст.');
  assert.equal(looseStory('Вот история:\n{"story": "Текст."}'), 'Текст.');
  assert.equal(looseStory('Просто история без скобок.'), 'Просто история без скобок.');
  assert.equal(looseStory('{"story": сломано'), null);
});

test('время словами не проходит: «к двадцати тридцати»', () => {
  const p = dailyPuzzle('2026-11-06');
  const base = mockStory(p);
  for (const phrase of ['Мирон к двадцати тридцати уже сидел там.', 'Нина была там с двадцати ноль.', 'Он пришёл в двадцать пятнадцать.']) {
    assert.ok(validate(`${base} ${phrase}`, p).problems.some((x) => x.startsWith('время словами')), phrase);
  }
  assert.deepEqual(validate(base, p).problems, []);
});

test('мягкий разбор ответа с мотивом: JSON, ```json, без мотива, просто текст, мусор', () => {
  assert.deepEqual(looseAnswer('{"motive": "долг", "story": "Текст."}'), { story: 'Текст.', motive: 'долг' });
  assert.deepEqual(looseAnswer('```json\n{"motive": "долг", "story": "Текст."}\n```'), { story: 'Текст.', motive: 'долг' });
  assert.deepEqual(looseAnswer('{"story": "Текст."}'), { story: 'Текст.', motive: '' });
  assert.deepEqual(looseAnswer('Просто история без скобок.'), { story: 'Просто история без скобок.', motive: '' });
  assert.equal(looseAnswer('{"motive": "долг", сломано'), null);
  assert.equal(looseAnswer('{"motive": "долг"}'), null);
});

test('первое лицо не проходит, «я» внутри признания — можно', () => {
  const p = dailyPuzzle('2026-11-06');
  const base = mockStory(p);
  assert.ok(validate(`Я вошёл в кабинет первым. ${base}`, p).problems.includes('от первого лица — нужно третье'));
  for (const phrase of ['Мне было не по себе.', 'Он посмотрел на меня.', 'Со мной никто не спорил, и я ушёл.', 'Перед мной лежал ключ.']) {
    assert.ok(validate(`${base} ${phrase}`, p).problems.includes('от первого лица — нужно третье'), phrase);
  }
  // в признании «я» законно; «Яков», «мнение», «земля» — не местоимения
  assert.ok(base.includes('«'));
  assert.ok(!validate(`${base} Она шепнула: «Я вошла в кабинет первой, и мне не стыдно».`, p).problems.includes('от первого лица — нужно третье'));
  assert.ok(!validate(`${base} Его мнение о земле и семье никого не волновало.`, p).problems.includes('от первого лица — нужно третье'));
});

test('проверка мотива', () => {
  const p = dailyPuzzle('2026-11-06');
  const culprit = p.suspects[p.culprit];
  const stranger = ['Вера', 'Глеб', 'Яков', 'Зоя'].find((n) => !p.suspects.some((s) => s.name === n));
  for (const good of ['долг, который хозяин отказался простить', 'страх разоблачения', `месть за брата, которого ${culprit.name} так и не простил`, mockMotive(p)]) {
    assert.deepEqual(validateMotive(good, p).problems, [], good);
  }
  const bad = [
    '',
    '   ',
    'месть',
    'долг '.repeat(15).trim(),
    `${'очень '.repeat(17)}долгий мотив`,
    'встреча в 20:15, которую нельзя было пропустить',
    `ревность к ${stranger === 'Зоя' ? 'Зое' : stranger}`,
    `ревность, о которой знал ${stranger}`,
    'старый debt за дом',
    'долг\nи наследство',
    '**шантаж** и деньги',
  ];
  for (const motive of bad) assert.equal(validateMotive(motive, p).ok, false, motive);
  assert.equal(validateMotive(undefined, p).ok, false);
});

test('мотив для показа: кавычки, точка, маленькая буква — кроме имени', () => {
  const p = dailyPuzzle('2026-11-06');
  const culprit = p.suspects[p.culprit];
  assert.equal(normalMotive('  Долг, который хозяин отказался простить.  ', p), 'долг, который хозяин отказался простить');
  assert.equal(normalMotive('«Страх разоблачения»', p), 'страх разоблачения');
  assert.equal(normalMotive('"Месть за брата."', p), 'месть за брата');
  assert.equal(normalMotive('месть…', p), 'месть…');
  assert.equal(normalMotive(`${culprit.name} не смог простить старый долг.`, p), `${culprit.name} не смог простить старый долг`);
  assert.equal(normalMotive(`${culprit.gen} давний страх`, p), `${culprit.gen} давний страх`);
});

test('готовый файл истории: свежий, только если id того же дела', () => {
  const p = dailyPuzzle('2026-11-10');
  const json = (id) => JSON.stringify({ date: '2026-11-10', number: p.number, id, model: 'mock', text: 'Текст.' });
  assert.equal(isCurrent(json(caseId(p)), p), true);
  assert.equal(isCurrent(json(caseId(p) + 1), p), false);
  assert.equal(isCurrent(json(undefined), p), false);
  assert.equal(isCurrent('{"id": 1', p), false);
  assert.equal(isCurrent('', p), false);
  assert.equal(isCurrent('null', p), false);
});

test('заглушка без тела не пишет об убийстве', () => {
  const missing = days(60, '2026-11-01')
    .map(dailyPuzzle)
    .filter((p) => THEMES[p.theme].intros[p.story.intro].body === false);
  assert.ok(missing.length);
  for (const p of missing) assert.doesNotMatch(mockStory(p), /(^|[^а-яё])(убил|убит|убийств|тела?(?![а-яё])|труп|всё было кончено)/i);
});
