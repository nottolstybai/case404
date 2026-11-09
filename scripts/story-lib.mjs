// История дела от нейросети: факты → запрос → проверка ответа.
// Запросом занимается scripts/story.mjs; здесь только то, что можно проверить тестами.

import { caseId } from '../src/daily.js';
import { SUSPECTS } from '../src/suspects.js';
import { THEMES } from '../src/themes.js';
import { confessionText, introText, mainClueText } from '../src/text.js';

const byGender = (gender, m, f) => (gender === 'f' ? f : m);

// Что известно о каждом: время, место, предмет.
export function facts(puzzle) {
  const index = (key) => puzzle.categories.findIndex((c) => c.key === key);
  const [T, P, I] = [index('time'), index('place'), index('item')];
  const value = (g, k) => puzzle.categories[k].values[puzzle.solution[g][k]];
  return puzzle.suspects.map((person, g) => ({
    person,
    time: value(g, T),
    place: value(g, P),
    item: value(g, I),
    culprit: g === puzzle.culprit,
  }));
}

// Факты — коротко, как в таблице: так модели нечего копировать готовыми фразами.
function line({ person, time, place, item }) {
  return `${person.name} (${person.role}, ${byGender(person.gender, 'он', 'она')}) | время: ${time.name} | место: ${place.loc} | предмет: ${item.acc}`;
}

// Приём рассказа — свой у каждого дня, чтобы истории не были похожи одна на другую.
export const ANGLES = [
  'начни с того, что случилось между преступником и жертвой задолго до этой ночи',
  'начни с минуты, когда преступник вошёл, и только потом объясни, зачем',
  'начни с невиновного и его маленькой тайны, а к преступнику перейди во второй половине',
  'начни с предмета преступника: откуда он взялся и для чего был нужен',
  'начни с места, где был преступник: почему именно там',
  'начни с того, что знала жертва и чего боялась',
  'построй историю на контрасте: чем были заняты остальные, пока преступник делал своё дело',
  'начни с последнего разговора преступника и жертвы',
];

// Тела нет — модель не должна «находить тело» и писать об убийстве.
export const BODY_NOTE = '— Жертва пропала, тела не нашли: не пиши, что её убили или что нашли тело. Что с ней стало — оставь недосказанным.';

