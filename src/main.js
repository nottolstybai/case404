// Экран дела: история, улики, карточки подозреваемых, подсказка, обвинение.

import { caseId, dailyPuzzle, dateKey, dateLabel, isDateKey } from './daily.js';
import { CHECK, CROSS, accuse, accuseCategories, giveUp, hint, isOver, newGame, tap, toggleClue, undo } from './game.js';
import { clueText, confessionText, introText, mainClueText, rulesText, themeTitle, valueName } from './text.js';
import { STAMP, portrait, scene } from './art.js';
import { startMusic, stopMusic } from './music.js';
import { hashString } from './rng.js';
import { clock, plural, record, shareText, solvedCount, streak, untilMidnight } from './stats.js';

const params = new URLSearchParams(location.search);
const key = isDateKey(params.get('date')) ? params.get('date') : dateKey(); // ?date=2026-11-06 — для проверки
const puzzle = dailyPuzzle(key);
const SAVE = `case-file:${key}`;
const SETTINGS = 'case-file:settings';
const STATS = 'case-file:stats';
// серия считается только для настоящего сегодняшнего дела, не для ?date=
const isToday = key === dateKey();
const n = puzzle.suspects.length;

const storage = {
  get(name) {
    try {
      return JSON.parse(localStorage.getItem(name));
    } catch {
      return null;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // без сохранения тоже можно играть
    }
  },
};

// Отпечаток дела: если генератор изменится, старые отметки к новому делу не подойдут.
const id = caseId(puzzle);
const saved = storage.get(SAVE);
let game = saved?.id === id ? { ...newGame(puzzle), ...saved } : { ...newGame(puzzle), id };
let settings = { easy: false, seenHelp: false, cluesOpen: true, music: true, ...storage.get(SETTINGS) };
let hintNow = null; // { text, cells, clue }
let mode = CROSS; // что ставит тап: ✗ или ✓
// открытый лист: 'help' | 'accuse' | 'giveup' | 'result' | null
let sheet = isOver(game) ? 'result' : settings.seenHelp ? null : 'help';
let draft = { g: null, values: {} };
let accuseError = '';

const app = document.getElementById('app');
document.title = `Дело №${puzzle.number}`;

const save = () => storage.set(SAVE, game);
const saveSettings = () => storage.set(SETTINGS, settings);
const cap = (text) => text[0].toUpperCase() + text.slice(1);

let stats = storage.get(STATS) ?? {};
let shareNote = ''; // «Скопировано» после «Поделиться»

// Записать результат дня, когда дело закрыто (раскрыто или игрок сдался).
function recordResult() {
  if (!isToday || !isOver(game)) return;
  const next = record(stats, puzzle.number, game);
  if (next !== stats) storage.set(STATS, (stats = next));
}
recordResult(); // дело могло быть закрыто до появления статистики

const shareUrl = () => `${location.origin}${location.pathname}`;

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// История дела: stories/<дата>.json пишет GitHub Action. Загружаем при каждом открытии страницы,
// когда дело закрыто (один маленький запрос к файлу): историю могут переписать — показываем свежую.
// Раньше история запоминалась в браузере и после замены файла оставалась старой; чистим ту запись.
try {
  localStorage.removeItem(`case-file:story:${key}`);
} catch {
  // нет доступа к хранилищу — не беда
}
let story = null;
let storyRequested = false;

async function loadStory() {
  if (storyRequested) return;
  storyRequested = true;
  try {
    const response = await fetch(`stories/${key}.json`, { cache: 'no-cache' });
    if (!response.ok) return;
    const data = await response.json();
    if (data.id !== id || typeof data.text !== 'string') return;
    story = { id, text: data.text };
    if (sheet === 'result') render();
  } catch {
    // истории нет — итог покажем без неё
  }
}

const highlighted = (g, k, v) => hintNow?.cells.some(([a, b, c]) => a === g && b === k && c === v);

