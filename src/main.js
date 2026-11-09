// Экран дела: доска «Хроника ночи», улики, подсказка, обвинение и листы.
// Рисуем всегда одинаково: состояние → одна строка HTML → morph(app, html).
// Узлы, которые не изменились, остаются на месте: не теряются фокус и прокрутка,
// а смена классов успевает проиграть CSS-переходы (отметка, колонка, печать).

import { caseId, caseNumber, casePuzzle, caseTitle, dateKey, dateLabel, isCaseKey, randomKey } from './daily.js';
import {
  AUTO_CHECK,
  CHECK,
  CROSS,
  accuse,
  accuseCategories,
  clueState,
  culpritFacts,
  giveUp,
  hint,
  isBlank,
  isCheck,
  isOver,
  newGame,
  posFromMarks,
  progress,
  redo,
  reset,
  tap,
  toggleClue,
  undo,
  view,
} from './game.js';
import { clueRefs, context, onlyValue, ref, settled } from './logic.js';
import { introText, themeTitle } from './text.js';
import { clock, record, shareText, streak, untilMidnight } from './stats.js';
import { morph } from './morph.js';
import { boardHtml } from './ui-board.js';
import { cluePanelHtml, clueListHtml, hintHtml, mainClueHtml } from './ui-clues.js';
import { bannerHtml, sheetHtml } from './ui-sheets.js';
import { ICONS, esc, storage } from './ui-util.js';

const app = document.getElementById('app');

// Дело собирается до 1 с на телефоне: сперва дадим браузеру показать заставку из index.html.
await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const params = new URLSearchParams(location.search);
const asked = params.get('case') ?? params.get('date');
const key = isCaseKey(asked) ? asked : dateKey(); // ?date=2026-11-06 — дело дня, ?case=x-a3f9k2 — случайное
const puzzle = casePuzzle(key);
const ctx = context(puzzle);
const { n } = ctx;
const id = caseId(puzzle);
// серия считается только для сегодняшнего дела дня
const isToday = !puzzle.random && key === dateKey();
const title = caseTitle(puzzle);
const subtitle = `${themeTitle(puzzle)} · ${puzzle.random ? 'случайное дело' : dateLabel(key)}`;
document.title = title;

const saveKey = (k) => `case404:v2:${k}`;
const SETTINGS = 'case-file:settings';
const STATS = 'case-file:stats';

// Сохранённая партия подходит, только если это то же дело и доска нужного размера.
function loadGame() {
  const saved = storage.get(saveKey(key));
  const fresh = newGame(puzzle);
  const g = saved?.game;
  if (saved?.id !== id || !g || !Array.isArray(g.marks)) return fresh;
  const fits = g.marks.length === ctx.rows && g.marks.every((row) => Array.isArray(row) && row.length === n);
  return fits ? { ...fresh, ...g } : fresh;
}

let game = loadGame();
let settings = { easy: false, seenHelp: false, cluesOpen: true, music: true, sfx: true, clueMode: 'one', ...storage.get(SETTINGS) };
let stats = storage.get(STATS) ?? {};

const save = () => storage.set(saveKey(key), { id, game });
const saveSettings = () => storage.set(SETTINGS, settings);

// Раньше история запоминалась в браузере и после замены файла оставалась старой; чистим ту запись.
storage.remove(`case-file:story:${key}`);

// Состояние экрана (в партию не входит).
const ui = {
  sheet: isOver(game) ? 'result' : game.started ? null : 'brief',
  active: null, // подсвеченная улика: номер, -1 — главная, null — никакой
  cursor: 0, // какая улика видна в режиме «по одной»
  stepDir: 0, // откуда въехала улика при листании
  hint: null, // ответ hint() + stage: 1 — куда смотреть, 2 — что отметить
  focus: [0, 0], // клетка, на которую попадает Tab
  toast: null, // { text, act, label }
  draft: { g: null, values: {} },
  prefilled: false,
  accuseError: '',
  shareNote: '',
};

