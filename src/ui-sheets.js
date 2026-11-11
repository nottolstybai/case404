// Листы поверх доски: дело (вступление), как играть, дела, обвинение, сдаться, итог.
// На телефоне — снизу, на компьютере — по центру. Разметка; поведение — в main.js.

import { accuseCategories } from './game.js';
import { confessionText, introText, mainClueParts, rulesText, valueName } from './text.js';
import { STAMP, portrait, scene } from './art.js';
import { clock, plural, solvedCount, streak, untilMidnight } from './stats.js';
import { ICONS, cap, esc, partsHtml } from './ui-util.js';

const days = (x) => `${x} ${plural(x, 'день', 'дня', 'дней')}`;

export const bannerHtml = (puzzle) => `<div class="banner" data-static="banner">${scene(puzzle.theme, puzzle.story.art)}${STAMP}</div>`;

const mainBox = (puzzle) => `<div class="mainclue static"><span class="tag">Главная улика</span><span class="txt">${partsHtml(mainClueParts(puzzle))}</span></div>`;

function brief(S) {
  const { puzzle, game } = S;
  const series = S.isToday ? streak(S.stats, puzzle.number) : 0;
  return `
    ${bannerHtml(puzzle)}
    <h2 class="sheet-title" id="sheet-title">${esc(S.title)}</h2>
    <p class="brief-date">${esc(S.subtitle)}</p>
    <p class="intro">${esc(introText(puzzle))}</p>
    ${mainBox(puzzle)}
    <p class="rules">${esc(rulesText(puzzle))}</p>
    ${series ? `<p class="streak">Серия: <b>${days(series)}</b> подряд — не прерви её.</p>` : ''}
    <div class="actions"><button class="btn primary" data-act="start" data-autofocus>${game.started ? 'К доске' : 'Начать расследование'}</button></div>`;
}

const toggle = (name, on, text) => `
  <label class="opt"><input type="checkbox" data-set="${name}" ${on ? 'checked' : ''}><span>${text}</span></label>`;

// Маленькая клетка для иллюстрации в «Как играть».
const demo = (cls, label) =>
  `<span class="demo"><span class="cell ${cls}" aria-hidden="true"><svg class="x" viewBox="0 0 24 24"><path d="M6.4 6.6 Q12.2 11.6 17.8 17.6"/><path d="M17.4 6.2 Q11.6 12.4 6.2 17.9"/></svg><svg class="v" viewBox="0 0 24 24"><path d="M5.2 12.8 9.8 17.2 18.8 6.8"/></svg></span><span class="demo-t">${label}</span></span>`;

function help(S) {
  const { settings } = S;
  const arrow = '<span class="demo-arrow" aria-hidden="true">→</span>';
  return `
    <h2 class="sheet-title" id="sheet-title">Как играть</h2>
    <p class="lead">Колонки доски — время прихода, строки — люди, места и вещи. Отмечай по уликам, что с чем совпадает: ✗ — точно нет, ✓ — точно да.</p>
    <div class="demo-row" aria-label="Тап по клетке: пусто, потом ✗, потом ✓">${demo('', 'пусто')}${arrow}${demo('m-x', 'тап')}${arrow}${demo('m-v', 'ещё тап')}</div>
    <p class="note">Третий тап стирает отметку. Долгое нажатие (или правая кнопка мыши) — сразу ✓.</p>
    <div class="demo-row" aria-label="Пример автоматических отметок">${demo('m-v', 'твоя ✓')}${demo('m-ax', 'бледный ✗')}${demo('m-ax', 'бледный ✗')}</div>
    <p class="note">После ✓ остальное в её строке и колонке группы вычёркивается само — бледным. Снимешь ✓ — уйдут и эти ✗.</p>
    <p class="note"><b class="red">Главная улика</b> называет одну примету преступника — её строка подписана красным, а когда станет ясно время, колонка преступника окрасится. Узнай о нём остальное и жми «Обвинить». Заполнять всю доску не обязательно.</p>
    <h3 class="sec">Как читать улики</h3>
    <ul class="glossary">
      <li><b>раньше, позже</b> — не обязательно сразу</li>
      <li><b>сразу после, прямо перед</b> — подряд, никого между ними</li>
      <li><b>один за другим</b> — подряд, в любом порядке</li>
      <li><b>между ними приходил кто-то ещё</b> — не подряд</li>
      <li><b>первым или последним</b> — в начале или в самом конце</li>
      <li>Если в улике двое — это разные люди.</li>
      <li>Тап по улике подсвечивает на доске, о чём она. Квадратик слева — «отработана».</li>
    </ul>
    <h3 class="sec only-wide">Клавиатура</h3>
    <ul class="keys only-wide">
      <li><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> — по клеткам</li>
      <li><kbd>Enter</kbd> или <kbd>Пробел</kbd> — пусто → ✗ → ✓, <kbd>Shift</kbd>+<kbd>Enter</kbd> — сразу ✓</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> — отменить, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> или <kbd>Ctrl</kbd>+<kbd>Y</kbd> — вернуть</li>
      <li><kbd>Esc</kbd> — закрыть окно или подсветку</li>
    </ul>
    <h3 class="sec">Настройки</h3>
    ${toggle('easy', settings.easy, 'Упрощённый режим: последний оставшийся вариант отмечается сам')}
    ${toggle('music', settings.music, 'Музыка')}
    ${toggle('sfx', settings.sfx, 'Звуки действий')}
    <p class="credits">Музыка и звуки синтезируются в браузере. Карандаш — запись Joseph Sardin, BigSoundBank (CC0).</p>
    <div class="actions"><button class="btn primary" data-act="close-sheet" data-autofocus>Понятно</button></div>`;
}