// Вариант на карточке человека.
function chip(g, k, v) {
  const main = puzzle.culpritClue.k === k && puzzle.culpritClue.v === v; // примета из главной улики
  const cls = ['chip', game.marks[g][k][v] === CROSS && 'x', game.marks[g][k][v] === CHECK && 'ok', main && 'main', highlighted(g, k, v) && 'hl']
    .filter(Boolean)
    .join(' ');
  return `<button class="${cls}" data-act="mark" data-g="${g}" data-k="${k}" data-v="${v}">${cap(valueName(puzzle, k, v))}</button>`;
}

function card(person, g) {
  const rows = puzzle.categories
    .map(
      (cat, k) => `
      <div class="row">
        <div class="row-title">${cat.title}</div>
        <div class="chips">${cat.values.map((_, v) => chip(g, k, v)).join('')}</div>
      </div>`,
    )
    .join('');
  return `
    <article class="card">
      <div class="card-head">
        ${portrait(person.role)}
        <div><div class="name">${person.name}</div><div class="role">${cap(person.role)}</div></div>
      </div>
      ${rows}
    </article>`;
}

function clueItem(clue, i) {
  const cls = ['clue', game.struck.includes(i) && 'struck', hintNow?.clue === i && 'hl'].filter(Boolean).join(' ');
  const num = String(i + 1).padStart(2, '0');
  return `<li class="${cls}" data-act="clue" data-i="${i}"><span class="num">${num}</span><span class="body">${clueText(puzzle, clue)}</span></li>`;
}

// Лист открыт поверх страницы; клик по затемнению закрывает его.
const overlay = (inner, extra = '') => `
  <div class="overlay" data-act="close-sheet">
    <div class="sheet ${extra}" data-stop>${inner}</div>
  </div>`;

const exChip = (text, state = '') => `<span class="chip ${state}">${text}</span>`;

function helpSheet() {
  return overlay(`
    <h3>Как играть</h3>
    <p class="sub">${rulesText(puzzle)}</p>
    <div class="example">
      <div class="ex-step">
        <p class="ex-clue">«Вера не была в подвале.»</p>
        <p class="ex-do">Внизу выбран ✗ — тапни «Подвал»:</p>
        <div class="ex-chips">${exChip('Подвал', 'x')}${exChip('Кухня')}${exChip('Сад')}</div>
      </div>
      <div class="ex-step">
        <p class="ex-clue">«Вера не была в саду.»</p>
        <p class="ex-do">Осталась кухня — переключи на ✓ и тапни её:</p>
        <div class="ex-chips">${exChip('Подвал', 'x')}${exChip('Кухня', 'ok')}${exChip('Сад', 'x')}</div>
      </div>
      <p class="ex-do">После ✓ остальное в строке и кухня у других вычёркиваются сами. Повторный тап стирает отметку, тап по улике зачёркивает её.</p>
    </div>
    <p class="sub">Главная улика называет одну примету преступника — она отмечена на карточках красной точкой. Найди, кто это, узнай о нём остальное и жми «Обвинить». Заполнять всю доску не обязательно.</p>
    <h2>Как читать улики</h2>
    <ul class="glossary">
      <li><b>раньше, позже</b> — не обязательно сразу</li>
      <li><b>сразу после, прямо перед</b> — подряд, никого между ними</li>
      <li><b>один за другим</b> — подряд, в любом порядке</li>
      <li><b>между ними приходил кто-то ещё</b> — не подряд</li>
      <li><b>первым или последним</b> — в начале или в самом конце</li>
      <li>Если в улике двое — это разные люди.</li>
      <li>Совет: начни со времени — больше всего улик про порядок прихода.</li>
    </ul>
    <label class="easy">
      <input type="checkbox" data-act="easy" ${settings.easy ? 'checked' : ''}>
      <span>Упрощённый режим: последний оставшийся вариант отмечается сам</span>
    </label>
    <p class="credits">Музыка: «Drone in D», Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>), лицензия <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. В игре — 90-секундный фрагмент, зацикленный. Выключить — ♪ в шапке.</p>
    <div class="actions"><button class="btn primary" data-act="close-sheet">Понятно</button></div>`);
}