// Записать результат дня, когда дело закрыто.
function recordResult() {
  if (!isToday || !isOver(game)) return;
  const next = record(stats, puzzle.number, game);
  if (next !== stats) storage.set(STATS, (stats = next));
}
recordResult(); // дело могло быть закрыто до появления статистики

/* ---------- звук ---------- */

// Звук не обязателен: если модуль не загрузится, играть можно и без него.
let audio = null;
const sfx = (name) => {
  try {
    audio?.sfx(name);
  } catch {
    // звук не главное
  }
};
import('./audio.js')
  .then((mod) => {
    audio = mod;
    mod.setupAudio(() => ({ music: settings.music, sfx: settings.sfx }));
    mod.onAudioChange(() => render());
    tension();
    render();
  })
  .catch(() => {});

/* ---------- что видно на доске ---------- */

const wideQuery = matchMedia('(min-width: 960px)');
const wide = () => wideQuery.matches;

// Всё, что выводится из партии: доска с автоотметками, улики, колонка преступника.
function derive() {
  const easy = settings.easy;
  const d = view(game, n, easy);
  const facts = culpritFacts(game, puzzle, easy);
  const states = puzzle.clues.map((clue) => clueState(game, puzzle, clue, easy));
  const locked = new Set();
  for (let t = 0; t < n; t++) {
    if (ctx.groups.every((_, g) => Array.from({ length: n }, (_, v) => d[g * n + v][t]).some(isCheck))) locked.add(t);
  }
  const complete = facts.slot >= 0 && facts.g !== null && accuseCategories(puzzle).every((k) => facts.values[k] !== undefined);
  return { d, pos: posFromMarks(game, n, easy), facts, states, locked, complete, progress: progress(game, puzzle, easy) };
}

const { k: mainK, v: mainV } = puzzle.culpritClue;
const mainRef = ref(ctx, { k: mainK, v: mainV });
const refsOf = (i) => (i === -1 ? { rows: mainRef.row !== undefined ? [mainRef.row] : [], slots: mainRef.slot !== undefined ? [mainRef.slot] : [] } : clueRefs(ctx, puzzle.clues[i]));

const isOpen = (states, i) => states[i] !== 'done' && !game.struck.includes(i);

function frame(base = derive()) {
  const { d, facts, states, locked, pos } = base;
  const hl = { rows: new Set(), slots: new Set() };
  const targets = new Map();
  const h = ui.hint;
  if (h) {
    h.rows.forEach((r) => hl.rows.add(r));
    h.slots.forEach((t) => hl.slots.add(t));
    // ошибку всегда вычёркивают; шаг — ✓ или ✗ по check
    h.cells.forEach(([r, t]) => targets.set(`${r}:${t}`, h.kind === 'mistake' ? 'm' : h.check ? 'v' : 'x'));
  } else if (ui.active !== null) {
    const refs = refsOf(ui.active);
    refs.rows.forEach((r) => hl.rows.add(r));
    refs.slots.forEach((t) => hl.slots.add(t));
  }
  // кто пришёл в каждую колонку и сколько строк группы решено — по тому же выводу, что culpritFacts:
  // если для колонки остался один человек, его портрет появляется ещё до ✓
  const whoAt = Array.from({ length: n }, (_, t) => settled(ctx, pos, 0, t));
  const solvedRows = new Set();
  pos.forEach((mask, r) => onlyValue(mask) >= 0 && solvedRows.add(r));
  const groupDone = ctx.groups.map((_, g) => Array.from({ length: n }, (_, v) => g * n + v).filter((r) => solvedRows.has(r)).length);
  const clues = puzzle.clues.map((_, i) => ({
    i,
    state: states[i],
    used: game.struck.includes(i),
    active: ui.active === i,
    hinted: h?.clue === i,
  }));
  return {
    ...base,
    puzzle,
    ctx,
    hl,
    targets,
    whoAt,
    solvedRows,
    groupDone,
    clues,
    over: isOver(game),
    focus: ui.focus,
    culprit: { slot: facts.slot, attrRow: mainRef.row ?? -1 },
    active: ui.active,
    cursor: ui.cursor,
    stepDir: ui.stepDir,
    clueMode: settings.clueMode,
    remaining: puzzle.clues.filter((_, i) => isOpen(states, i)).length,
    hint: h,
  };
}