// Факты остаются таблицей, а всё человеческое (мотив, прошлое, тайны невиновных) модель придумывает сама.
export function buildPrompt(puzzle) {
  const theme = THEMES[puzzle.theme];
  const all = facts(puzzle);
  const culprit = all.find((f) => f.culprit);
  const angle = ANGLES[((puzzle.number % ANGLES.length) + ANGLES.length) % ANGLES.length];
  const body = theme.intros[puzzle.story.intro].body;
  return `Ты пишешь развязку для ежедневной детективной игры «Дело №${puzzle.number}». Игрок уже вычислил преступника по уликам. Теперь он хочет узнать, что на самом деле случилось той ночью: кто эти люди и зачем они это сделали.

Нужна микроистория о людях, а не отчёт следователя и не пересказ таблицы фактов.

Что ты придумываешь сам (в фактах этого нет — здесь у тебя свобода):
— Кем преступник приходился жертве и что между ними произошло раньше. Исходи из его роли (${culprit.person.role}) и места действия.
— Мотив: конкретный и человеческий — долг, наследство, шантаж, ревность, старая вина, страх разоблачения, месть за близкого. Мотив должен объяснять признание преступника: признание — ключ к нему.
— Зачем преступнику его предмет и почему он оказался именно там, где был.
— Для одного-двух невиновных — их собственную маленькую тайну: чем они на самом деле были заняты там, где были, зачем им их предмет и почему они молчали на допросе. Тайна не преступная, но объясняет, почему они выглядели подозрительно.

Как построить историю (100–150 слов, 6–9 предложений разной длины):
1. Что связывало преступника и жертву — мотив.
2. Та ночь: преступник приходит в своё время, его место и его предмет — в действии, а не в перечислении.
3. Один-два невиновных: чем они были заняты на самом деле.
4. Признание — дословно, в кавычках «…», и после него одна короткая финальная фраза.
Приём для этой истории: ${angle}. Если приём требует начать с другого — меняй порядок пунктов, но все четыре должны остаться, а признание всегда идёт в конце.

Стиль: третье лицо, прошедшее время. Простые точные фразы, конкретные детали вместо прилагательных. Мрачно, но без крови и натурализма. Никакого следователя и никакого «я» (кроме слов внутри признания). Прямая речь — только в кавычках «…», без реплик через тире. Без штампов вроде «тайна ушла вместе с ним» или «теперь здесь только тишина».

Жёсткие правила — факты менять нельзя:
— Время — это момент, когда человек пришёл. Место — где он был в момент преступления. Предмет — что у него потом нашли.
— У каждого только свои время, место и предмет. Время, место или предмет упоминай только в том предложении, где их владелец назван по имени (не «он» или «она»), и не ставь в это предложение чужие.
— Места и предметы из списка принадлежат только своим владельцам: не используй их в предыстории и в чужих тайнах.
— Обязательно назови преступника по имени, его место и его предмет.
— Время пиши цифрами, как в фактах (20:15), и только как момент прихода: не «до», не «к» и не «с» какого-то времени. Не пиши, что кто-то «пришёл из» какого-то места.
— Новых имён не придумывай. Жертву называй так же, как во вступлении, без имени.
— Предмет преступника — не обязательно орудие: называй его орудием, только если так сказано в главной улике.${body === false ? `\n${BODY_NOTE}` : ''}

Ответ — JSON вида {"motive": "…", "story": "…"}.
motive — мотив одной короткой фразой, до 12 слов, с маленькой буквы и без точки в конце: например, «долг, который ему отказались простить».
story — только сама история, одним-двумя абзацами, без заголовка, черновиков, пояснений и разметки.

Факты:
Место действия: ${theme.title}.
Вступление (игрок его уже читал, не пересказывай): ${introText(puzzle)}
Главная улика: ${mainClueText(puzzle)}
Подозреваемые (имя | время прихода | где был в момент преступления | что у него нашли):
${all.map((f) => `— ${line(f)}`).join('\n')}
Преступник — ${line(culprit)}
Признание преступника (приведи дословно): «${confessionText(puzzle)}»`;
}

const normal = (text) => text.toLowerCase().replaceAll('ё', 'е');
// основа слова: «душевая» → «душев», «верёвка» → «веревк», «багажный» → «багажн»
const stem = (word) => normal(word).replace(/(ая|яя|ой|ый|ий)$/, '').replace(/[аяыиеоуьй]$/, '');

// Есть ли слово в тексте в любом падеже: основа + до трёх букв окончания.
export function mentions(text, word) {
  const base = stem(word);
  return new RegExp(`(^|[^а-я])${base}[а-я]{0,3}([^а-я]|$)`).test(normal(text));
}

// Имя, написанное с заглавной буквы (чтобы «вера в людей» не считалась Верой).
function mentionsName(text, name) {
  const base = name.replaceAll('ё', 'е').replace(/[аяь]$/, '');
  return new RegExp(`(^|[^А-Яа-яЁё])${base}[а-яё]{0,3}([^а-яё]|$)`).test(text.replaceAll('ё', 'е'));
}

// Человек упомянут в любой форме: Павел, Павла, Павлом (беглая «е» — поэтому по всем формам).
const mentionsPerson = (text, person) => [person.name, person.gen, person.ins].some((form) => mentionsName(text, form));

// Чужие имена: из общего списка подозреваемых, но не из этого дела.
function strangers(text, puzzle) {
  const inCase = new Set(puzzle.suspects.map((s) => s.name));
  return SUSPECTS.filter((other) => !inCase.has(other.name) && mentionsPerson(text, other)).map((other) => `чужое имя: ${other.name}`);
}

// «Я» вне кавычек — значит, модель снова пишет отчёт следователя. В признании «я» — законно.
const FIRST_PERSON = /(^|[^а-яё])(я|мне|меня|мной)(?![а-яё])/i;
export const firstPerson = (text) => FIRST_PERSON.test(text.replace(/«[^»]*»/g, ' '));