const ACCUSE_TITLES = { place: 'Где был?', item: 'Чем?', time: 'Когда пришёл?' };

function accuseSheet() {
  const names = puzzle.suspects
    .map((p, g) => `<button class="chip ${draft.g === g ? 'ok' : ''}" data-act="pick-g" data-g="${g}">${p.name}</button>`)
    .join('');
  const groups = accuseCategories(puzzle)
    .map((k) => {
      const cat = puzzle.categories[k];
      const chips = cat.values
        .map((_, v) => `<button class="chip ${draft.values[k] === v ? 'ok' : ''}" data-act="pick-v" data-k="${k}" data-v="${v}">${cap(valueName(puzzle, k, v))}</button>`)
        .join('');
      return `<h2>${ACCUSE_TITLES[cat.key]}</h2><div class="pick">${chips}</div>`;
    })
    .join('');
  const ready = draft.g !== null && accuseCategories(puzzle).every((k) => draft.values[k] !== undefined);
  return overlay(
    `
    <h3>Обвинение</h3>
    <p class="sub">${mainClueText(puzzle)}</p>
    <h2>Кто?</h2><div class="pick">${names}</div>
    ${groups}
    <p class="error">${accuseError}</p>
    <div class="actions">
      <button class="btn" data-act="close-sheet">Отмена</button>
      <button class="btn primary" data-act="submit" ${ready ? '' : 'disabled'}>Обвинить</button>
    </div>
    <button class="link" data-act="giveup">Сдаться и узнать ответ</button>`,
    accuseError ? 'shake' : '',
  );
}

function giveUpSheet() {
  return overlay(`
    <h3>Сдаться?</h3>
    <p class="sub">Покажем ответ, а дело уйдёт в архив нераскрытым.</p>
    <div class="actions">
      <button class="btn" data-act="accuse">Ещё подумаю</button>
      <button class="btn primary" data-act="confirm-giveup">Сдаться</button>
    </div>`);
}

function resultSheet() {
  const culprit = puzzle.suspects[puzzle.culprit];
  const head = puzzle.categories.map((c) => `<th>${c.title}</th>`).join('');
  const rows = puzzle.suspects
    .map((p, g) => {
      const cells = puzzle.categories.map((_, k) => `<td>${cap(valueName(puzzle, k, puzzle.solution[g][k]))}</td>`).join('');
      return `<tr class="${g === puzzle.culprit ? 'culprit' : ''}"><td>${p.name}</td>${cells}</tr>`;
    })
    .join('');
  const top = game.solved
    ? '<div class="stamp">Раскрыто</div>'
    : '<div class="stamp lost">Не раскрыто</div>';
  return overlay(`
    ${top}
    <div class="confession">
      ${portrait(culprit.role)}
      <div>
        <p class="quote">«${confessionText(puzzle)}»</p>
        <p class="who">— ${culprit.name}, ${culprit.role}</p>
      </div>
    </div>
    ${
      story
        ? `<h2>Из дневника следователя</h2><div class="diary">${story.text
            .split('\n')
            .map((p) => `<p>${escapeHtml(p)}</p>`)
            .join('')}</div>`
        : ''
    }
    <table class="solution"><tr><th></th>${head}</tr>${rows}</table>
    <div class="stats">
      <span>Время ${clock(game.elapsed)}</span>
      <span>Неверных обвинений: ${game.wrong}</span>
      <span>Подсказок: ${game.hints}</span>
    </div>
    ${isToday ? recordBlock() : ''}
    <div class="actions">
      <button class="btn" data-act="close-sheet">К делу</button>
      <button class="btn primary" data-act="share">Поделиться</button>
    </div>
    <p class="share-note">${shareNote}</p>`);
}