/* ---------- разметка экрана ---------- */

const soundOn = () => settings.music || settings.sfx;

function headerHtml(f) {
  const playing = audio?.isMusicPlaying?.() ?? false;
  return `
    <header class="top">
      <button class="case-btn" data-act="brief" aria-label="${esc(title)}: открыть дело">
        <span class="case-no">${esc(title)}</span>
        <span class="case-sub">${esc(subtitle)}</span>
      </button>
      <span class="timer${f.over ? ' stopped' : ''}" id="timer" aria-label="Время расследования" role="timer">${clock(game.elapsed)}</span>
      <button class="icon-btn${playing ? ' playing' : ''}" data-act="sound" aria-pressed="${soundOn()}" aria-label="${soundOn() ? 'Выключить звук' : 'Включить звук'}">${soundOn() ? ICONS.note : ICONS.noteOff}</button>
      <button class="icon-btn" data-act="menu" aria-label="Дела: сегодня, архив, случайное">${ICONS.menu}</button>
      <button class="icon-btn q" data-act="help" aria-label="Как играть и настройки">?</button>
    </header>`;
}

function toolbarHtml(f) {
  const over = f.over;
  const off = (cond) => (over || cond ? ' disabled' : '');
  const accuseBtn = over
    ? '<button class="tb-btn primary" data-act="show-result">Итог</button>'
    : `<button class="tb-btn primary${f.complete ? ' ready' : ''}" data-act="accuse">Обвинить</button>`;
  const w = wide();
  return `
    <nav class="toolbar" aria-label="Действия">
      <button class="tb-icon" data-act="undo" aria-label="Отменить ход"${off(!game.past.length)}>${ICONS.undo}${w ? '<span>Отменить</span>' : ''}</button>
      <button class="tb-icon" data-act="redo" aria-label="Вернуть ход"${off(!game.future.length)}>${ICONS.redo}${w ? '<span>Вернуть</span>' : ''}</button>
      <button class="tb-icon" data-act="reset" aria-label="Начать заново: очистить доску"${off(isBlank(game))}>${ICONS.reset}${w ? '<span>Заново</span>' : ''}</button>
      <button class="tb-btn hint-btn${f.hint?.stage === 1 ? ' more' : ''}" data-act="hint"${off(false)}>Подсказка</button>
      ${accuseBtn}
    </nav>`;
}

function phoneHtml(f) {
  return `
    <div class="layout phone" data-key="phone">
      <section class="board-wrap">${boardHtml(f)}</section>
    </div>
    <div class="dock" data-key="dock">
      ${cluePanelHtml(f)}
      ${toolbarHtml(f)}
    </div>`;
}

function wideHtml(f) {
  return `
    <div class="layout wide" data-key="wide">
      <section class="file">
        ${bannerHtml(puzzle)}
        <p class="place-tag">${esc(themeTitle(puzzle))}</p>
        <p class="intro">${esc(introText(puzzle))}</p>
        ${mainClueHtml(f)}
        <h2 class="sec">Улики · ${f.clues.length} · осталось ${f.remaining}</h2>
        <div class="clues mode-list">${clueListHtml(f)}</div>
      </section>
      <section class="desk">
        ${boardHtml(f)}
        ${toolbarHtml(f)}
        ${hintHtml(f) || '<p class="desk-tip">Тап — ✗, ещё тап — ✓. Правая кнопка — сразу ✓. Стрелки и Enter тоже работают.</p>'}
      </section>
    </div>`;
}

