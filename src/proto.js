// Прототип режима «показания» (proto.html): преступник лжёт в каждой фразе, невиновные говорят правду.
// Генератор — testimony.js. Экран устроен как main.js — состояние → строка HTML → morph(app, html),
// листы — модальный <dialog>, — но проще: без музыки, секундомера и подсказок.
//
// Версия «допустим, лжёт X»: его фразы переворачиваются, а новые отметки на доске идут карандашом
// (запоминаем доску на момент начала версии; всё, что отличается, — карандаш). «Отказаться» возвращает
// доску как была, «Это он» оставляет отметки и считает X лжецом.

import { caseId, caseTitle, dateKey, dateLabel, isCaseKey, isDateKey, randomKey } from './daily.js';
import { accuseRight, negate, testimonyPuzzle, tryVersion } from './testimony.js';
import { AUTO_CHECK, CHECK, CROSS, checkpoint, clueState, giveUp, isCheck, isOver, newGame, posFromMarks, progress, redo, tap, undo, view } from './game.js';
import { clueRefs, context, onlyValue, settled } from './logic.js';
import { clueParts, clueText, confessionText, goneText, introText, themeTitle, valueName } from './text.js';
import { portrait, scene } from './art.js';
import { count } from './stats.js';
import { morph } from './morph.js';
import { boardHtml } from './ui-board.js';
import { bannerHtml, chronicle, sheetHtml } from './ui-sheets.js';
import { ICONS, cap, esc, partsHtml, storage } from './ui-util.js';

const app = document.getElementById('app');

// Объявления для экранного диктора — как в main.js: одна live-область вне #app или ariaNotify().
const announcer = Object.assign(document.createElement('p'), { className: 'visually-hidden' });
announcer.setAttribute('aria-live', 'polite');
document.body.append(announcer);
function announce(text) {
  if (typeof document.ariaNotify === 'function') return document.ariaNotify(text);
  announcer.textContent = '';
  requestAnimationFrame(() => (announcer.textContent = text));
}

// Дело собирается за доли секунды; сперва дадим браузеру показать заставку.
await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const params = new URLSearchParams(location.search);
const asked = params.get('case') ?? params.get('date');
const key = isCaseKey(asked) ? asked : dateKey();

// Дело дня — из заготовки (scripts/testimony-cases.mjs): трудное дело телефон собирал бы долго.
// Нет заготовки или это случайное дело — собираем сами.
async function loadPuzzle() {
  if (isDateKey(key)) {
    try {
      const response = await fetch(`cases/testimony/${key}.json`);
      if (response.ok) return await response.json();
    } catch {
      // нет сети или файла — соберём сами
    }
  }
  return testimonyPuzzle(key);
}
const puzzle = await loadPuzzle();
const ctx = context(puzzle);
const { n } = ctx;
const id = caseId(puzzle);
const title = caseTitle(puzzle);
const subtitle = `${themeTitle(puzzle)}, ${puzzle.random ? 'случайное дело' : dateLabel(key)}`;
document.title = `${title} — показания`;
const { suspects, statements, evidence } = puzzle;
// proto3d.html: вокруг дела — 3D-кабинет детектива (office3d.js); proto.html — без него
const with3d = document.body.dataset.scene === '3d';
const calm = matchMedia('(prefers-reduced-motion: reduce)');
// Номер фразы в puzzle.clues: сначала показания (по две на человека), потом протокол.
const sayIndex = (g, i) => statements.slice(0, g).reduce((sum, st) => sum + st.length, 0) + i;
const factIndex = (j) => statements.flat().length + j;

/* ---------- партия ---------- */

// К обычной партии добавлено: draft — проверяемая версия { liar, base: доска на её начало },
// liar — кого игрок признал лжецом, dropped — сколько версий отброшено.
const SAVE = `case404:testimony:v1:${key}`;
function loadGame() {
  const fresh = { ...newGame(puzzle), draft: null, liar: null, dropped: 0 };
  const saved = storage.get(SAVE);
  const g = saved?.game;
  if (saved?.id !== id || !g || !Array.isArray(g.marks)) return fresh;
  return { ...fresh, ...g };
}
const game = loadGame();
const save = () => storage.set(SAVE, { id, game });
const settings = { sfx: true, ...storage.get('case-file:settings') };

const ui = {
  sheet: isOver(game) ? 'result' : game.started ? null : 'brief',
  active: null, // подсвеченная фраза: номер в puzzle.clues или null
  focus: [0, 0],
  draft: { g: null, values: {} }, // черновик обвинения
  prefilled: false,
  accuseError: '',
};

// Звук действий (без музыки). Не загрузится — играть можно и так.
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
    mod.setupAudio(() => ({ music: false, sfx: settings.sfx !== false }));
  })
  .catch(() => {});

/* ---------- кто под подозрением ---------- */

const suspected = () => game.draft?.liar ?? game.liar; // чьи фразы сейчас перевёрнуты
const flipped = (g) => suspected() === g;
const sayClue = (g, i) => (flipped(g) ? negate(statements[g][i]) : statements[g][i]);
const she = (g, m, f) => (suspects[g].gender === 'f' ? f : m);