// Серия и отсчёт до следующего дела.
function recordBlock() {
  const days = streak(stats, puzzle.number);
  const total = solvedCount(stats);
  return `
    <div class="record">
      <div><b>${days}</b><span>${plural(days, 'день', 'дня', 'дней')} подряд</span></div>
      <div><b>${total}</b><span>${plural(total, 'дело', 'дела', 'дел')} раскрыто</span></div>
      <div><b id="countdown">${untilMidnight()}</b><span>до нового дела</span></div>
    </div>`;
}

const SHEETS = { help: helpSheet, accuse: accuseSheet, giveup: giveUpSheet, result: resultSheet };

const wide = () => matchMedia('(min-width: 960px)').matches;

function render() {
  const over = isOver(game);
  const keep = app.querySelector('.clues')?.scrollTop ?? 0; // прокрутка списка улик переживает перерисовку
  document.body.classList.toggle('clues-closed', !settings.cluesOpen);
  app.innerHTML = `
    <header class="top">
      <div>
        <div class="case-no">Дело №${puzzle.number}</div>
        <div class="date">${dateLabel(key)}</div>
      </div>
      <div class="top-right">
        <span class="timer" id="timer">${clock(game.elapsed)}</span>
        <button class="icon-btn" data-act="music" aria-label="${settings.music ? 'Выключить музыку' : 'Включить музыку'}" aria-pressed="${settings.music}">${settings.music ? '♪' : '<s>♪</s>'}</button>
        <button class="icon-btn" data-act="help" aria-label="Как играть">?</button>
      </div>
    </header>

    <section class="story">
      <div class="banner">${scene(puzzle.theme, puzzle.story.art)}${STAMP}</div>
      <p class="place-tag">${themeTitle(puzzle)}</p>
      <p class="intro">${introText(puzzle)}</p>
      <div class="main-clue"><span class="tag">Главная улика</span>${mainClueText(puzzle)}</div>
    </section>

    <section class="evidence ${settings.cluesOpen ? '' : 'closed'}">
      <button class="evidence-head" data-act="toggle-clues" aria-expanded="${settings.cluesOpen}">
        <span>Улики · ${puzzle.clues.length}</span><span class="chev">${settings.cluesOpen ? '▾ свернуть' : '▴ показать'}</span>
      </button>
      ${hintNow ? `<div class="hint"><p>${hintNow.text}</p><button data-act="close-hint" aria-label="Закрыть">✕</button></div>` : ''}
      <ol class="clues">${puzzle.clues.map(clueItem).join('')}</ol>
    </section>

    <section class="board">
      <h2>Подозреваемые</h2>
      <div class="cards">${puzzle.suspects.map(card).join('')}</div>
    </section>

    <nav class="bar">
      <button class="undo" data-act="undo" aria-label="Отменить" ${game.history.length && !over ? '' : 'disabled'}>↶</button>
      <div class="mode" role="group" aria-label="Что ставить">
        <button class="${mode === CROSS ? 'on' : ''}" data-act="mode" data-mode="${CROSS}" aria-label="Вычёркивать">✗</button>
        <button class="${mode === CHECK ? 'on' : ''}" data-act="mode" data-mode="${CHECK}" aria-label="Отмечать">✓</button>
      </div>
      <button data-act="hint" ${over ? 'disabled' : ''}>Подсказка</button>
      ${over ? '<button class="primary" data-act="show-result">Итог</button>' : '<button class="primary" data-act="accuse">Обвинить</button>'}
    </nav>

    ${sheet ? SHEETS[sheet]() : ''}
  `;
  const list = app.querySelector('.clues');
  if (list) list.scrollTop = keep;
  if (sheet === 'result') loadStory();
}

// После подсказки: прокрутить список улик к нужной улике, а страницу — к подсвеченной клетке,
// чтобы она оказалась в видимой части над панелью улик.
function reveal() {
  const list = app.querySelector('.clues');
  const clue = list?.querySelector('.clue.hl');
  if (clue) list.scrollTo({ top: clue.offsetTop - 8, behavior: 'smooth' });
  const cell = app.querySelector('.chip.hl');
  if (!cell) return;
  const bottom = wide() ? innerHeight - 80 : app.querySelector('.evidence').getBoundingClientRect().top;
  const rect = cell.getBoundingClientRect();
  if (rect.top > 60 && rect.bottom < bottom - 12) return; // и так видно
  window.scrollTo({ top: scrollY + rect.top - Math.max(60, (bottom - rect.height) / 2), behavior: 'smooth' });
}

