// Мелочи для экрана: хранилище, экранирование, значки, текст улик с подсветкой слов.

export const storage = {
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
  remove(name) {
    try {
      localStorage.removeItem(name);
    } catch {
      // нет доступа к хранилищу — не беда
    }
  },
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

// Текст из частей (clueParts, mainClueParts): имена, места, вещи и время — разным цветом,
// тем же, что у групп строк на доске.
export const partsHtml = (parts) =>
  parts.map((p) => (typeof p === 'string' ? esc(p) : `<span class="ent ent-${p.kind}">${esc(p.text)}</span>`)).join('');

const svg = (body, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  prev: svg('<path d="m14.5 6-6 6 6 6"/>'),
  next: svg('<path d="m9.5 6 6 6-6 6"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.6"/>'),
  one: svg('<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7.5 10h9M7.5 14h6"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  note: svg('<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>'),
  noteOff: svg('<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/><path d="M3.5 3.5l17 17" stroke="var(--stamp)" stroke-width="2.2"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  tick: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
};

// Нарисованный от руки ✗: три варианта штрихов, чтобы доска не выглядела штампованной.
const CROSSES = [
  ['M6.4 6.6 Q12.2 11.6 17.8 17.6', 'M17.4 6.2 Q11.6 12.4 6.2 17.9'],
  ['M6 7.2 Q11.6 12.1 17.4 17.1', 'M17.9 6.8 Q12.4 11.4 6.8 17.4'],
  ['M6.8 6.1 Q11.9 12.6 17.1 17.9', 'M16.9 6.6 Q12.1 11.9 6.1 17.2'],
];

export function markSvg(variant) {
  const [a, b] = CROSSES[variant % CROSSES.length];
  return (
    `<svg class="x" viewBox="0 0 24 24" aria-hidden="true"><path d="${a}"/><path d="${b}"/></svg>` +
    '<svg class="v" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 12.8 9.8 17.2 18.8 6.8"/></svg>'
  );
}