const toastHtml = () =>
  ui.toast
    ? `<div class="toast" role="status" data-key="${esc(ui.toast.text)}"><span>${esc(ui.toast.text)}</span>${ui.toast.act ? `<button data-act="${ui.toast.act}">${esc(ui.toast.label)}</button>` : ''}</div>`
    : '';

// Данные для листов.
function sheetData() {
  return {
    key,
    puzzle,
    game,
    settings,
    stats,
    title,
    subtitle,
    isToday,
    orderK: ctx.orderK,
    draft: ui.draft,
    prefilled: ui.prefilled,
    accuseError: ui.accuseError,
    shareNote: ui.shareNote,
    story,
    archive: archive(),
    savedGame: (k) => {
      const saved = storage.get(saveKey(k));
      return saved && typeof saved.game === 'object' ? saved.game : null;
    },
  };
}

// Дело дня и 14 прошлых (с первого дела, не раньше).
function archive() {
  const out = [];
  const now = new Date();
  for (let i = 0; i <= 14; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dateKey(day);
    const number = caseNumber(k);
    if (number < 1) break;
    out.push({ key: k, number, date: dateLabel(k), today: i === 0, href: i === 0 ? location.pathname : `?date=${k}` });
  }
  return out;
}

/* ---------- отрисовка ---------- */

let lastSheet = null;
let lastInput = 'pointer'; // чем игрок действовал последним: 'key' или 'pointer'
addEventListener('keydown', () => (lastInput = 'key'), true);
addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
let opener = null; // кто открыл лист — туда вернётся фокус

function render() {
  const f = frame();
  const html = `${headerHtml(f)}${wide() ? wideHtml(f) : phoneHtml(f)}<div class="sheets">${sheetHtml(ui.sheet, sheetData())}</div><div class="toasts">${toastHtml()}</div>`;
  morph(app, html);
  document.body.classList.toggle('sheet-open', Boolean(ui.sheet));
  if (ui.sheet !== lastSheet) {
    if (ui.sheet) {
      if (!lastSheet) opener = document.activeElement;
      const sheet = app.querySelector('.sheet');
      // с клавиатуры — сразу на главную кнопку; после касания или мыши — на сам лист, без рамки фокуса
      const button = lastInput === 'key' ? sheet.querySelector('[data-autofocus]:not([disabled])') : null;
      (button ?? sheet).focus({ preventScroll: true });
      if (ui.sheet === 'result') loadStory();
    } else if (opener?.isConnected) {
      opener.focus({ preventScroll: true });
    }
    lastSheet = ui.sheet;
  }
  watchDock();
}

// Высота нижней панели — в CSS-переменную: от неё зависят высота строк доски и отступ страницы.
let dockSeen = null;
const dockObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => setDockHeight(entry.target)) : null;
// --dock-base — без подсказки: строки доски не прыгают, когда подсказка появляется и исчезает.
function setDockHeight(el) {
  const full = Math.ceil(el.getBoundingClientRect().height);
  const hintBar = el.querySelector('.hintbar')?.getBoundingClientRect().height ?? 0;
  const root = document.documentElement.style;
  root.setProperty('--dock-h', `${full}px`);
  root.setProperty('--dock-base', `${Math.ceil(full - hintBar)}px`);
}
function watchDock() {
  const dock = app.querySelector('.dock');
  if (dock === dockSeen) return;
  dockObserver?.disconnect();
  dockSeen = dock;
  if (dock) {
    setDockHeight(dock);
    dockObserver?.observe(dock);
  } else {
    document.documentElement.style.setProperty('--dock-h', '0px');
    document.documentElement.style.setProperty('--dock-base', '0px');
  }
}

/* ---------- изменения партии ---------- */

let before = derive();

// Музыка напрягается по мере того, как доска заполняется; колонка преступника собрана — на максимум.
function tension(base = before) {
  try {
    audio?.setTension(base.complete ? 1 : base.progress);
  } catch {
    // звук не главное
  }
}

