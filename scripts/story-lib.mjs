// История дела для Gemini: факты → запрос → проверка ответа.
// Запросом занимается scripts/story.mjs; здесь только то, что можно проверить тестами.

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

function line({ person, time, place, item }) {
  const x = (m, f) => byGender(person.gender, m, f);
  return `${person.name}, ${person.role}: ${x('пришёл', 'пришла')} в ${time.name}, ${x('был', 'была')} ${place.loc}, у ${x('него', 'неё')} нашли ${item.acc}`;
}

// Приём рассказа — свой у каждого дня, чтобы истории не были похожи одна на другую.
export const ANGLES = [
  'начни с мелкой детали на месте преступления, которая не давала тебе покоя',
  'начни с допроса: короткий обмен репликами с одним из невиновных',
  'начни с момента, когда ты понял, кто это, а потом коротко объясни, что его выдало',
  'начни со звука или запаха той ночи и веди от него к главной улике',
  'напиши как запись в блокноте следователя: короткие рубленые фразы',
  'начни с конца — с того, как преступника уводят, — и вернись к тому, что его выдало',
  'начни с предмета, который нашли у преступника, — как он попал тебе в руки',
  'начни с того места, где был преступник, — каким ты его застал',
];

export function buildPrompt(puzzle) {
  const theme = THEMES[puzzle.theme];
  const all = facts(puzzle);
  const culprit = all.find((f) => f.culprit);
  const angle = ANGLES[((puzzle.number % ANGLES.length) + ANGLES.length) % ANGLES.length];
  return `Ты пишешь короткую развязку для ежедневной детективной игры «Дело №${puzzle.number}».

Стиль: нуар от первого лица следователя, прошедшее время. Мрачно и атмосферно, но без крови и натурализма.
Длина: 80–120 слов, 5–7 предложений разной длины.
Приём для этой истории: ${angle}.

Как писать:
— Вступление игрок уже прочитал — не пересказывай его, начинай сразу со сцены.
— Не перечисляй факты списком вроде «имя, роль, пришёл в…, был в…, у него нашли…». Вплетай время, место и предмет в действие и детали: что следователь увидел, услышал, нашёл.
— Обязательно назови преступника по имени, его место и предмет.
— Из невиновных упомяни одного-двух и говори о них только их факты, без вины.
— Признание приведи дословно, в кавычках «…».
— Без штампов вроде «я сопоставил факты» или «теперь здесь только тишина». Закончи короткой жутковатой фразой, своей для этой истории.

Ответ — JSON вида {"story": "текст"}: в тексте только сама история, одним-двумя абзацами, без заголовка, черновиков, пояснений и разметки.

Факты — используй только их и ничего в них не меняй:
Место действия: ${theme.title}.
Вступление (игрок его уже читал): ${introText(puzzle)}
Главная улика: ${mainClueText(puzzle)}
Как читать факты: время — момент, когда человек пришёл; место — где он был в момент преступления; предмет — что у него потом нашли.
Не меняй смысл: не пиши, что кто-то был где-то «до» какого-то времени или «пришёл из» какого-то места.
Подозреваемые:
${all.map((f) => `— ${line(f)}.`).join('\n')}
Преступник — ${line(culprit)}.
Признание преступника: «${confessionText(puzzle)}»`;
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

// Подходит ли ответ модели: преступник, его место и предмет на месте; чужих имён нет.
export function validate(text, puzzle) {
  const problems = [];
  const words = text.trim().split(/\s+/).length;
  if (words < 50) problems.push(`слишком коротко: ${words} слов`);
  if (words > 170) problems.push(`слишком длинно: ${words} слов`);
  const culprit = facts(puzzle).find((f) => f.culprit);
  if (!mentionsPerson(text, culprit.person)) problems.push(`нет имени преступника (${culprit.person.name})`);
  if (!mentions(text, culprit.place.name)) problems.push(`нет места преступника (${culprit.place.name})`);
  if (!mentions(text, culprit.item.name)) problems.push(`нет предмета преступника (${culprit.item.name})`);
  const inCase = new Set(puzzle.suspects.map((s) => s.name));
  for (const other of SUSPECTS) {
    if (!inCase.has(other.name) && mentionsPerson(text, other)) problems.push(`чужое имя: ${other.name}`);
  }
  if (/[*#_`]/.test(text)) problems.push('разметка в тексте');
  // черновики и обрывки: история — это обычный русский текст, законченный точкой
  if (/[A-Za-z]/.test(text)) problems.push('латиница в тексте');
  if (/^\s*\d+[.)]\s/m.test(text)) problems.push('нумерованные строки');
  if (!/^[«"—–-]?\s*[А-ЯЁ]/.test(text.trim())) problems.push('начинается не с заглавной буквы');
  if (!/[.!?…»"]$/.test(text.trim())) problems.push('оборвано: нет точки в конце');
  if ((text.match(/\n/g) ?? []).length > 3) problems.push('слишком много строк');
  if (/(^|[^а-яё])до \d{1,2}:\d{2}/i.test(text)) problems.push('«до ЧЧ:ММ» — время означает момент прихода');
  problems.push(...swapped(text, puzzle));
  return { ok: problems.length === 0, problems };
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

// Привести ответ к простому тексту: убрать кавычки вокруг и лишние пробелы.
export const clean = (text) =>
  text
    .trim()
    .replace(/^[«"]|[»"]$/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

// Заглушка вместо Gemini — чтобы проверить весь путь без ключа.
export function mockStory(puzzle) {
  const culprit = facts(puzzle).find((f) => f.culprit);
  const { person, time, place, item } = culprit;
  const x = (m, f) => byGender(person.gender, m, f);
  return [
    `${introText(puzzle)} Я приехал, когда дом ещё спал, и начал с того, что не умеет врать, — со времени.`,
    `${mainClueText(puzzle)}`,
    `Пятеро гостей, пять часов, пять историй — и только одна из них не сходилась.`,
    `${person.name} ${x('пришёл', 'пришла')} в ${time.name} и ${x('был', 'была')} ${place.loc}.`,
    `Когда у ${x('него', 'неё')} нашли ${item.acc}, ${x('он', 'она')} даже не ${x('удивился', 'удивилась')}.`,
    `«${confessionText(puzzle)}» — сказал${x('', 'а')} ${person.name} и ${x('отвернулся', 'отвернулась')} к окну.`,
    'Я закрыл дело. Но шаги наверху я слышу до сих пор.',
  ].join(' ');
}