// Как закончилось дело: из статистики дня или из сохранённой партии.
function caseStatus(S, key, number) {
  const done = S.stats[number];
  if (done) return done.result === 'solved' ? ['solved', `раскрыто за ${clock(done.time)}`] : ['lost', 'не раскрыто'];
  const saved = S.savedGame(key);
  if (saved?.solved) return ['solved', `раскрыто за ${clock(saved.elapsed ?? 0)}`];
  if (saved?.gaveUp) return ['lost', 'не раскрыто'];
  if (saved?.started) return ['open', 'начато'];
  return ['none', '—'];
}

function caseRow(S, item) {
  const [cls, text] = caseStatus(S, item.key, item.number);
  const here = item.key === S.key;
  return `<li><a class="case-row${here ? ' here' : ''}" href="${item.href}"${here ? ' aria-current="page"' : ''}>
    <span class="cn">Дело №${item.number}</span>
    <span class="cd">${item.today ? 'Сегодня, ' : ''}${esc(item.date)}</span>
    <span class="cs st-${cls}">${text}${here ? '<small>открыто сейчас</small>' : ''}</span>
  </a></li>`;
}

function menu(S) {
  const [today, ...past] = S.archive;
  const random = S.puzzle.random
    ? `<p class="note here-random">Сейчас открыто: <b>${esc(S.title)}</b> — случайное, в серию не идёт.</p>`
    : '';
  return `
    <h2 class="sheet-title" id="sheet-title">Дела</h2>
    <ul class="cases">${caseRow(S, today)}</ul>
    ${random}
    <button class="btn wide-btn" data-act="random-case">Случайное дело</button>
    <p class="note">Случайные и прошлые дела можно решать сколько угодно — на серию влияет только дело дня.</p>
    ${past.length ? `<h3 class="sec">Архив</h3><ul class="cases">${past.map((item) => caseRow(S, item)).join('')}</ul>` : ''}
    <div class="actions"><button class="btn" data-act="close-sheet" data-autofocus>Закрыть</button></div>`;
}

const ACCUSE_TITLES = { place: 'Где был?', item: 'Что у него нашли?', time: 'Когда пришёл?' };

function accuse(S) {
  const { puzzle, draft } = S;
  const names = puzzle.suspects
    .map((p, g) => {
      const on = draft.g === g;
      return `<button class="pick-chip who${on ? ' on' : ''}" data-act="pick-g" data-g="${g}" aria-pressed="${on}"><span class="mini" data-static="${esc(p.role)}">${portrait(p.role)}</span>${esc(p.name)}</button>`;
    })
    .join('');
  const groups = accuseCategories(puzzle)
    .map((k) => {
      const cat = puzzle.categories[k];
      const chips = cat.values
        .map((_, v) => {
          const on = draft.values[k] === v;
          return `<button class="pick-chip ${cat.key}${on ? ' on' : ''}" data-act="pick-v" data-k="${k}" data-v="${v}" aria-pressed="${on}">${esc(cap(valueName(puzzle, k, v)))}</button>`;
        })
        .join('');
      return `<h3 class="sec">${ACCUSE_TITLES[cat.key]}</h3><div class="pick" role="group" aria-label="${ACCUSE_TITLES[cat.key]}">${chips}</div>`;
    })
    .join('');
  const ready = draft.g !== null && accuseCategories(puzzle).every((k) => draft.values[k] !== undefined);
  return `
    <h2 class="sheet-title" id="sheet-title">Обвинение</h2>
    ${mainBox(puzzle)}
    ${S.prefilled ? '<p class="note prefill">Заполнено по твоим отметкам на доске — проверь и подтверди.</p>' : ''}
    <h3 class="sec">Кто?</h3><div class="pick" role="group" aria-label="Кто?">${names}</div>
    ${groups}
    <p class="error" role="alert">${esc(S.accuseError)}</p>
    <div class="actions">
      <button class="btn" data-act="close-sheet">К доске</button>
      <button class="btn primary" data-act="submit" ${ready ? '' : 'disabled'} data-autofocus>Обвинить</button>
    </div>
    <button class="link" data-act="giveup">Сдаться и узнать ответ</button>`;
}