/* ---------- что видно на доске ---------- */

const wideQuery = matchMedia('(min-width: 960px)');
const wide = () => wideQuery.matches;

// Фраза, которая сейчас действует: у подозреваемого — перевёрнутая.
function activeClue(i) {
  const total = statements.flat().length;
  if (i >= total) return evidence[i - total];
  let g = 0;
  let at = i;
  while (at >= statements[g].length) at -= statements[g++].length;
  return sayClue(g, at);
}

function frame() {
  const d = view(game, n);
  const pos = posFromMarks(game, n);
  const locked = new Set();
  for (let t = 0; t < n; t++) {
    if (ctx.groups.every((_, g) => Array.from({ length: n }, (_, v) => d[g * n + v][t]).some(isCheck))) locked.add(t);
  }
  const hl = { rows: new Set(), slots: new Set() };
  if (ui.active !== null) {
    const refs = clueRefs(ctx, activeClue(ui.active));
    refs.rows.forEach((r) => hl.rows.add(r));
    refs.slots.forEach((t) => hl.slots.add(t));
  }
  // карандаш — то, что изменилось с начала версии
  const draft = new Set();
  if (game.draft) game.marks.forEach((row, r) => row.forEach((m, t) => m !== game.draft.base[r][t] && draft.add(`${r}:${t}`)));
  const solvedRows = new Set();
  pos.forEach((mask, r) => onlyValue(mask) >= 0 && solvedRows.add(r));
  const liar = suspected();
  const slot = liar === null ? -1 : onlyValue(pos[liar]);
  return {
    puzzle,
    ctx,
    d,
    pos,
    hl,
    draft,
    targets: new Map(),
    locked,
    solvedRows,
    whoAt: Array.from({ length: n }, (_, t) => settled(ctx, pos, 0, t)),
    groupDone: ctx.groups.map((_, g) => Array.from({ length: n }, (_, v) => g * n + v).filter((r) => solvedRows.has(r)).length),
    over: isOver(game),
    focus: ui.focus,
    // строка подозреваемого подписана красным, его колонка окрашена, когда известно время
    culprit: { slot, attrRow: liar ?? -1 },
    progress: progress(game, puzzle),
  };
}

/* ---------- разметка ---------- */

const night = `<span class="top-night" aria-hidden="true" data-static="night">${scene(puzzle.theme, puzzle.story.art).replace('xMidYMax slice', 'xMidYMin slice')}</span>`;

// Настольная лампа: кнопка «за стол» — в кабинет и обратно.
const LAMP = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5h12l-2.2-5H5.7z"/><path d="M9.5 10.5V19"/><path d="M5 20h9"/><path d="M14 10.5v3.2"/><path d="M18 9.5l2.5 1M18.3 6.3l2.2-1.3"/></svg>`;

const headerHtml = () => `
  <header class="top">
    ${night}
    <button class="case-btn" data-act="brief" aria-label="${esc(title)}: как играть">
      <span class="case-no">${esc(title)}<span class="proto-tag">показания</span></span>
      <span class="case-sub">${esc(goneText(puzzle))}</span>
    </button>
    ${desk.on ? `<button class="icon-btn desk-btn" data-act="to-desk" aria-label="За стол: кабинет детектива" aria-pressed="false">${LAMP}</button>` : ''}
    <button class="icon-btn q" data-act="brief" aria-label="Как играть">?</button>
  </header>`;

// Штамп на протоколе, когда дело закрыто, — в 3D его ставит рука, в 2D он остаётся на листе.
const paperStamp = (f) =>
  desk.on && f.over ? `<div class="paper-stamp${game.solved ? '' : ' lost'}${desk.stamping ? ' pending' : ''}" data-key="paper-stamp" aria-hidden="true">${game.solved ? 'Раскрыто' : 'Не раскрыто'}</div>` : '';

// Фраза: обычная — как сказана; у подозреваемого — зачёркнута, под ней — что из неё следует.
function sayHtml(g, i, f) {
  const idx = sayIndex(g, i);
  const said = statements[g][i];
  const now = sayClue(g, i);
  const state = clueState(game, puzzle, now);
  const cls = ['say', ui.active === idx && 'act', state === 'conflict' && 'conflict', state === 'done' && 'done'].filter(Boolean).join(' ');
  const body = flipped(g)
    ? `<s class="said">${partsHtml(clueParts(puzzle, said))}</s><span class="flip"><span class="flip-tag">значит</span>${partsHtml(clueParts(puzzle, now))}</span>`
    : `<span class="txt">${partsHtml(clueParts(puzzle, said))}</span>`;
  const badge = state === 'conflict' ? '<span class="badge">не сходится с отметками</span>' : '';
  return `<li><button class="${cls}" data-act="pick" data-i="${idx}" aria-pressed="${ui.active === idx}">${body}${badge}</button></li>`;
}

