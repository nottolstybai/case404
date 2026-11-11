// Улики: главная (закреплена, её нельзя вычеркнуть) и остальные — по одной или списком.

import { clueParts, clueText, mainClueParts, mainClueText } from './text.js';
import { ICONS, esc, partsHtml } from './ui-util.js';

const num = (i) => String(i + 1);

// Главная улика. compact — строка над уликами в нижней панели телефона.
export function mainClueHtml(f, compact = false) {
  const on = f.active === -1;
  return `<button class="mainclue${compact ? ' compact' : ''}${on ? ' act' : ''}" data-act="pick" data-i="-1" aria-pressed="${on}" aria-label="Главная улика: подсветить примету преступника на доске">
    <span class="tag">${compact ? 'Главная' : 'Главная улика'}</span><span class="txt">${partsHtml(mainClueParts(f.puzzle))}</span>
  </button>`;
}

function classes(c, base = 'clue') {
  return [base, c.state === 'done' && 'done', c.used && 'used', c.state === 'conflict' && 'conflict', c.active && 'act', c.hinted && 'hinted']
    .filter(Boolean)
    .join(' ');
}

const badge = (c) => (c.state === 'conflict' ? '<span class="badge">не сходится с отметками</span>' : '');

function useButton(c, withText = false) {
  const on = c.used || c.state === 'done';
  const label = c.used ? `Улика №${c.i + 1}: снять пометку «отработана»` : `Улика №${c.i + 1}: отметить как отработанную`;
  return `<button class="use${c.used ? ' on' : ''}${c.state === 'done' && !c.used ? ' auto' : ''}" data-act="use" data-i="${c.i}" aria-pressed="${c.used}" aria-label="${label}">
    <span class="box">${on ? ICONS.tick : ''}</span>${withText ? `<span class="use-t">${c.used ? 'Отработана' : c.state === 'done' ? 'Сошлась' : 'Отработать'}</span>` : ''}
  </button>`;
}

function clueItem(f, c) {
  const text = partsHtml(clueParts(f.puzzle, f.puzzle.clues[c.i]));
  return `<li class="${classes(c)}" data-key="c${c.i}">
    ${useButton(c)}
    <button class="cbody" data-act="pick" data-i="${c.i}" aria-pressed="${c.active}"><span class="num">${num(c.i)}</span><span class="body"><span class="txt">${text}</span>${badge(c)}</span></button>
  </li>`;
}

export const clueListHtml = (f) => `<ol class="cl-list">${f.clues.map((c) => clueItem(f, c)).join('')}</ol>`;

// Короткая главная улика для нижней панели телефона: «Преступник был на скалах».
// Полная фраза — во вступлении и на компьютере.
function shortMainParts(puzzle) {
  const { k, v } = puzzle.culpritClue;
  const cat = puzzle.categories[k];
  const value = cat.values[v];
  const ent = (text) => ({ kind: cat.key, id: v, text });
  if (cat.key === 'time') return ['Преступник пришёл в ', ent(value.name)];
  if (cat.key === 'place') return ['Преступник был ', ent(value.loc)];
  return ['У преступника нашли ', ent(value.acc)];
}

// Полоса над уликой: главная улика коротко, счётчик и переключатель «по одной / списком».
function stripHtml(f) {
  const on = f.active === -1;
  const list = f.clueMode === 'list';
  const where = list ? `${f.clues.length}` : `${f.clues[f.cursor].i + 1}/${f.clues.length}`;
  return `<div class="strip">
    <button class="mainclue short${on ? ' act' : ''}" data-act="pick" data-i="-1" aria-pressed="${on}" aria-label="Главная улика: ${esc(mainClueText(f.puzzle))} Подсветить примету преступника на доске">
      <span class="txt">${partsHtml(shortMainParts(f.puzzle))}</span>
    </button>
    <span class="count" aria-label="${list ? `Улик ${f.clues.length}` : `Улика ${where}`}, осталось ${f.remaining}"><b>${where}</b><span>ост. ${f.remaining}</span></span>
    <button class="mode-btn icon" data-act="clue-mode" aria-label="${list ? 'Показывать улики по одной' : 'Показать все улики списком'}">${list ? ICONS.one : ICONS.list}</button>
  </div>`;
}

// Подсказка на месте улики: та же площадь, панель не растёт.
function hintInPlace(h) {
  const more = h.stage === 1 ? '<button class="hint-more" data-act="hint">Подробнее</button>' : '';
  return `<div class="hint-slot hint-${h.kind}" role="status" data-key="hint">
    <p><span class="hint-tag">Подсказка</span>${esc(h.text)}</p>
    <div class="hint-btns">${more}<button class="hint-x" data-act="close-hint" aria-label="Закрыть подсказку">✕</button></div>
  </div>`;
}

// Нижняя панель телефона: улики по одной или списком.
export function cluePanelHtml(f) {
  if (f.clueMode === 'list') {
    return `<div class="clues mode-list">
      ${stripHtml(f)}
      ${f.hint ? hintInPlace(f.hint) : ''}
      ${clueListHtml(f)}
    </div>`;
  }
  const c = f.clues[f.cursor];
  const clue = f.puzzle.clues[c.i];
  const long = clueText(f.puzzle, clue).length > 84 ? ' long' : '';
  const row = f.hint
    ? hintInPlace(f.hint)
    : `<div class="one" data-swipe data-key="one">
      <button class="nav" data-act="step" data-dir="-1" aria-label="Предыдущая улика">${ICONS.prev}</button>
      ${useButton(c)}
      <button class="${classes(c, 'one-body')}${long}${f.stepDir ? ` in-${f.stepDir > 0 ? 'r' : 'l'}` : ''}" data-act="pick" data-i="${c.i}" aria-pressed="${c.active}" aria-live="polite" data-key="one${c.i}">
        <span class="num">№${c.i + 1}</span><span class="txt">${partsHtml(clueParts(f.puzzle, clue))}</span>${badge(c)}
      </button>
      <button class="nav" data-act="step" data-dir="1" aria-label="Следующая улика">${ICONS.next}</button>
    </div>`;
  return `<div class="clues mode-one">
    ${stripHtml(f)}
    <div class="one-slot">${row}</div>
  </div>`;
}

// Подсказка: текст, «Подробнее» на первом шаге и крестик.
export function hintHtml(f) {
  const h = f.hint;
  if (!h) return '';
  const more = h.stage === 1 ? '<button class="hint-more" data-act="hint">Подробнее</button>' : '';
  return `<div class="hintbar hint-${h.kind}" role="status" data-key="hint">
    <span class="hint-tag">Подсказка</span>
    <p>${esc(h.text)}</p>
    ${more}
    <button class="hint-x" data-act="close-hint" aria-label="Закрыть подсказку">${'✕'}</button>
  </div>`;
}
