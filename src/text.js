// Тексты по-русски: улики, главная улика, подсказки, история дела.

import { THEMES } from './themes.js';

const capitalize = (t) => t[0].toUpperCase() + t.slice(1);
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
      return `кто ${w.was[0]} ${value.loc}`;
    case 'item':
      return `у кого нашли ${value.acc}`;
    case 'time':
      return `кто ${w.came[0]} в ${value.name}`;
    default:
      throw new Error(`unknown category ${cat.key}`);
  }
}

const PRONOUN = { nom: 'тот', gen: 'того', ins: 'тем' };

// Субъект в падеже: имя или «тот, кто …». open — придаточное, после него нужна запятая.
function subject(puzzle, s, form, w) {
  if (s.g !== undefined) {
    const person = puzzle.suspects[s.g];
    return { text: form === 'nom' ? person.name : person[form], gender: person.gender };
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

// «Вера была в подвале», «Верёвку нашли не у Веры», «Вера пришла в 21:30».
function fact(puzzle, s, k, v, negative, say = 0) {
  const w = WORDS[say];
  const cat = puzzle.categories[k];
  const value = cat.values[v];
  const not = negative ? 'не ' : '';
  const S = (form) => subject(puzzle, s, form, w);
  switch (cat.key) {
    case 'place':
      return sentence(S('nom'), `${not}${verb(w.was, S('nom').gender)} ${value.loc}`);
    case 'item':
      return say === 1
        ? sentence('у', S('gen'), `${not}нашли ${value.acc}`)
        : sentence(value.acc, `нашли ${not}у`, S('gen'));
    case 'time':
      return sentence(S('nom'), `${verb(w.came, S('nom').gender)} ${not}в ${value.name}`);
    default:
      throw new Error(`unknown category ${cat.key}`);
  }
}

export function clueText(puzzle, clue) {
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

// Факт про человека — для подсказок: «Вера не была в подвале».
export function factText(puzzle, g, k, v, negative = false) {
  return fact(puzzle, { g }, k, v, negative);
}

// Подсказка словами по шагу решателя. poss — что игрок уже знает (до шага).
export function stepText(puzzle, step, poss) {
  const { reason, removals } = step;
  if (reason.kind === 'clue') {
    // что следует из улики про первого человека: «Степан пришёл в 21:00» или «вычеркни у Степана: …»
    const [g, k] = removals[0];
    const removed = removals.filter(([a, b]) => a === g && b === k).map(([, , v]) => v);
    const left = [];
    for (let v = 0; v < puzzle.suspects.length; v++) {
      if ((poss[g][k] >> v) & 1 && !removed.includes(v)) left.push(v);
    }
    let detail;
    if (left.length === 1) detail = factText(puzzle, g, k, left[0]);
    else if (removed.length === 1) detail = factText(puzzle, g, k, removed[0], true);
    else detail = `Вычеркни у ${puzzle.suspects[g].gen}: ${removed.map((v) => valueName(puzzle, k, v)).join(', ')}.`;
    const more = removals.length > removed.length ? ' Всё, что из неё следует, подсвечено.' : '';
    return `Улика №${reason.index + 1}. ${detail}${more}`;
  }
  const person = puzzle.suspects[reason.g];
  const name = valueName(puzzle, reason.k, reason.v);
  if (reason.kind === 'single') {
    return `У ${person.gen} остался один вариант — «${name}». Значит, у остальных его нет.`;
  }
  return `Вариант «${name}» остался только у ${person.gen}. Значит, остальное у ${person.gen} можно вычеркнуть.`;
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

export function confessionText(puzzle) {
  const person = puzzle.suspects[puzzle.culprit];
  const x = (m, f) => byGender(person.gender, m, f);
  return STORY.confessions[puzzle.story.confession](x);
}