function witnessHtml(g, f) {
  const p = suspects[g];
  const testing = game.draft?.liar === g;
  const marked = game.liar === g && !game.draft;
  const label = testing ? 'Проверяю' : marked ? she(g, 'Лжец', 'Лжёт') : 'Лжёт?';
  const aria = testing ? `Версия: лжёт ${p.name}` : marked ? `${p.name} — лжец. Нажми, чтобы снять` : `Проверить версию: лжёт ${p.name}`;
  return `
    <li class="witness${testing ? ' testing' : ''}${marked ? ' marked' : ''}" data-key="w${g}">
      <div class="w-head">
        <span class="mini" data-static="${esc(p.role)}">${portrait(p.role)}</span>
        <span class="w-name"><b>${esc(p.name)}</b><span class="w-role">${esc(p.role)}</span></span>
        <button class="w-liar${testing || marked ? ' on' : ''}" data-act="suspect" data-g="${g}" aria-pressed="${testing || marked}" aria-label="${esc(aria)}"${f.over ? ' disabled' : ''}>${label}</button>
      </div>
      <ol class="w-says">${statements[g].map((_, i) => sayHtml(g, i, f)).join('')}</ol>
    </li>`;
}

function protocolHtml() {
  if (!evidence.length) return '';
  const items = evidence
    .map((c, j) => {
      const idx = factIndex(j);
      const state = clueState(game, puzzle, c);
      const cls = ['say', 'fact', ui.active === idx && 'act', state === 'conflict' && 'conflict', state === 'done' && 'done'].filter(Boolean).join(' ');
      return `<li><button class="${cls}" data-act="pick" data-i="${idx}" aria-pressed="${ui.active === idx}"><span class="txt">${partsHtml(clueParts(puzzle, c))}</span>${
        state === 'conflict' ? '<span class="badge">не сходится с отметками</span>' : ''
      }</button></li>`;
    })
    .join('');
  return `<li class="protocol" data-key="protocol"><div class="w-head"><span class="w-name"><b>Протокол</b><span class="w-role">проверенные факты — верны всегда</span></span></div><ol class="w-says">${items}</ol></li>`;
}

// Полоса версии: что сейчас проверяем и что с этим сделать.
function versionHtml() {
  if (!game.draft) return '';
  const g = game.draft.liar;
  const name = suspects[g].name;
  return `
    <div class="version" data-key="version" role="group" aria-label="Версия">
      <p><b>Версия: ${esc(name)} ${she(g, 'лжёт', 'лжёт')}.</b> ${she(g, 'Его', 'Её')} фразы перевёрнуты, новые отметки — карандашом. Не сходится — откажись.</p>
      <div class="version-btns">
        <button class="v-btn" data-act="version-drop">Отказаться</button>
        <button class="v-btn keep" data-act="version-keep">${she(g, 'Это он', 'Это она')}</button>
      </div>
    </div>`;
}

const listHtml = (f) => `<ol class="witnesses">${suspects.map((_, g) => witnessHtml(g, f)).join('')}${protocolHtml()}</ol>`;

function toolbarHtml(f) {
  const off = (cond) => (f.over || cond ? ' disabled' : '');
  const w = wide();
  const accuseBtn = f.over
    ? '<button class="tb-btn primary" data-act="show-result">Итог</button>'
    : '<button class="tb-btn primary" data-act="accuse">Обвинить</button>';
  return `
    <nav class="toolbar" aria-label="Действия">
      <button class="tb-icon" data-act="undo" aria-label="Отменить отметку"${off(!game.past.length)}>${ICONS.undo}${w ? '<span>Отменить</span>' : ''}</button>
      <button class="tb-icon" data-act="redo" aria-label="Вернуть отметку"${off(!game.future.length)}>${ICONS.redo}${w ? '<span>Вернуть</span>' : ''}</button>
      <button class="tb-btn" data-act="brief">Правила</button>
      ${accuseBtn}
    </nav>`;
}

function phoneHtml(f) {
  return `
    <div class="layout phone" data-key="phone"><section class="board-wrap">${boardHtml(f)}${paperStamp(f)}</section></div>
    <div class="dock" data-key="dock">
      <div class="clues mode-list">
        ${versionHtml()}
        <div class="cl-list">${listHtml(f)}</div>
      </div>
      ${toolbarHtml(f)}
    </div>`;
}

function wideHtml(f) {
  return `
    <div class="layout wide" data-key="wide">
      <section class="file">
        <p class="rule-line"><b>Преступник один, и он лжёт в каждой фразе.</b> Остальные говорят правду, протокол верен всегда.</p>
        ${listHtml(f)}
      </section>
      <section class="desk">
        ${versionHtml()}
        ${boardHtml(f)}
        ${toolbarHtml(f)}
        <p class="desk-tip">Тап по фразе подсвечивает на доске, о чём она. Тап по клетке — ✗, ещё тап — ✓, правая кнопка — сразу ✓.</p>
        ${paperStamp(f)}
      </section>
    </div>`;
}

/* ---------- листы ---------- */

const af = (S) => (S.keyFocus ? ' autofocus' : '');

