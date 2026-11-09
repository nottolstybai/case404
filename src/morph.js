// Обновление DOM на месте вместо innerHTML: узлы, которые не изменились, остаются
// теми же — не теряются фокус, прокрутка списков, и CSS-переходы успевают сработать.

const ELEMENT = 1;
const key = (node) => (node.nodeType === ELEMENT ? node.getAttribute('data-key') : null);

// Можно ли обновить старый узел, а не заменять его новым.
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === key(b);

function syncAttributes(el, next) {
  for (const { name } of [...el.attributes]) {
    if (!next.hasAttribute(name)) el.removeAttribute(name);
  }
  for (const { name, value } of next.attributes) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  // атрибуты не трогают поле, которое пользователь уже менял: свойства ставим сами
  if (el.nodeName === 'INPUT') {
    el.checked = next.hasAttribute('checked');
    if (next.hasAttribute('value') && el.value !== next.getAttribute('value')) el.value = next.getAttribute('value');
  }
}

function syncNode(node, next) {
  if (node.nodeType !== ELEMENT) {
    if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    return;
  }
  // большие неизменные блоки (картинки SVG) не сверяем вовсе
  const fixed = node.getAttribute('data-static');
  if (fixed !== null && fixed === next.getAttribute('data-static')) return;
  syncAttributes(node, next);
  syncChildren(node, next);
}

// Дети сверяются по порядку: i-й старый с i-м новым.
function syncChildren(parent, next) {
  const olds = [...parent.childNodes];
  const news = [...next.childNodes];
  news.forEach((n, i) => {
    const old = olds[i];
    if (!old) parent.appendChild(n);
    else if (!same(old, n)) parent.replaceChild(n, old);
    else syncNode(old, n);
  });
  for (const old of olds.slice(news.length)) old.remove();
}

// Привести содержимое root к разметке html, меняя только то, что отличается.
export function morph(root, html) {
  const template = root.ownerDocument.createElement('template');
  template.innerHTML = html;
  syncChildren(root, template.content);
}