const actions = {
  mark(el) {
    tap(game, +el.dataset.g, +el.dataset.k, +el.dataset.v, mode, settings.easy);
    hintNow = null;
  },
  clue(el) {
    toggleClue(game, +el.dataset.i);
  },
  mode(el) {
    mode = +el.dataset.mode;
  },
  undo() {
    undo(game);
    hintNow = null;
  },
  hint() {
    hintNow = hint(game, puzzle);
    settings.cluesOpen = true;
  },
  'toggle-clues'() {
    if (wide()) return false; // на компьютере улики всегда видны
    settings.cluesOpen = !settings.cluesOpen;
    saveSettings();
  },
  'close-hint'() {
    hintNow = null;
  },
  music() {
    settings.music = !settings.music;
    saveSettings();
    if (settings.music) startMusic();
    else stopMusic();
  },
  help() {
    sheet = 'help';
  },
  accuse() {
    sheet = 'accuse';
    accuseError = '';
  },
  'pick-g'(el) {
    draft.g = +el.dataset.g;
    accuseError = '';
  },
  'pick-v'(el) {
    draft.values[+el.dataset.k] = +el.dataset.v;
    accuseError = '';
  },
  submit() {
    if (accuse(game, puzzle, draft)) {
      sheet = 'result';
      hintNow = null;
      recordResult();
    } else {
      accuseError = `Не сходится. Неверных обвинений: ${game.wrong}.`;
    }
  },
  giveup() {
    sheet = 'giveup';
  },
  'confirm-giveup'() {
    giveUp(game);
    sheet = 'result';
    hintNow = null;
    recordResult();
  },
  'close-sheet'(el, event) {
    // клик по затемнению закрывает лист, клик внутри листа — нет
    if (el.classList.contains('overlay') && event.target.closest('[data-stop]')) return false;
    if (sheet === 'help' && !settings.seenHelp) {
      settings.seenHelp = true;
      saveSettings();
    }
    sheet = null;
  },
  'show-result'() {
    sheet = 'result';
    shareNote = '';
  },
  share() {
    const text = shareText({ number: puzzle.number, game, streak: isToday ? streak(stats, puzzle.number) : 0, url: shareUrl() });
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return false;
    }
    navigator.clipboard?.writeText(text).then(
      () => {
        shareNote = 'Скопировано — можно вставить в чат.';
        render();
      },
      () => {
        shareNote = text;
        render();
      },
    );
    return false;
  },
};

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled || el.dataset.act === 'easy') return;
  const action = actions[el.dataset.act];
  if (!action) return;
  if (action(el, event) === false) return;
  save();
  render();
  if (el.dataset.act === 'hint') reveal();
});

// Музыка: браузер разрешает звук только после действия игрока — стартуем с первого касания.
// Если первым делом нажали саму кнопку музыки, её обработает действие music().
document.addEventListener(
  'pointerdown',
  (event) => {
    if (settings.music && !event.target.closest('[data-act="music"]')) startMusic();
  },
  { once: true },
);

app.addEventListener('change', (event) => {
  if (event.target.dataset.act !== 'easy') return;
  settings = { ...settings, easy: event.target.checked };
  saveSettings();
});

// Секундомер идёт, только пока страница открыта и дело не закрыто.
setInterval(() => {
  const countdown = document.getElementById('countdown');
  if (countdown) countdown.textContent = untilMidnight();
  if (isOver(game) || document.hidden || sheet === 'help') return;
  game.elapsed++;
  const timer = document.getElementById('timer');
  if (timer) timer.textContent = clock(game.elapsed);
  if (game.elapsed % 5 === 0) save();
}, 1000);
document.addEventListener('visibilitychange', save);
window.addEventListener('pagehide', save);

render();