function brief(S) {
  return `
    ${bannerHtml(puzzle)}
    <h2 class="sheet-title" id="sheet-title">${esc(title)}: показания</h2>
    <p class="brief-date">${esc(subtitle)} · прототип нового режима</p>
    <p class="intro">${esc(introText(puzzle))}</p>
    <h3 class="sec">Как играть</h3>
    <ol class="howto">
      <li><b>Преступник один, и он лжёт в каждой фразе.</b> Остальные четверо говорят правду. Факты протокола верны всегда.</li>
      <li><b>Ищи противоречие:</b> две фразы разных людей, которые не могут быть верны вместе. Значит, лжёт один из этих двоих.</li>
      <li><b>Проверь версию:</b> нажми «Лжёт?» у подозреваемого. Его фразы перевернутся — ложь наоборот тоже правда, — а отметки пойдут карандашом. Пришёл к противоречию — «Отказаться».</li>
      <li><b>Нашёл лжеца — узнай о нём всё</b> на доске: когда пришёл, где был, что при нём нашли. И жми «Обвинить».</li>
    </ol>
    <p class="note">Каждый пришёл в своё время, был в своём месте, и у каждого своя вещь — ничего не повторяется.
    «Один за другим» — подряд в любом порядке, «между ними приходил кто-то ещё» — не подряд.</p>
    <div class="actions"><button class="btn primary" data-act="start"${af(S)}>${game.started ? 'К делу' : 'Начать'}</button></div>`;
}

// Обвинение: кто и всё о нём. Если лжец уже отмечен — заполнено по доске.
const KEYS = puzzle.categories.map((c) => c.key);
const ACCUSE_TITLES = { time: 'Когда пришёл?', place: 'Где был?', item: 'Что при нём нашли?' };
function accuseSheet(S) {
  const names = suspects
    .map((p, g) => {
      const on = ui.draft.g === g;
      return `<button class="pick-chip who${on ? ' on' : ''}" data-act="pick-g" data-g="${g}" aria-pressed="${on}"><span class="mini" data-static="${esc(p.role)}">${portrait(p.role)}</span>${esc(p.name)}</button>`;
    })
    .join('');
  const groups = puzzle.categories
    .map((cat, k) => {
      const chips = cat.values
        .map((_, v) => {
          const on = ui.draft.values[k] === v;
          return `<button class="pick-chip ${cat.key}${on ? ' on' : ''}" data-act="pick-v" data-k="${k}" data-v="${v}" aria-pressed="${on}">${esc(cap(valueName(puzzle, k, v)))}</button>`;
        })
        .join('');
      return `<h3 class="sec">${ACCUSE_TITLES[cat.key]}</h3><div class="pick" role="group" aria-label="${ACCUSE_TITLES[cat.key]}">${chips}</div>`;
    })
    .join('');
  const ready = ui.draft.g !== null && KEYS.every((_, k) => ui.draft.values[k] !== undefined);
  return `
    <h2 class="sheet-title" id="sheet-title">Обвинение</h2>
    ${S.prefilled ? '<p class="note prefill">Заполнено по доске — проверь и подтверди.</p>' : ''}
    <h3 class="sec">Кто лжёт?</h3><div class="pick" role="group" aria-label="Кто лжёт?">${names}</div>
    ${groups}
    <p class="error" role="alert">${esc(S.accuseError)}</p>
    <div class="actions">
      <button class="btn" data-act="close-sheet">К делу</button>
      <button class="btn primary" data-act="submit" ${ready ? '' : 'disabled'}${af(S)}>Обвинить</button>
    </div>
    <button class="link" data-act="giveup">Сдаться и узнать ответ</button>`;
}

function giveupSheet(S) {
  return `
    <h2 class="sheet-title" id="sheet-title">Сдаться?</h2>
    <p class="lead">Покажем ответ и разбор, а дело останется нераскрытым.</p>
    <div class="actions">
      <button class="btn" data-act="accuse"${af(S)}>Ещё подумаю</button>
      <button class="btn primary" data-act="confirm-giveup">Сдаться</button>
    </div>`;
}

// Разбор: где противоречие, почему не другие подозреваемые, что значила ложь.
function explainHtml() {
  const c = puzzle.culprit;
  // в цитате — без точки в конце: «Вера пришла в 19:00», а не «…в 19:00.»,
  const bare = (clue) => clueText(puzzle, clue).replace(/\.$/, '');
  const quote = ([g, i]) => `<b>${esc(suspects[g].name)}:</b> «${esc(bare(statements[g][i]))}»`;
  const sets = puzzle.conflicts.map(
    (set) => `<li>Противоречие: ${set.at.map(quote).join(set.at.length === 2 ? ' и ' : ', ')}. Вместе ${set.at.length === 2 ? 'эти фразы' : 'все три'} неверны — лжёт кто-то из говоривших.</li>`,
  );
  const rivals = puzzle.rivals.map(
    (r) =>
      `<li>Если бы лгал${she(r, '', 'а')} ${esc(suspects[r].name)}, ${she(r, 'его', 'её')} фразы наоборот вместе с остальными пришли бы к противоречию — за ${count(tryVersion(puzzle, r).steps, 'шаг', 'шага', 'шагов')}.</li>`,
  );
  const lies = statements[c].map((said) => `<li>${esc(suspects[c].name)} солгал${she(c, '', 'а')}: «${esc(bare(said))}». На самом деле: «${esc(bare(negate(said)))}».</li>`);
  return `<h3 class="sec">Разбор</h3><ol class="howto explain">${[...sets, ...rivals, ...lies].join('')}</ol>`;
}