// Подходит ли ответ модели: преступник, его место и предмет на месте; чужих имён нет.
export function validate(text, puzzle) {
  const problems = [];
  const words = text.trim().split(/\s+/).length;
  // просим 100–150 слов; модели считают слова плохо — запас в обе стороны
  if (words < 60) problems.push(`слишком коротко: ${words} слов`);
  if (words > 210) problems.push(`слишком длинно: ${words} слов`);
  const culprit = facts(puzzle).find((f) => f.culprit);
  if (!mentionsPerson(text, culprit.person)) problems.push(`нет имени преступника (${culprit.person.name})`);
  if (!mentions(text, culprit.place.name)) problems.push(`нет места преступника (${culprit.place.name})`);
  if (!mentions(text, culprit.item.name)) problems.push(`нет предмета преступника (${culprit.item.name})`);
  problems.push(...strangers(text, puzzle));
  if (firstPerson(text)) problems.push('от первого лица — нужно третье');
  if (/[*#_`]/.test(text)) problems.push('разметка в тексте');
  // черновики и обрывки: история — это обычный русский текст, законченный точкой
  if (/[A-Za-z]/.test(text)) problems.push('латиница в тексте');
  if (/^\s*\d+[.)]\s/m.test(text)) problems.push('нумерованные строки');
  if (!/^[«"—–-]?\s*[А-ЯЁ]/.test(text.trim())) problems.push('начинается не с заглавной буквы');
  if (!/[.!?…»"]$/.test(text.trim())) problems.push('оборвано: нет точки в конце');
  if ((text.match(/\n/g) ?? []).length > 3) problems.push('слишком много строк');
  // время — момент прихода: «до 20:40», «к 20:30», «с 20:00» меняют смысл
  if (/(^|[^а-яё])(до|к|с|со) \d{1,2}:\d{2}/i.test(text)) problems.push('«до/к/с ЧЧ:ММ» — время означает момент прихода');
  // время словами («к двадцати тридцати») — обход того же правила; время пишем цифрами, как в фактах
  if (/(^|[^а-яё])(восемнадцат|девятнадцат|двадцат|полночь|полуноч)[а-яё]*\s+(ноль|час|пятнадцат|двадцат|тридцат|сорок|пятьдесят|десят)/i.test(text)) {
    problems.push('время словами — пишем цифрами, как в фактах');
  }
  problems.push(...swapped(text, puzzle));
  return { ok: problems.length === 0, problems };
}

// Мотив одной фразой — подпись над историей. Плохой мотив историю не губит: её сохраним без него.
export function validateMotive(motive, puzzle) {
  const text = typeof motive === 'string' ? motive.trim() : '';
  if (!text) return { ok: false, problems: ['нет мотива'] };
  const problems = [];
  const words = text.split(/\s+/).length;
  if (words < 2) problems.push(`мотив слишком короткий: ${words} слов`);
  if (words > 14) problems.push(`мотив слишком длинный: ${words} слов`);
  if (text.length > 110) problems.push(`мотив длиннее 110 знаков: ${text.length}`);
  if (/\n/.test(text)) problems.push('мотив в несколько строк');
  if (/[*#_`]/.test(text)) problems.push('разметка в мотиве');
  if (/[A-Za-z]/.test(text)) problems.push('латиница в мотиве');
  // время — факт игры; в мотиве оно только путает
  if (/\d{1,2}:\d{2}/.test(text)) problems.push('время в мотиве');
  problems.push(...strangers(text, puzzle));
  return { ok: problems.length === 0, problems };
}

// Мотив для показа: без кавычек и точки, с маленькой буквы — если это не имя из дела.
export function normalMotive(motive, puzzle) {
  let text = motive.trim().replace(/^«([^«»]*)»$/, '$1').replace(/^"([^"]*)"$/, '$1').trim();
  if (/[^.]\.$/.test(text)) text = text.slice(0, -1).trimEnd();
  const first = text.split(/[\s,]/)[0];
  const isName = puzzle.suspects.some((person) => mentionsPerson(first, person));
  return isName ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

// Подмена фактов: в предложении названы другие люди, а время, место или предмет —
// чужие (их владельца в этом предложении нет). «Мирон пришёл в 19:20», если в 19:20 пришла Марта.
function swapped(text, puzzle) {
  const all = facts(puzzle);
  const problems = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    const named = all.filter((f) => mentionsPerson(sentence, f.person));
    if (!named.length) continue;
    for (const owner of all) {
      if (named.includes(owner)) continue;
      const hits = [
        sentence.includes(owner.time.name) && owner.time.name,
        mentions(sentence, owner.place.name) && owner.place.name,
        mentions(sentence, owner.item.name) && owner.item.name,
      ].filter(Boolean);
      // одно и то же место или предмет может быть у разных людей только по ошибке — проверяем строго
      for (const what of hits) {
        problems.push(`«${what}» приписано не тому: в предложении ${named.map((f) => f.person.name).join(', ')}, а это — ${owner.person.name}`);
      }
    }
  }
  return problems;
}

// Текст ответа Interactions API (через него Google даёт Gemma).
// По справке API текст лежит в steps[type=model_output].content[type=text].text,
// в части примеров документации — в outputs[type=text].text; понимаем оба вида.
export function interactionText(data) {
  const fromSteps = (data.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
  if (fromSteps) return fromSteps;
  return (data.outputs ?? [])
    .filter((o) => o.type === 'text')
    .map((o) => o.text ?? '')
    .join('');
}

// Мягко достать ответ: JSON {"motive": "…", "story": "…"} (можно в ```json … ```) или просто текст без фигурных скобок.
// motive — '' если модель его не дала. null — разобрать не получилось. Годится ли текст, решают validate*().
export function looseAnswer(text) {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const { story, motive } = JSON.parse(unfenced.slice(start, end + 1));
      if (typeof story === 'string' && story.trim()) return { story, motive: typeof motive === 'string' ? motive : '' };
    } catch {
      // не JSON — ниже
    }
  }
  return unfenced && !unfenced.includes('{') ? { story: unfenced, motive: '' } : null;
}

export const looseStory = (text) => looseAnswer(text)?.story ?? null;

// Свежий ли готовый файл: разбирается и написан для этого же дела (дело могли пересобрать).
export function isCurrent(json, puzzle) {
  try {
    return JSON.parse(json)?.id === caseId(puzzle);
  } catch {
    return false;
  }
}

// Привести ответ к простому тексту: убрать кавычки вокруг и лишние пробелы.
export const clean = (text) =>
  text
    .replace(/"([^"\n]+)"/g, '«$1»') // прямые кавычки → «ёлочки»
    .trim()
    .replace(/^[«"]|[»"]$/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

// Заглушка вместо нейросети — чтобы проверить весь путь без ключа.
// Третье лицо; без тела — ни слова о том, что жертву убили.
export function mockStory(puzzle) {
  const all = facts(puzzle);
  const { person, time, place, item } = all.find((f) => f.culprit);
  const other = all.find((f) => !f.culprit);
  const x = (m, f) => byGender(person.gender, m, f);
  const y = (m, f) => byGender(other.person.gender, m, f);
  return [
    `Много лет ${person.name} ${x('молчал', 'молчала')} о старом долге, и этой ночью молчать стало нельзя.`,
    `${person.name} ${x('пришёл', 'пришла')} в ${time.name} и ${x('был', 'была')} ${place.loc}, когда всё вокруг стихло.`,
    `У ${x('него', 'неё')} потом нашли ${item.acc}: ${x('он', 'она')} так и не ${x('решился', 'решилась')} от этого избавиться.`,
    `${other.person.name} ${y('пришёл', 'пришла')} в ${other.time.name} и ${y('был', 'была')} ${other.place.loc}, но на допросе ${y('молчал', 'молчала')}: у ${y('него', 'неё')} нашли ${other.item.acc}, а объяснять зачем ${y('ему', 'ей')} не хотелось.`,
    THEMES[puzzle.theme].intros[puzzle.story.intro].body === false ? 'К утру от жертвы не осталось и следа.' : 'К утру всё было кончено.',
    `«${confessionText(puzzle)}» — ${x('сказал', 'сказала')} ${person.name} и ${x('отвернулся', 'отвернулась')} к стене.`,
    'Больше об этой ночи никто не заговаривал.',
  ].join(' ');
}

export function mockMotive(puzzle) {
  const { person } = facts(puzzle).find((f) => f.culprit);
  return `старый долг, о котором ${person.name} ${byGender(person.gender, 'молчал', 'молчала')} много лет`;
}