// После хода: звуки «улика сошлась» и «колонка закрылась», сохранение, отрисовка.
function changed({ sounds = true } = {}) {
  const now = derive();
  if (sounds) {
    const newlyDone = now.states.some((s, i) => s === 'done' && before.states[i] !== 'done');
    const newlyLocked = [...now.locked].some((t) => !before.locked.has(t));
    if (newlyLocked) setTimeout(() => sfx('lock'), 160);
    else if (newlyDone) setTimeout(() => sfx('done'), 160);
  }
  before = now;
  tension(now);
  save();
  render();
}

const cellEl = (r, t) => app.querySelector(`.cell[data-r="${r}"][data-t="${t}"]`);

// Перезапустить короткую анимацию класса на узле (вспышка, тряска).
function replay(el, cls, ms = 700) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function tapCell(r, t, want = null) {
  ui.focus = [r, t];
  if (isOver(game)) return render();
  const res = tap(game, r, t, { easy: settings.easy, want });
  if (!res) return render();
  if (res.blocked) {
    sfx('blocked');
    render();
    replay(cellEl(...res.blocked), 'flash');
    return;
  }
  if (res.mark === AUTO_CHECK) {
    // клетка уже отмечена сама — подскажем, что тут ничего делать не надо
    render();
    replay(cellEl(r, t), 'flash');
    return;
  }
  ui.hint = null;
  ui.toast = null;
  sfx(res.mark === CROSS ? 'cross' : res.mark === CHECK ? 'check' : 'clear');
  changed();
}

function doUndo() {
  if (!undo(game)) return;
  ui.hint = null;
  ui.toast = null;
  sfx('clear');
  changed({ sounds: false });
}

function doRedo() {
  if (!redo(game)) return;
  ui.hint = null;
  ui.toast = null;
  sfx('clear');
  changed({ sounds: false });
}

let toastTimer = 0;
function showToast(toast, ms = 6000) {
  ui.toast = toast;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    render();
  }, ms);
}

/* ---------- улики ---------- */

// Следующая неотработанная улика в сторону dir; если все отработаны — просто соседняя.
function stepClue(dir) {
  const total = puzzle.clues.length;
  const anyOpen = puzzle.clues.some((_, j) => isOpen(before.states, j));
  let i = ui.cursor;
  for (let s = 0; s < total; s++) {
    i = (i + dir + total) % total;
    if (!anyOpen || isOpen(before.states, i)) break;
  }
  ui.cursor = i;
  ui.stepDir = dir;
  ui.active = ui.hint ? null : ui.cursor;
  sfx('select');
  render();
}

function firstOpenClue() {
  const i = puzzle.clues.findIndex((_, j) => isOpen(before.states, j));
  return i < 0 ? 0 : i;
}
ui.cursor = firstOpenClue();

function pickClue(i) {
  ui.hint = null;
  ui.stepDir = 0;
  if (ui.active === i) ui.active = null;
  else {
    ui.active = i;
    if (i >= 0) ui.cursor = i;
    sfx('select');
  }
  render();
}

// Список улик в панели: прокрутить к улике внутри списка, не двигая страницу.
function revealClue(i) {
  const item = app.querySelector(`.dock .cl-list [data-key="c${i}"]`);
  const list = item?.closest('.cl-list');
  if (!list) return;
  const top = item.offsetTop - list.offsetTop;
  if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
  }
}

// Подсвеченная подсказкой клетка или строка должна быть видна — не под панелью и не над экраном.
function revealBoard() {
  const el = app.querySelector('.cell.tgt') ?? app.querySelector('.brow.hl') ?? app.querySelector('.slot-h.hl');
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const dock = app.querySelector('.dock');
  const bottom = dock ? dock.getBoundingClientRect().top - 8 : innerHeight - 8;
  const headH = app.querySelector('.bhead')?.getBoundingClientRect().height ?? 0;
  if (rect.top >= headH + 4 && rect.bottom <= bottom) return;
  scrollBy({ top: rect.bottom > bottom ? rect.bottom - bottom + 12 : rect.top - headH - 12, behavior: 'smooth' });
}