function resultSheet(S) {
  const culprit = suspects[puzzle.culprit];
  const stamp = game.solved ? '<div class="stamp">Раскрыто</div>' : '<div class="stamp lost">Не раскрыто</div>';
  const field = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
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
    ${chronicle(puzzle, ctx.orderK)}
    ${explainHtml()}
    <dl class="fields">
      ${field('Отброшено версий', game.dropped)}
      ${field('Неверных обвинений', game.wrong)}
    </dl>
    <div class="actions">
      <button class="btn primary" data-act="random-case"${af(S)}>Новое дело</button>
      <a class="btn" href="./">Обычная игра</a>
    </div>
    <button class="link" data-act="close-sheet">Посмотреть доску</button>`;
}

const SHEETS = { brief, accuse: accuseSheet, giveup: giveupSheet, result: resultSheet };

/* ---------- 3D-кабинет (proto3d.html) ---------- */

// Кабинет — слой поверх игры, вне #app (morph его не трогает). mode: 'desk' — сидим за столом (3D),
// 'case' — над бумагами (2D). busy — идёт переход: листы не открываем, нажатие или клавиша — «пропустить».
// Нет WebGL или 3D не загрузилось — кабинет убираем, играем в 2D.
// stamping — рука ещё не поставила штамп: в 2D его пока не видно.
const desk = { on: with3d, mode: with3d ? 'desk' : 'case', busy: with3d, stamping: false, office: null, paint: null };
const FADE = 450; // как .office { transition } в proto.css
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, calm.matches ? 0 : ms));
const deskEl = with3d ? document.createElement('div') : null;
if (deskEl) {
  deskEl.className = 'office';
  deskEl.innerHTML = `
    <div class="office-stage"></div>
    <p class="office-loading">Дело открывается…</p>
    <button class="icon-btn office-back" type="button" aria-label="К делу: вернуться к бумагам" aria-pressed="true" hidden>${LAMP}</button>
    <p class="office-hint" hidden></p>`;
  document.body.append(deskEl);
  deskEl.addEventListener('click', (event) => {
    if (desk.busy) return desk.office?.hurry();
    if (event.target.closest('.office-back') || desk.office?.isPaper(event)) enterCase();
  });
  // за столом страница под кабинетом не прокручивается: иначе листы в 2D уедут от листов на столе
  for (const type of ['wheel', 'touchmove']) deskEl.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

function hud(idle, hint = '') {
  deskEl.querySelector('.office-back').hidden = !idle;
  const tip = deskEl.querySelector('.office-hint');
  tip.textContent = hint;
  tip.hidden = !hint;
}
// Кнопка «к делу» за столом — ровно там, где «за стол» в шапке: одна и та же кнопка туда и обратно.
function alignBack() {
  const back = deskEl.querySelector('.office-back');
  const twin = app.querySelector('[data-act="to-desk"]')?.getBoundingClientRect();
  if (twin?.width && twin.top >= 0) Object.assign(back.style, { left: `${twin.left}px`, top: `${twin.top}px`, right: 'auto' });
  else back.removeAttribute('style');
}

// Положить на 3D-стол те же листы, что сейчас на экране. На телефоне показаний на экране нет —
// на стол кладём их машинописную копию. Возвращает протокол (с меркой штампа).
async function layDesk({ skipStamp = false } = {}) {
  const { paintSheet } = desk.paint;
  const scale = Math.min(3, Math.max(1.5, devicePixelRatio));
  const skip = skipStamp ? '.paper-stamp' : null;
  const screen = { width: deskEl.clientWidth, height: deskEl.clientHeight };
  if (wide()) {
    const [protocol, statementsSheet] = await Promise.all([
      paintSheet(app.querySelector('.layout.wide .desk'), { scale, skip }),
      paintSheet(app.querySelector('.layout.wide .file'), { scale }),
    ]);
    desk.office.layout({ protocol, statements: statementsSheet }, screen);
    return protocol;
  }
  const protocol = await paintSheet(app.querySelector('.layout.phone .board-wrap'), { scale, skip });
  desk.office.layout({ protocol, statements: typedStatements(protocol.width) }, screen);
  return protocol;
}

function typedStatements(width) {
  const W = 1000;
  const H = 1414;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx2 = canvas.getContext('2d');
  desk.paint.paperFill(ctx2, W, H, '#e4e4dc', 7);
  ctx2.fillStyle = '#55578a';
  ctx2.font = '700 34px "PT Sans Narrow", sans-serif';
  ctx2.fillText('ПОКАЗАНИЯ', 70, 100);
  let y = 170;
  const wrap = (text, max) => {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx2.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    return line ? [...lines, line] : lines;
  };
  suspects.forEach((person, g) => {
    ctx2.fillStyle = '#25221e';
    ctx2.font = '700 30px "PT Serif", serif';
    ctx2.fillText(`${person.name}, ${person.role}`, 70, y);
    y += 42;
    ctx2.font = '400 27px "PT Serif", serif';
    ctx2.fillStyle = '#3a3631';
    for (const c of statements[g]) {
      for (const line of wrap(`— ${clueText(puzzle, c)}`, W - 170)) {
        ctx2.fillText(line, 96, y);
        y += 36;
      }
    }
    y += 24;
  });
  return { canvas, x: 0, y: 0, width, height: width * (H / W), angle: 0, onScreen: false };
}

// Открыли дело: кабинет, садимся за стол, наклоняемся к бумагам — и дальше 2D.
async function openOffice() {
  try {
    const [mod, paint] = await Promise.all([import('./office3d.js'), import('./paint.js')]);
    desk.paint = paint;
    desk.office = mod.createOffice(deskEl.querySelector('.office-stage'), { title, reducedMotion: calm.matches });
    await Promise.race([document.fonts.ready, wait(2500)]);
    await layDesk();
  } catch {
    desk.office?.destroy();
    desk.office = null;
    desk.on = false;
    desk.mode = 'case';
    desk.busy = false;
    deskEl.remove();
    render();
    return;
  }
  desk.office.place('stand');
  deskEl.classList.add('lit');
  hud(false, 'Нажми, чтобы пропустить');
  await desk.office.pause(700);
  await desk.office.sit(1900);
  await desk.office.pause(450);
  await enterCase();
}

// Из-за стола — к бумагам: камера опускается к листам, кабинет растворяется в 2D.
async function enterCase() {
  if (desk.mode !== 'desk' || !desk.office) return;
  desk.busy = true;
  hud(false);
  render();
  await layDesk(); // в 2D могло что-то поменяться — на столе те же листы, что на экране
  await desk.office.lean(1300);
  desk.mode = 'case';
  deskEl.classList.add('gone');
  render();
  await wait(FADE);
  desk.office.setActive(false);
  desk.office.hurry(false);
  desk.busy = false;
  render(); // теперь можно открыть лист (правила — в начале дела)
  if (lastInput === 'key') app.querySelector('[data-act="to-desk"]')?.focus();
}

// За стол: 2D растворяется в кабинете (вид сверху совпадает с экраном), камера поднимается — сидим.
async function enterDesk() {
  if (desk.mode !== 'case' || desk.busy || !desk.office) return;
  desk.busy = true;
  desk.mode = 'desk';
  alignBack();
  await layDesk();
  desk.office.place('top');
  desk.office.setActive(true);
  deskEl.classList.remove('gone');
  render();
  await wait(FADE);
  await desk.office.sit(1500);
  deskIdle();
}

function deskIdle() {
  desk.busy = false;
  desk.office.hurry(false);
  hud(true, 'Нажми на бумаги — к делу');
  render();
  if (lastInput === 'key' && !ui.sheet) deskEl.querySelector('.office-back').focus();
  if (!ui.sheet) announce('Кабинет. Кнопка с лампой или нажатие на бумаги — обратно к делу.');
}

// Дело закрыто: снова кабинет, рука ставит штамп на протокол, потом — итог прямо за столом.
async function stampCase(sound) {
  desk.busy = true;
  desk.stamping = true;
  ui.sheet = null;
  render(); // лист обвинения закрылся, на протоколе в 2D уже есть штамп — его на столе пока нет
  desk.mode = 'desk';
  alignBack();
  const protocol = await layDesk({ skipStamp: true });
  desk.office.place('top');
  desk.office.setActive(true);
  deskEl.classList.remove('gone');
  render();
  await wait(FADE);
  const mark = protocol.stamps[0];
  if (mark) await desk.office.stamp(mark, protocol, () => sfx(sound));
  else sfx(sound);
  desk.stamping = false;
  ui.sheet = 'result';
  deskIdle();
}

// Клавиши за столом: во время перехода — «пропустить», Esc — к делу; страница под кабинетом не листается.
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp']);
function deskKey(event) {
  if (desk.busy) {
    if (['Escape', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      desk.office?.hurry();
    }
    return;
  }
  if (ui.sheet) return; // итог открыт за столом — Esc и Tab забота браузера
  if (event.key === 'Escape') {
    event.preventDefault();
    enterCase();
  } else if (SCROLL_KEYS.has(event.key) && !event.target.closest?.('button')) event.preventDefault();
}

// Окно поменяло размер, пока сидим за столом, — листы на столе раскладываем заново, как на экране.
let relayTimer = 0;
addEventListener('resize', () => {
  clearTimeout(relayTimer);
  relayTimer = setTimeout(() => {
    if (desk.mode === 'desk' && !desk.busy && desk.office) layDesk().then(() => desk.office.place('seat'));
  }, 200);
});

/* ---------- отрисовка ---------- */

let lastSheet = null;
let lastInput = 'pointer'; // чем игрок действовал последним: 'key' или 'pointer'
addEventListener('keydown', () => (lastInput = 'key'), true);
addEventListener('pointerdown', () => (lastInput = 'pointer'), true);

function render() {
  const f = frame();
  // за столом игра под кабинетом недоступна — кроме листа итога, открытого прямо за столом
  app.inert = desk.mode === 'desk' && !(ui.sheet && !desk.busy);
  // лист закрываем до того, как morph уберёт его содержимое: браузер вернёт фокус туда, откуда лист открыли
  const dialog = app.querySelector('dialog.sheet');
  if (!ui.sheet && dialog?.open) dialog.close();
  const S = { prefilled: ui.prefilled, accuseError: ui.accuseError, keyFocus: lastInput === 'key' };
  morph(app, `${headerHtml()}${wide() ? wideHtml(f) : phoneHtml(f)}<div class="sheets">${sheetHtml(ui.sheet, S, SHEETS)}</div>`);
  syncSheet();
  watchDock();
}

// Как в main.js: открыть модальное окно или, если сменился лист, — наверх и фокус заново.
function syncSheet() {
  if (desk.busy) return; // идёт переход в кабинет или из него — лист откроем после
  const dialog = app.querySelector('dialog.sheet');
  const opened = Boolean(ui.sheet) && !dialog.open;
  if (opened) dialog.showModal();
  if (ui.sheet && (opened || ui.sheet !== lastSheet)) {
    const button = dialog.querySelector('[autofocus]:not([disabled])');
    if (!opened || !button) {
      dialog.scrollTop = 0;
      (button ?? dialog).focus();
    }
  }
  lastSheet = ui.sheet;
}

// Высота нижней панели — в CSS-переменные (отступ страницы, высота строк доски), как в main.js.
let dockSeen = null;
const dockObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => setDockHeight(entry.target)) : null;
function setDockHeight(el) {
  const full = Math.ceil(el.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--dock-h', `${full}px`);
  document.documentElement.style.setProperty('--dock-base', `${full}px`);
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

/* ---------- ходы ---------- */

const cellEl = (r, t) => app.querySelector(`.cell[data-r="${r}"][data-t="${t}"]`);

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
  const res = tap(game, r, t, { want });
  if (!res) return render();
  if (res.blocked || res.mark === AUTO_CHECK) {
    if (res.blocked) sfx('blocked');
    render();
    replay(cellEl(...(res.blocked ?? [r, t])), 'flash');
    return;
  }
  sfx(res.mark === CROSS ? 'cross' : res.mark === CHECK ? 'check' : 'clear');
  save();
  render();
}

// «Лжёт?»: начать версию; у того, кого уже проверяем, — ничего; у признанного лжеца — снять отметку.
function suspect(g) {
  if (isOver(game)) return;
  if (game.draft?.liar === g) return;
  if (game.draft) dropVersion(); // начинаем другую — прежнюю отбрасываем
  if (game.liar === g) {
    game.liar = null;
  } else {
    game.draft = { liar: g, base: game.marks.map((row) => [...row]) };
    game.started = true;
    announce(`Версия: лжёт ${suspects[g].name}. ${statements[g].map((c) => clueText(puzzle, negate(c))).join(' ')}`);
  }
  ui.active = null;
  sfx('select');
  save();
  render();
}

function dropVersion() {
  if (!game.draft) return;
  checkpoint(game); // отказ тоже можно отменить
  game.marks.forEach((row, r) => row.forEach((_, t) => (row[t] = game.draft.base[r][t])));
  game.draft = null;
  game.dropped++;
}

function keepVersion() {
  if (!game.draft) return;
  game.liar = game.draft.liar;
  game.draft = null;
}

function openSheet(name) {
  ui.sheet = name;
  if (name !== 'result') sfx('open');
  render();
}

function closeSheet() {
  if (!ui.sheet) return;
  if (ui.sheet === 'brief' && !game.started) {
    game.started = true;
    save();
  }
  ui.sheet = null;
  render();
}

// Обвинение: если кто-то под подозрением — заполним по доске всё, что о нём известно.
function openAccuse() {
  const g = suspected();
  const draft = { g: ui.draft.g, values: { ...ui.draft.values } };
  let filled = false;
  if (g !== null) {
    const pos = posFromMarks(game, n);
    draft.g = g;
    filled = true;
    const slot = onlyValue(pos[g]);
    if (slot >= 0) {
      draft.values[ctx.orderK] = slot;
      ctx.groups.forEach((group, gi) => {
        if (group.k < 0) return;
        const v = settled(ctx, pos, gi, slot);
        if (v >= 0) draft.values[group.k] = v;
      });
    }
  }
  ui.draft = draft;
  ui.prefilled = filled;
  ui.accuseError = '';
  openSheet('accuse');
}

function finish(sound) {
  ui.active = null;
  game.draft = null;
  save();
  // в 3D — сперва штамп на протокол, потом итог
  if (desk.office && desk.mode === 'case' && !desk.busy) return stampCase(sound);
  ui.sheet = 'result';
  render();
  setTimeout(() => sfx(sound), 250);
}

const actions = {
  cell: (el) => tapCell(+el.dataset.r, +el.dataset.t),
  pick(el) {
    const i = +el.dataset.i;
    ui.active = ui.active === i ? null : i;
    if (ui.active !== null) sfx('select');
    render();
  },
  suspect: (el) => suspect(+el.dataset.g),
  'version-drop'() {
    const name = suspects[game.draft.liar].name;
    dropVersion();
    sfx('clear');
    save();
    render();
    announce(`Версия «лжёт ${name}» отброшена, отметки карандашом стёрты.`);
  },
  'version-keep'() {
    keepVersion();
    sfx('lock');
    save();
    render();
  },
  undo() {
    if (!undo(game)) return;
    sfx('clear');
    save();
    render();
  },
  redo() {
    if (!redo(game)) return;
    sfx('clear');
    save();
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
    if (accuseRight(puzzle, ui.draft.g, ui.draft.values)) {
      game.solved = true;
      return finish('solved');
    }
    game.wrong++;
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
  'show-result': () => openSheet('result'),
  'random-case'() {
    location.href = `?case=${randomKey()}`;
  },
  brief: () => openSheet('brief'),
  start: closeSheet,
  'close-sheet'() {
    closeSheet();
    // итог открыт за столом: «Посмотреть доску» — наклониться к бумагам
    if (desk.mode === 'desk') enterCase();
  },
  'to-desk': () => enterDesk(),
};

/* ---------- касания, мышь, клавиатура ---------- */

// Долгое нажатие на клетку — сразу ✓; после него обычный click не должен сработать.
let press = null;
let suppressClick = false;
let lastPointer = 'mouse';
app.addEventListener('pointerdown', (event) => {
  lastPointer = event.pointerType;
  suppressClick = false;
  const cell = event.target.closest('.cell[data-act]');
  if (!cell || event.pointerType === 'mouse') return;
  press = {
    x: event.clientX,
    y: event.clientY,
    timer: setTimeout(() => {
      suppressClick = true;
      press = null;
      navigator.vibrate?.(12);
      tapCell(+cell.dataset.r, +cell.dataset.t, CHECK);
    }, 450),
  };
});
app.addEventListener('pointermove', (event) => {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
    clearTimeout(press.timer);
    press = null;
  }
});
const endPress = () => {
  if (press) clearTimeout(press.timer);
  press = null;
};
app.addEventListener('pointerup', endPress);
app.addEventListener('pointercancel', endPress);
app.addEventListener('contextmenu', (event) => {
  const cell = event.target.closest('.cell[data-act]');
  if (!cell) return;
  event.preventDefault();
  if (lastPointer === 'mouse') tapCell(+cell.dataset.r, +cell.dataset.t, CHECK);
});

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.dataset.act === 'cell' && suppressClick) {
    suppressClick = false;
    return;
  }
  actions[el.dataset.act]?.(el, event);
});

// Лист закрывают Esc, жест «назад» и касание мимо (closedby="any") — через closeSheet, как в main.js.
const isSheet = (el) => el instanceof HTMLDialogElement && el.classList.contains('sheet');
app.addEventListener(
  'cancel',
  (event) => {
    if (!isSheet(event.target)) return;
    event.preventDefault();
    closeSheet();
  },
  true,
);
app.addEventListener(
  'close',
  (event) => {
    if (isSheet(event.target) && !event.target.open && ui.sheet) closeSheet();
  },
  true,
);
// Safari пока не знает closedby: касание мимо листа ловим сами.
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (event) => {
    const r = event.target.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  let pressedOutside = false;
  app.addEventListener('pointerdown', (event) => {
    pressedOutside = isSheet(event.target) && outside(event);
  });
  app.addEventListener('pointerup', (event) => {
    if (pressedOutside && isSheet(event.target) && outside(event)) closeSheet();
    pressedOutside = false;
  });
}

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
document.addEventListener('keydown', (event) => {
  if (desk.mode === 'desk' || desk.busy) {
    deskKey(event);
    return;
  }
  if (ui.sheet) return; // в листе Esc и Tab — забота браузера
  if (event.key === 'Escape' && ui.active !== null) {
    ui.active = null;
    render();
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.code === 'KeyZ') {
    event.preventDefault();
    actions[event.shiftKey ? 'redo' : 'undo']();
    return;
  }
  const cell = event.target.matches?.('.cell[data-act]') ? event.target : null;
  if (!cell) return;
  if (ARROWS[event.key] && !mod && !event.altKey && !event.shiftKey) {
    const [dr, dt] = ARROWS[event.key];
    const r = +cell.dataset.r + dr;
    const t = +cell.dataset.t + dt;
    if (r < 0 || r >= ctx.rows || t < 0 || t >= n) return; // край доски — пусть страница прокрутится
    event.preventDefault();
    ui.focus = [r, t];
    render();
    cellEl(r, t)?.focus({ preventScroll: true });
    cellEl(r, t)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault();
    tapCell(+cell.dataset.r, +cell.dataset.t, CHECK);
  }
});
app.addEventListener('focusin', (event) => {
  const cell = event.target.closest?.('.cell[data-act]');
  if (cell) ui.focus = [+cell.dataset.r, +cell.dataset.t];
});

document.addEventListener('visibilitychange', save);
wideQuery.addEventListener('change', () => render());

// Первая отрисовка — без анимаций.
document.documentElement.classList.add('boot');
render();
if (desk.on) openOffice();
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('boot')));
