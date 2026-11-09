// Доска «Хроника ночи»: колонки — время прихода, строки — люди, места и вещи.
// Только разметка: что рисовать, решает main.js (кадр f), здесь — как.

import { AUTO_CHECK, AUTO_CROSS, CHECK, CROSS } from './game.js';
import { GROUP_TITLES, rowInfo } from './text.js';
import { portrait } from './art.js';
import { cap, esc, markSvg } from './ui-util.js';

const MARK_CLASS = { [CROSS]: 'm-x', [CHECK]: 'm-v', [AUTO_CROSS]: 'm-ax', [AUTO_CHECK]: 'm-av' };
const MARK_WORD = {
  [CROSS]: 'вычеркнуто',
  [CHECK]: 'отмечено',
  [AUTO_CROSS]: 'вычеркнуто автоматически',
  [AUTO_CHECK]: 'отмечено автоматически',
};

// Маленький портрет: data-key меняется вместе с человеком — узел заменяется целиком,
// а неизменный morph пропускает (data-static), не сверяя SVG.
const mini = (role, cls = 'mini') => `<span class="${cls}" data-key="${esc(role)}" data-static="${esc(role)}">${portrait(role)}</span>`;

// Заголовок колонки: над временем — портрет того, кто пришёл (когда известен), иначе номер прихода;
// у колонки преступника — метка «преступник». Верхняя строка фиксированной высоты: ничего не прыгает.
function slotHead(f, t) {
  const { puzzle, ctx } = f;
  const time = puzzle.categories[ctx.orderK].values[t].name;
  const g = f.whoAt[t];
  const culprit = f.culprit.slot === t;
  const cls = ['slot-h', culprit && 'cul', f.hl.slots.has(t) && 'hl', f.locked.has(t) && 'lk'].filter(Boolean).join(' ');
  let top;
  if (culprit) top = '<span class="ctag" data-key="ctag">преступник</span>';
  else if (g >= 0) top = mini(puzzle.suspects[g].role);
  else top = `<span class="ord" data-key="ord">${t + 1}</span>`;
  const label = `${t + 1}-й пришедший, ${time}${g >= 0 ? `, ${puzzle.suspects[g].name}` : ''}${culprit ? ', колонка преступника' : ''}`;
  return `<div class="${cls}" role="columnheader" aria-label="${esc(label)}"><span class="sh-top">${top}</span><span class="time">${time}</span></div>`;
}

function cell(f, r, t, name, time) {
  const m = f.d[r][t];
  const target = f.targets.get(`${r}:${t}`);
  const cls = [
    'cell',
    MARK_CLASS[m],
    f.hl.slots.has(t) && 'chl',
    f.culprit.slot === t && 'cul',
    f.locked.has(t) && 'lk',
    target && `tgt tgt-${target}`,
  ]
    .filter(Boolean)
    .join(' ');
  const focus = f.focus[0] === r && f.focus[1] === t;
  const word = MARK_WORD[m] ?? 'пусто';
  return `<button class="${cls}" role="gridcell" data-act="cell" data-r="${r}" data-t="${t}" style="--i:${r}" tabindex="${focus ? 0 : -1}" aria-label="${esc(`${name}, ${time} — ${word}`)}"${f.over ? ' aria-disabled="true"' : ''}>${markSvg(r * 3 + t * 2)}</button>`;
}

function row(f, r) {
  const { puzzle, ctx } = f;
  const info = rowInfo(puzzle, r);
  const name = cap(info.name);
  const attr = f.culprit.attrRow === r;
  const cls = ['brow', `g-${info.kind}`, f.hl.rows.has(r) && 'hl', attr && 'cattr', f.solvedRows.has(r) && 'ok'].filter(Boolean).join(' ');
  const pic = info.kind === 'who' ? mini(puzzle.suspects[info.v].role, 'mini face') : '';
  const times = puzzle.categories[ctx.orderK].values;
  const cells = times.map((v, t) => cell(f, r, t, name, v.name)).join('');
  const title = attr ? ' title="Примета преступника из главной улики"' : '';
  return `<div class="${cls}" role="row"><div class="label" role="rowheader"${title}>${pic}<span class="nm">${esc(name)}</span>${attr ? '<span class="cdot" aria-label="примета преступника"></span>' : ''}</div>${cells}</div>`;
}

export function boardHtml(f) {
  const { ctx } = f;
  const heads = Array.from({ length: ctx.n }, (_, t) => slotHead(f, t)).join('');
  const groups = ctx.groups
    .map((group, g) => {
      const rows = Array.from({ length: ctx.n }, (_, v) => row(f, g * ctx.n + v)).join('');
      const done = f.groupDone[g];
      return `<div class="gtitle g-${group.key}" role="row"><span role="rowheader">${GROUP_TITLES[group.key]}</span><span class="gcount">${done}/${ctx.n}</span></div>${rows}`;
    })
    .join('');
  const pct = Math.round(f.progress * 100);
  return `
    <div class="board${f.over ? ' over' : ''}" role="grid" aria-label="Хроника ночи: строки — люди, места и вещи, колонки — время прихода" aria-rowcount="${ctx.rows + 1}">
      <div class="bhead" role="row">
        <div class="corner" role="columnheader"><span class="corner-t">Хроника<br>ночи</span><span class="pct" aria-label="Решено ${pct}%">${pct}%</span></div>
        ${heads}
        <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>
      ${groups}
    </div>`;
}