/* ---------- подсказка ---------- */

// Первое нажатие — куда смотреть; второе по той же подсказке — что именно отметить.
function doHint() {
  if (isOver(game)) return;
  const easy = settings.easy;
  const probe = hint(game, puzzle, { easy, detail: false, count: false });
  if (ui.hint && ui.hint.key === probe.key && ui.hint.stage === 1 && probe.kind === 'step') {
    ui.hint = { ...hint(game, puzzle, { easy, detail: true, count: false }), stage: 2 };
  } else if (!(ui.hint && ui.hint.key === probe.key)) {
    ui.hint = { ...hint(game, puzzle, { easy, detail: false, count: true }), stage: probe.kind === 'step' ? 1 : 2 };
  }
  ui.active = null;
  ui.toast = null;
  if (ui.hint.clue !== null) {
    ui.cursor = ui.hint.clue;
    ui.stepDir = 0;
  }
  sfx('hint');
  save();
  render();
  if (ui.hint.clue !== null) revealClue(ui.hint.clue);
  revealBoard();
  for (const el of app.querySelectorAll('.cell.tgt')) replay(el, 'flash');
}

/* ---------- обвинение ---------- */

function openAccuse() {
  const facts = culpritFacts(game, puzzle, settings.easy);
  const draft = { g: ui.draft.g, values: { ...ui.draft.values } };
  let filled = false;
  if (facts.g !== null) {
    draft.g = facts.g;
    filled = true;
  }
  for (const k of accuseCategories(puzzle)) {
    if (facts.values[k] === undefined) continue;
    draft.values[k] = facts.values[k];
    filled = true;
  }
  ui.draft = draft;
  ui.prefilled = filled;
  ui.accuseError = '';
  openSheet('accuse');
}

function openSheet(name) {
  ui.sheet = name;
  if (name !== 'result') sfx('open');
  render();
}

function finish(sound) {
  ui.hint = null;
  ui.active = null;
  ui.toast = null;
  ui.shareNote = '';
  recordResult();
  save();
  ui.sheet = 'result';
  render();
  setTimeout(() => sfx(sound), 250); // под удар печати
}

function closeSheet() {
  if (!ui.sheet) return;
  if (ui.sheet === 'brief' && !game.started) return start();
  if (ui.sheet === 'help' && !settings.seenHelp) {
    settings.seenHelp = true;
    saveSettings();
  }
  ui.sheet = null;
  render();
}

function start() {
  const first = !game.started;
  game.started = true;
  save();
  ui.sheet = first && !settings.seenHelp ? 'help' : null;
  if (ui.sheet) sfx('open');
  render();
}

/* ---------- история дела ---------- */

// stories/<дата>.json пишет GitHub Action. Загружаем каждый раз, когда показываем итог:
// историю могут переписать — показываем свежую. Чужой id — история к другому делу.
let story = null;
let storyRequested = false;

async function loadStory() {
  if (storyRequested || puzzle.random) return;
  storyRequested = true;
  try {
    const response = await fetch(`stories/${key}.json`, { cache: 'no-cache' });
    if (!response.ok) return;
    const data = await response.json();
    if (data.id !== id || typeof data.text !== 'string') return;
    story = { id, text: data.text };
    if (ui.sheet === 'result') render();
  } catch {
    // истории нет — итог покажем без неё
  }
}

/* ---------- поделиться ---------- */

function shareUrl() {
  const base = `${location.origin}${location.pathname}`;
  if (isToday) return base;
  return puzzle.random ? `${base}?case=${key}` : `${base}?date=${key}`;
}

