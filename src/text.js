// Тексты по-русски: улики, главная улика, подсказки, история дела.

import { THEMES } from './themes.js';
import { context } from './logic.js';

// Сущности внутри текста помечаем служебными символами: \u0001kind:id\u0002текст\u0003.
// clueText их вырезает, clueParts — разбирает на части для подсветки.
const mark = (kind, id, text) => `\u0001${kind}:${id}\u0002${text}\u0003`;
const strip = (t) => t.replace(/\u0001[^\u0002]*\u0002/g, '').replace(/\u0003/g, '');

function parse(t) {
  const parts = [];
  const re = /\u0001(\w+):(\d+)\u0002([^\u0003]*)\u0003/g;
  let last = 0;
  for (const m of t.matchAll(re)) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    parts.push({ kind: m[1], id: Number(m[2]), text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return parts;
}

const partText = (part) => (typeof part === 'string' ? part : part.text);

// Заглавная буква — первая буква текста, даже если она внутри пометки.
function capitalize(t) {
  const i = t[0] === '\u0001' ? t.indexOf('\u0002') + 1 : 0;
  return t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
}
const byGender = (gender, m, f) => (gender === 'f' ? f : m);

export const valueName = (puzzle, k, v) => puzzle.categories[k].values[v].name;

// Синонимы: у каждой улики свой набор (clue.say), чтобы текст не был однообразным.
const WORDS = [
  { came: ['пришёл', 'пришла'], cameAll: 'пришли', cameSomeone: 'приходил', was: ['был', 'была'] },
  { came: ['появился', 'появилась'], cameAll: 'появились', cameSomeone: 'появлялся', was: ['находился', 'находилась'] },
];
const verb = (pair, gender) => byGender(gender, pair[0], pair[1]);

// «кто был в подвале», «у кого нашли верёвку», «кто пришёл в 21:30»
function clause(puzzle, s, w) {
  const cat = puzzle.categories[s.k];
  const value = cat.values[s.v];
  switch (cat.key) {
    case 'place':
      return `кто ${w.was[0]} ${mark('place', s.v, value.loc)}`;
    case 'item':
      return `у кого нашли ${mark('item', s.v, value.acc)}`;
    case 'time':
      return `кто ${w.came[0]} в ${mark('time', s.v, value.name)}`;
    default:
      throw new Error(`unknown category ${cat.key}`);
  }
}

const PRONOUN = { nom: 'тот', gen: 'того', ins: 'тем' };

// Субъект в падеже: имя или «тот, кто …». open — придаточное, после него нужна запятая.
function subject(puzzle, s, form, w) {
  if (s.g !== undefined) {
    const person = puzzle.suspects[s.g];
    return { text: mark('who', s.g, form === 'nom' ? person.name : person[form]), gender: person.gender };
  }
  return { text: `${PRONOUN[form]}, ${clause(puzzle, s, w)}`, gender: 'm', open: true };
}

// Собрать предложение из строк и субъектов, расставив запятые после «тот, кто …».
function sentence(...parts) {
  const words = parts.map((part, i) => {
    if (typeof part === 'string') return part;
    return part.open && i < parts.length - 1 ? `${part.text},` : part.text;
  });
  return `${capitalize(words.join(' '))}.`;
}

// «Вера была в подвале», «Верёвку нашли не у Веры», «Вера пришла в 21:30». Текст с пометками.
function fact(puzzle, s, k, v, negative, say = 0) {
  const w = WORDS[say];
  const cat = puzzle.categories[k];
  const value = cat.values[v];
  const not = negative ? 'не ' : '';
  const S = (form) => subject(puzzle, s, form, w);
  switch (cat.key) {
    case 'place':
      return sentence(S('nom'), `${not}${verb(w.was, S('nom').gender)} ${mark('place', v, value.loc)}`);
    case 'item':
      return say === 1
        ? sentence('у', S('gen'), `${not}нашли ${mark('item', v, value.acc)}`)
        : sentence(mark('item', v, value.acc), `нашли ${not}у`, S('gen'));
    case 'time':
      return sentence(S('nom'), `${verb(w.came, S('nom').gender)} ${not}в ${mark('time', v, value.name)}`);
    default:
      throw new Error(`unknown category ${cat.key}`);
  }
}

// Текст улики с пометками сущностей.
function clueMarked(puzzle, clue) {
  const say = clue.say ?? 0;
  const w = WORDS[say];
  const S = (s, form = 'nom') => subject(puzzle, s, form, w);
  const came = (s) => verb(w.came, S(s).gender);
  switch (clue.type) {
    case 'is':
    case 'not':
      return fact(puzzle, clue.s, clue.k, clue.v, clue.type === 'not', say);
    case 'next': {
      const both = S(clue.a).gender === 'f' && S(clue.b).gender === 'f';
      return sentence(S(clue.a), 'и', S(clue.b), `${w.cameAll} ${both ? 'одна за другой' : 'один за другим'}`);
    }
    case 'notNext':
      return sentence('между', S(clue.a, 'ins'), 'и', S(clue.b, 'ins'), `${w.cameSomeone} кто-то ещё`);
    case 'left':
      if (clue.flip) return sentence(S(clue.b), `${came(clue.b)} позже`, S(clue.a, 'gen'));
      return sentence(S(clue.a), `${came(clue.a)} раньше`, S(clue.b, 'gen'));
    case 'rightNext':
      if (clue.flip) return sentence(S(clue.b), `${came(clue.b)} прямо перед`, S(clue.a, 'ins'));
      return sentence(S(clue.a), `${came(clue.a)} сразу после`, S(clue.b, 'gen'));
    case 'edge': {
      const g = S(clue.a).gender;
      return sentence(S(clue.a), `${came(clue.a)} ${byGender(g, 'первым или последним', 'первой или последней')}`);
    }
    case 'notEdge': {
      const g = S(clue.a).gender;
      return sentence(S(clue.a), `${came(clue.a)} ${byGender(g, 'не первым и не последним', 'не первой и не последней')}`);
    }
    default:
      throw new Error(`unknown clue ${clue.type}`);
  }
}

export const clueText = (puzzle, clue) => strip(clueMarked(puzzle, clue));

// Улика по частям: строки и сущности { kind, id, text }.
export const clueParts = (puzzle, clue) => parse(clueMarked(puzzle, clue));

// Факт про человека — для подсказок: «Вера не была в подвале».
export function factText(puzzle, g, k, v, negative = false) {
  return strip(fact(puzzle, { g }, k, v, negative));
}

export const GROUP_TITLES = { who: 'Кто пришёл', place: 'Где был', item: 'Что нашли' };

// Что стоит в строке доски: { kind, v, name } — имя человека или название места/предмета (как в categories[k].values[v].name).
export function rowInfo(puzzle, row) {
  const { n, groups } = context(puzzle);
  const group = groups[Math.floor(row / n)];
  const v = row % n;
  const name = group.key === 'who' ? puzzle.suspects[v].name : puzzle.categories[group.k].values[v].name;
  return { kind: group.key, v, name };
}

const slotTime = (puzzle, slot) => puzzle.categories[context(puzzle).orderK].values[slot].name;

// «У Веры», «У места «часовня»», «У предмета «ремень»».
function rowOwner(puzzle, row) {
  const info = rowInfo(puzzle, row);
  if (info.kind === 'who') return `У ${puzzle.suspects[info.v].gen}`;
  return `У ${info.kind === 'place' ? 'места' : 'предмета'} «${info.name}»`;
}

// Подсказка словами по шагу решателя (logic.nextStep). detail: false — куда смотреть, true — что отметить.
export function hintText(puzzle, step, detail) {
  const { reason, removals } = step;
  if (reason.kind === 'clue') {
    const num = reason.index + 1;
    if (!detail) return `Посмотри на улику №${num}.`;
    // вычеркнутое по строкам — в порядке появления, время по порядку
    const byRow = new Map();
    for (const [row, slot] of removals) {
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row).push(slot);
    }
    const list = [...byRow].map(([row, slots]) => {
      const times = [...slots].sort((a, b) => a - b).map((s) => slotTime(puzzle, s));
      return `${rowInfo(puzzle, row).name} — не ${times.join(', ')}`;
    });
    const what = list.length ? ` ${capitalize(list.join('; '))}.` : '';
    return `Улика №${num}.${what} Вычеркни подсвеченное.`;
  }
  const time = slotTime(puzzle, reason.slot);
  if (reason.kind === 'single') {
    const text = `${rowOwner(puzzle, reason.row)} остался один вариант времени`;
    return detail ? `${text} — ${time}. Поставь ✓.` : `${text}.`;
  }
  const info = rowInfo(puzzle, reason.row);
  const title = GROUP_TITLES[info.kind];
  if (!detail) return `Посмотри на колонку ${time}: в строках «${title}» там остался один вариант.`;
  return `В колонке ${time} в строках «${title}» остался один вариант — ${info.name}. Поставь ✓.`;
}

export const STORY = {
  confessions: [
    (x) => `Я не ${x('хотел', 'хотела')}, чтобы так вышло. Он сам открыл мне дверь.`,
    () => 'Вы бы сделали то же самое, если бы знали, что он скрывал.',
    (x) => `Я ${x('ждал', 'ждала')} этой ночи двенадцать лет.`,
    (x) => `Я ${x('знал', 'знала')}, что вы догадаетесь. Но не ${x('думал', 'думала')}, что так быстро.`,
    () => 'Тише. Он всё ещё здесь — я слышу его шаги наверху.',
    (x) => `Он обещал, что это его последняя ложь. Я просто ${x('помог', 'помогла')} ему сдержать слово.`,
    () => 'Завещание. Всё дело в завещании. Остальное вы и так знаете.',
    (x) => `Я ${x('пришёл', 'пришла')} только поговорить. Честно.`,
    () => 'Этот дом сам этого хотел. Разве вы не чувствуете?',
    (x) => `Двадцать лет я ${x('молчал', 'молчала')}. Хватит.`,
    () => 'Он смеялся. До самого конца он смеялся.',
    () => 'Не смотрите на меня так. Вы бы тоже не выдержали.',
  ],
};

export const rulesText = (puzzle) => THEMES[puzzle.theme].rules;
export const introText = (puzzle) => THEMES[puzzle.theme].intros[puzzle.story.intro].text;
export const themeTitle = (puzzle) => THEMES[puzzle.theme].title;

export function mainClueText(puzzle) {
  const { k, v } = puzzle.culpritClue;
  const cat = puzzle.categories[k];
  return THEMES[puzzle.theme].main[cat.key][puzzle.story.main].text(cat.values[v]);
}

// Главная улика по частям. Темы сами решают, какое поле значения взять (name, loc, to, acc),
// поэтому помечаем все поля, а регистр букв берём из готового текста (cap() мог поднять первую).
export function mainClueParts(puzzle) {
  const { k, v } = puzzle.culpritClue;
  const cat = puzzle.categories[k];
  const value = cat.values[v];
  const marked = Object.fromEntries(Object.entries(value).map(([f, t]) => [f, typeof t === 'string' ? mark(cat.key, v, t) : t]));
  const parts = parse(THEMES[puzzle.theme].main[cat.key][puzzle.story.main].text(marked));
  const plain = mainClueText(puzzle);
  let at = 0;
  return parts.map((part) => {
    const text = plain.slice(at, at + partText(part).length);
    at += text.length;
    return typeof part === 'string' ? text : { ...part, text };
  });
}

export function confessionText(puzzle) {
  const person = puzzle.suspects[puzzle.culprit];
  const x = (m, f) => byGender(person.gender, m, f);
  return STORY.confessions[puzzle.story.confession](x);
}