function giveup() {
  return `
    <h2 class="sheet-title" id="sheet-title">Сдаться?</h2>
    <p class="lead">Покажем ответ, а дело уйдёт в архив нераскрытым.</p>
    <div class="actions">
      <button class="btn" data-act="accuse" data-autofocus>Ещё подумаю</button>
      <button class="btn primary" data-act="confirm-giveup">Сдаться</button>
    </div>`;
}

// «Хроника ночи» в итоге: пятеро по времени прихода, преступник выделен.
function chronicle(puzzle, orderK) {
  const rows = puzzle.suspects
    .map((p, g) => ({ p, g, slot: puzzle.solution[g][orderK] }))
    .sort((a, b) => a.slot - b.slot)
    .map(({ p, g, slot }, i) => {
      const values = puzzle.categories.map((_, k) => valueName(puzzle, k, puzzle.solution[g][k]));
      // «Купе, кочерга»: место и вещь через запятую, с большой буквы только первое слово
      const rest = puzzle.categories
        .map((cat, k) => ({ cat, k }))
        .filter(({ k }) => k !== orderK)
        .map(({ cat, k }, j) => `<span class="ch-${cat.key}">${esc(j ? values[k] : cap(values[k]))}</span>`)
        .join(', ');
      const culprit = g === puzzle.culprit;
      return `<li class="${culprit ? 'culprit' : ''}" style="--i:${i}">
        <span class="ch-time">${values[orderK]}</span>
        <span class="mini" data-static="${esc(p.role)}">${portrait(p.role)}</span>
        <span class="ch-who"><b>${esc(p.name)}</b><span class="ch-role">${esc(p.role)}${culprit ? ', преступник' : ''}</span></span>
        <span class="ch-rest">${rest}</span>
      </li>`;
    })
    .join('');
  return `<h3 class="sec">Хроника ночи</h3><ol class="chron">${rows}</ol>`;
}

function result(S) {
  const { puzzle, game } = S;
  const culprit = puzzle.suspects[puzzle.culprit];
  const stamp = game.solved ? '<div class="stamp">Раскрыто</div>' : '<div class="stamp lost">Не раскрыто</div>';
  const story = S.story
    ? `<h3 class="sec">Что случилось той ночью</h3>${
        S.story.motive ? `<p class="motive"><span class="tag">Мотив</span>${esc(cap(S.story.motive))}</p>` : ''
      }<div class="diary">${S.story.text
        .split('\n')
        .filter((p) => p.trim())
        .map((p) => `<p>${esc(p)}</p>`)
        .join('')}</div>`
    : '';
  const total = solvedCount(S.stats);
  const series = streak(S.stats, puzzle.number);
  // Итог — строки бланка: напечатанная подпись и вписанное значение.
  const field = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const today = S.isToday
    ? field('Серия', `${days(series)} подряд`) +
      field('Раскрыто всего', `${total} ${plural(total, 'дело', 'дела', 'дел')}`) +
      field('Новое дело', `через <span id="countdown">${untilMidnight()}</span>`)
    : '';
  return `
    <h2 class="visually-hidden" id="sheet-title">${game.solved ? 'Дело раскрыто' : 'Дело не раскрыто'}</h2>
    ${stamp}
    <div class="confession">
      <span class="mini big" data-static="${esc(culprit.role)}">${portrait(culprit.role)}</span>
      <div>
        <p class="quote">«${esc(confessionText(puzzle))}»</p>
        <p class="who">— ${esc(culprit.name)}, ${esc(culprit.role)}</p>
      </div>
    </div>
    ${chronicle(puzzle, S.orderK)}
    ${story}
    <dl class="fields">
      ${field('Время расследования', clock(game.elapsed))}
      ${field('Неверных обвинений', game.wrong)}
      ${field('Подсказок', game.hints)}
      ${today}
    </dl>
    <div class="actions">
      <button class="btn primary" data-act="share" data-autofocus>Поделиться</button>
      <button class="btn" data-act="random-case">Случайное дело</button>
    </div>
    <p class="share-note" aria-live="polite">${esc(S.shareNote)}</p>
    <button class="link" data-act="close-sheet">Посмотреть доску</button>`;
}

const SHEETS = { brief, help, menu, accuse, giveup, result };

// Лист целиком. data-key — имя листа: при смене листа узел создаётся заново и въезжает с анимацией.
export function sheetHtml(name, S) {
  if (!name) return '';
  const closable = name !== 'brief';
  return `
    <div class="overlay" data-act="backdrop">
      <section class="sheet sheet-${name}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1" data-key="${name}">
        ${closable ? `<button class="sheet-x" data-act="close-sheet" aria-label="Закрыть">${ICONS.close}</button>` : ''}
        ${SHEETS[name](S)}
      </section>
    </div>`;
}