function share() {
  // shareText знает только номер дела; у случайного номера нет — подставим заголовок
  const text = shareText({ number: puzzle.number ?? 0, game, streak: isToday ? streak(stats, puzzle.number) : 0, url: shareUrl() }).replace(
    `Дело №${puzzle.number ?? 0}`,
    title,
  );
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  const note = (t) => {
    ui.shareNote = t;
    render();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => note('Скопировано — можно вставить в чат.'), () => note(text));
  else note(text);
}

/* ---------- действия ---------- */

const actions = {
  cell: (el) => tapCell(+el.dataset.r, +el.dataset.t),
  pick: (el) => pickClue(+el.dataset.i),
  use(el) {
    const i = +el.dataset.i;
    toggleClue(game, i);
    sfx('select');
    changed({ sounds: false });
  },
  step: (el) => stepClue(+el.dataset.dir),
  'clue-mode'() {
    settings.clueMode = settings.clueMode === 'list' ? 'one' : 'list';
    saveSettings();
    render();
    if (settings.clueMode === 'list' && ui.active !== null && ui.active >= 0) revealClue(ui.active);
  },
  undo: doUndo,
  redo: doRedo,
  reset() {
    if (!reset(game)) return;
    ui.hint = null;
    ui.active = null;
    sfx('clear');
    showToast({ text: 'Доска очищена', act: 'toast-undo', label: 'Вернуть' });
    changed({ sounds: false });
  },
  'toast-undo'() {
    ui.toast = null;
    clearTimeout(toastTimer);
    doUndo();
    render();
  },
  hint: doHint,
  'close-hint'() {
    ui.hint = null;
    render();
  },
  accuse: openAccuse,
  'pick-g'(el) {
    ui.draft.g = +el.dataset.g;
    ui.accuseError = '';
    sfx('select');
    render();
  },
  'pick-v'(el) {
    ui.draft.values[+el.dataset.k] = +el.dataset.v;
    ui.accuseError = '';
    sfx('select');
    render();
  },
  submit() {
    if (accuse(game, puzzle, ui.draft)) return finish('solved');
    ui.accuseError = `Не сходится. Неверных обвинений: ${game.wrong}.`;
    save();
    sfx('wrong');
    render();
    replay(app.querySelector('.sheet'), 'shake', 450);
  },
  giveup: () => openSheet('giveup'),
  'confirm-giveup'() {
    giveUp(game);
    finish('gaveup');
  },
  'show-result'() {
    ui.shareNote = '';
    openSheet('result');
  },
  share,
  'random-case'() {
    location.href = `?case=${randomKey()}`;
  },
  brief: () => openSheet('brief'),
  start,
  help: () => openSheet('help'),
  menu: () => openSheet('menu'),
  sound() {
    const on = !soundOn();
    settings.music = on;
    settings.sfx = on;
    saveSettings();
    audio?.refreshAudio();
    render();
  },
  'close-sheet': closeSheet,
  backdrop: closeSheet,
};

// Долгое нажатие на клетку — сразу ✓; после него обычный click не должен сработать.
let press = null;
let suppressClick = false;
let lastPointer = 'mouse';
// Свайп по улике в режиме «по одной».
let swipe = null;
let swiped = false;

app.addEventListener('pointerdown', (event) => {
  lastPointer = event.pointerType;
  suppressClick = false;
  swiped = false;
  const cell = event.target.closest('.cell[data-act]');
  if (cell && event.pointerType !== 'mouse') {
    const r = +cell.dataset.r;
    const t = +cell.dataset.t;
    press = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        suppressClick = true;
        press = null;
        navigator.vibrate?.(12);
        tapCell(r, t, CHECK);
      }, 450),
    };
  }
  if (event.target.closest('[data-swipe]')) swipe = { x: event.clientX, y: event.clientY };
});

app.addEventListener('pointermove', (event) => {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
    clearTimeout(press.timer);
    press = null;
  }
});

function endPress(event) {
  if (press) {
    clearTimeout(press.timer);
    press = null;
  }
  if (swipe && event.type === 'pointerup') {
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      stepClue(dx < 0 ? 1 : -1);
    }
  }
  swipe = null;
}
app.addEventListener('pointerup', endPress);
app.addEventListener('pointercancel', endPress);

app.addEventListener('contextmenu', (event) => {
  const cell = event.target.closest('.cell[data-act]');
  if (!cell) return;
  event.preventDefault();
  // на телефоне долгое нажатие уже обработано таймером
  if (lastPointer !== 'mouse') return;
  tapCell(+cell.dataset.r, +cell.dataset.t, CHECK);
});

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'backdrop' && event.target !== el) return; // клик внутри листа
  if (act === 'cell' && suppressClick) {
    suppressClick = false;
    return;
  }
  if (swiped && el.closest('[data-swipe]')) {
    swiped = false;
    return;
  }
  actions[act]?.(el, event);
});

// Настройки в «Как играть».
app.addEventListener('change', (event) => {
  const name = event.target.dataset?.set;
  if (!name) return;
  settings = { ...settings, [name]: event.target.checked };
  saveSettings();
  if (name === 'easy') {
    before = derive();
    tension();
  } else audio?.refreshAudio();
  render();
});

/* ---------- клавиатура ---------- */

function moveFocus(dr, dt) {
  const [r, t] = ui.focus;
  ui.focus = [Math.max(0, Math.min(ctx.rows - 1, r + dr)), Math.max(0, Math.min(n - 1, t + dt))];
  render();
  cellEl(...ui.focus)?.focus();
}

function trapFocus(event) {
  const sheet = app.querySelector('.sheet');
  if (!sheet) return;
  const items = [...sheet.querySelectorAll('button:not([disabled]), a[href], input')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (ui.sheet) closeSheet();
    else if (ui.hint || ui.active !== null) {
      ui.hint = null;
      ui.active = null;
      render();
    }
    return;
  }
  if (ui.sheet) {
    if (event.key === 'Tab') trapFocus(event);
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  // по коду клавиши, а не по букве: в русской раскладке Z — это «я»
  if (mod && event.code === 'KeyZ') {
    event.preventDefault();
    if (event.shiftKey) doRedo();
    else doUndo();
    return;
  }
  if (mod && event.code === 'KeyY') {
    event.preventDefault();
    doRedo();
    return;
  }
  const cell = event.target.closest?.('.cell[data-act]');
  if (!cell) return;
  if (ARROWS[event.key]) {
    event.preventDefault();
    moveFocus(...ARROWS[event.key]);
  } else if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault();
    tapCell(+cell.dataset.r, +cell.dataset.t, CHECK);
  }
});

// Фокус пришёл на клетку мышью или Tab — запомним её для стрелок.
app.addEventListener('focusin', (event) => {
  const cell = event.target.closest?.('.cell[data-act]');
  if (cell) ui.focus = [+cell.dataset.r, +cell.dataset.t];
});

/* ---------- секундомер ---------- */

// Идёт после начала расследования и только пока не открыт лист (кроме обвинения).
const ticking = () => game.started && !isOver(game) && !document.hidden && (!ui.sheet || ui.sheet === 'accuse' || ui.sheet === 'giveup');

setInterval(() => {
  const countdown = document.getElementById('countdown');
  if (countdown) countdown.textContent = untilMidnight();
  if (!ticking()) return;
  game.elapsed++;
  const timer = document.getElementById('timer');
  if (timer) timer.textContent = clock(game.elapsed);
  if (game.elapsed % 5 === 0) save();
}, 1000);
document.addEventListener('visibilitychange', save);
window.addEventListener('pagehide', save);
wideQuery.addEventListener('change', () => render());

// Первая отрисовка — без анимаций: колонки, закрытые до перезагрузки, не должны «закрываться» снова.
document.documentElement.classList.add('boot');
render();
tension();
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('boot')));
