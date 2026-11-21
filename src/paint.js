// Лист 2D-игры → холст для 3D-кабинета (office3d.js).
// Бумаги на 3D-столе — это те же листы, что на экране: при переходе «наклонился над делом» картинки совпадают
// до линии. Здесь не общий «скриншот страницы», а то, что бывает на наших листах: фон и рамки блоков,
// текст (по словам — ровно там, где их поставил браузер), svg-картинки, клетки доски (✗, ✓, штриховка) и штамп.

const NOISE = (() => {
  let tile = null;
  return () => {
    if (tile) return tile;
    tile = document.createElement('canvas');
    tile.width = tile.height = 192;
    const ctx = tile.getContext('2d');
    const img = ctx.createImageData(192, 192);
    let s = 12345;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 16807) % 2147483647;
      const v = s / 2147483647;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v < 0.5 ? 60 : 255;
      img.data[i + 3] = Math.abs(v - 0.5) * 34;
    }
    ctx.putImageData(img, 0, 0);
    return tile;
  };
})();

// Бумага: цвет, волокна и крупные пятна — как var(--grain), var(--mottle) в CSS.
export function paperFill(ctx, w, h, color, seed = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (0.25 + rnd() * 0.45) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    g.addColorStop(0, dark ? 'rgba(92,84,60,0.06)' : 'rgba(255,255,250,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = ctx.createPattern(NOISE(), 'repeat');
  ctx.fillRect(0, 0, w, h);
}

// Оттиск штампа — как .paper-stamp в CSS: двойная рамка, буквы вразрядку, краска легла неровно.
// Размеры — в пикселях листа; ctx может быть уже растянут (scale) под разрешение текстуры.
export function drawStamp(ctx, { text, color, cx, cy, w, h, angle = 0, font, border = 5, spacing = 'normal', alpha = 0.82 }) {
  // рисуем на отдельном холсте (выщербины не должны продырявить бумагу), потом кладём «умножением» — как краска
  const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
  const pad = 4;
  const ink = document.createElement('canvas');
  ink.width = Math.ceil((w + pad * 2) * k);
  ink.height = Math.ceil((h + pad * 2) * k);
  const c = ink.getContext('2d');
  c.scale(k, k);
  c.translate(pad, pad);
  c.strokeStyle = color;
  c.fillStyle = color;
  const line = border / 3; // двойная рамка: две линии по трети толщины
  c.lineWidth = line;
  c.strokeRect(line / 2, line / 2, w - line, h - line);
  c.strokeRect(border - line / 2, border - line / 2, w - 2 * border + line, h - 2 * border + line);
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if ('letterSpacing' in c && spacing !== 'normal') c.letterSpacing = spacing;
  // при разрядке последняя буква тоже получает отступ справа — сдвигаем на половину, как в CSS
  const shift = spacing !== 'normal' ? parseFloat(spacing) / 2 : 0;
  c.fillText(text, w / 2 + shift, h / 2 + h * 0.04);
  c.globalCompositeOperation = 'destination-out';
  c.globalAlpha = 0.6;
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dot = Math.max(0.8, h * 0.014);
  for (let i = 0; i < 520; i++) c.fillRect(rnd() * w, rnd() * h, dot, dot);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(ink, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  ctx.restore();
}

const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity'];
const transparent = (color) => !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);

// Штрих карандашом по клетке: ✓ игрока — синяя штриховка, колонка преступника — красная.
function hatch(ctx, x, y, w, h, color, step, width, angle) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const k = Math.tan(angle);
  ctx.beginPath();
  for (let i = -h * Math.abs(k) - step; i < w + h * Math.abs(k) + step; i += step) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h * k, y);
  }
  ctx.stroke();
  ctx.restore();
}

function cellMarks(ctx, el, r) {
  const { x, y, width: w, height: h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const icon = Math.min(20, h - 6);
  const cross = (size, color, lw) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.3, cy - size * 0.3);
    ctx.lineTo(cx + size * 0.3, cy + size * 0.3);
    ctx.moveTo(cx + size * 0.3, cy - size * 0.3);
    ctx.lineTo(cx - size * 0.3, cy + size * 0.3);
    ctx.stroke();
  };
  const tick = (size, color, lw) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.28, cy + size * 0.03);
    ctx.lineTo(cx - size * 0.09, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.28, cy - size * 0.22);
    ctx.stroke();
  };
  const cls = el.classList;
  if (cls.contains('m-v')) {
    hatch(ctx, x, y, w, h, 'rgba(44,90,160,0.55)', 4.5, 2, -0.6);
    ctx.strokeStyle = '#1f4682';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    tick(icon, '#142f5c', 3.2);
  } else if (cls.contains('m-av')) {
    ctx.strokeStyle = 'rgba(44,90,160,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    tick(icon * 0.8, '#2c5aa0', 2.4);
  } else if (cls.contains('m-x')) cross(icon, '#55544f', 2.4);
  else if (cls.contains('m-ax')) cross(icon * 0.55, 'rgba(143,141,133,0.85)', 2.2);
}

// Нарисовать лист root на холсте. skip — селектор того, что не рисовать (например, штамп до удара).
// Возвращает холст и где лист на экране без наклона: { canvas, x, y, width, height, angle, scale }.
export async function paintSheet(root, { scale = 2, skip = null, maxSize = 4096 } = {}) {
  const matrix = new DOMMatrix(getComputedStyle(root).transform === 'none' ? undefined : getComputedStyle(root).transform);
  const angle = Math.atan2(matrix.b, matrix.a);
  // меряем без наклона: наклон даст сама бумага в 3D
  const savedTransform = root.style.transform;
  root.style.transform = 'none';
  const ops = [];
  const stamps = [];
  let box;
  try {
    box = root.getBoundingClientRect();
    const rel = (r) => ({ x: r.x - box.x, y: r.y - box.y, width: r.width, height: r.height });
    const alpha = new Map([[root.parentElement, 1]]);
    const clipOf = new Map([[root.parentElement, null]]);
    const alphaOf = (el) => {
      if (!alpha.has(el)) alpha.set(el, parseFloat(getComputedStyle(el).opacity) * alphaOf(el.parentElement));
      return alpha.get(el);
    };
    const clipFor = (el) => {
      if (!clipOf.has(el)) {
        const cs = getComputedStyle(el);
        const own = cs.overflowX !== 'visible' && el !== root ? rel(el.getBoundingClientRect()) : null;
        clipOf.set(el, own ?? clipFor(el.parentElement));
      }
      return clipOf.get(el);
    };
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        // штамп рисуем поверх всего, отдельно; невидимое — пропускаем целиком
        if (node.matches('.paper-stamp, .visually-hidden') || (skip && node.matches(skip))) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden' || alphaOf(node) < 0.02) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        const cs = getComputedStyle(parent);
        const a = alphaOf(parent);
        if (a < 0.02 || cs.visibility === 'hidden') continue;
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const upper = cs.textTransform === 'uppercase';
        const strike = cs.textDecorationLine.includes('line-through');
        for (const m of node.data.matchAll(/\S+/g)) {
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const r = range.getClientRects()[0];
          if (!r || !r.width) continue;
          ops.push({
            kind: 'text',
            text: upper ? m[0].toUpperCase() : m[0],
            font,
            color: cs.color,
            spacing: cs.letterSpacing,
            alpha: a,
            r: rel(r),
            clip: clipFor(parent),
            strike: strike ? cs.textDecorationColor : null,
          });
        }
        continue;
      }
      const el = node;
      const cs = getComputedStyle(el);
      const a = alphaOf(el);
      const r = rel(el.getBoundingClientRect());
      if (el !== root && !transparent(cs.backgroundColor)) {
        ops.push({ kind: 'fill', r, color: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) || 0, alpha: a });
      }
      if (el.matches('.slot-h.cul, .cell.cul')) ops.push({ kind: 'hatch', r, color: el.matches('.slot-h') ? 'rgba(192,57,43,0.3)' : 'rgba(192,57,43,0.12)', alpha: a });
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
        width: parseFloat(cs[`border${side}Width`]) || 0,
        color: cs[`border${side}Color`],
        style: cs[`border${side}Style`],
      }));
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const same = sides.every((s) => s.width === sides[0].width && s.color === sides[0].color && s.style === sides[0].style);
      if (same && sides[0].width && sides[0].style !== 'none' && !transparent(sides[0].color)) {
        ops.push({ kind: 'frame', r, width: sides[0].width, color: sides[0].color, radius, alpha: a });
      } else {
        sides.forEach((s, i) => {
          if (s.width && s.style !== 'none' && !transparent(s.color)) ops.push({ kind: 'side', r, side: i, width: s.width, color: s.color, alpha: a });
        });
      }
      if (el.matches('.cell')) {
        ops.push({ kind: 'cell', el, r, alpha: a });
        // свои значки клетки рисуем сами
        continue;
      }
      if (el instanceof SVGSVGElement && r.width && r.height && !el.closest('.cell')) {
        const clone = el.cloneNode(true);
        const src = [el, ...el.querySelectorAll('*')];
        const dst = [clone, ...clone.querySelectorAll('*')];
        src.forEach((s, i) => {
          const scs = getComputedStyle(s);
          const style = SVG_PROPS.map((p) => `${p}:${scs.getPropertyValue(p)}`).join(';');
          dst[i].setAttribute('style', `${style};color:${scs.color}`);
        });
        clone.setAttribute('width', r.width);
        clone.setAttribute('height', r.height);
        ops.push({ kind: 'svg', r, alpha: a, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}` });
      }
    }
    // штампы меряем всегда (для удара в 3D), рисуем — если не просили пропустить
    for (const el of root.querySelectorAll('.paper-stamp')) {
      const mark = stampOf(el, box);
      stamps.push(mark);
      if (!skip || !el.matches(skip)) ops.push({ kind: 'stamp', ...mark });
    }
  } finally {
    root.style.transform = savedTransform;
  }

  // svg-картинки грузим все сразу
  await Promise.all(
    ops
      .filter((op) => op.kind === 'svg')
      .map(async (op) => {
        const img = new Image();
        img.src = op.src;
        try {
          await img.decode();
          op.img = img;
        } catch {
          // не вышло — без картинки
        }
      }),
  );

  const k = Math.min(scale, maxSize / Math.max(box.width, box.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.width * k));
  canvas.height = Math.max(1, Math.round(box.height * k));
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  // у листа нет своего фона (телефон: бумага — вся страница) — берём цвет бумаги из CSS
  const own = getComputedStyle(root).backgroundColor;
  const paper = transparent(own) ? getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#e3e4dc' : own;
  paperFill(ctx, box.width, box.height, paper, Math.round(box.width));
  for (const op of ops) {
    ctx.save();
    ctx.globalAlpha = op.alpha ?? 1;
    const { r } = op;
    if (op.kind === 'fill') {
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.width, r.height, op.radius);
      ctx.fill();
    } else if (op.kind === 'hatch') hatch(ctx, r.x, r.y, r.width, r.height, op.color, 4.5, 1.5, -0.52);
    else if (op.kind === 'frame') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.beginPath();
      ctx.roundRect(r.x + op.width / 2, r.y + op.width / 2, r.width - op.width, r.height - op.width, op.radius);
      ctx.stroke();
    } else if (op.kind === 'side') {
      ctx.fillStyle = op.color;
      const wd = op.width;
      if (op.side === 0) ctx.fillRect(r.x, r.y, r.width, wd);
      if (op.side === 1) ctx.fillRect(r.x + r.width - wd, r.y, wd, r.height);
      if (op.side === 2) ctx.fillRect(r.x, r.y + r.height - wd, r.width, wd);
      if (op.side === 3) ctx.fillRect(r.x, r.y, wd, r.height);
    } else if (op.kind === 'cell') cellMarks(ctx, op.el, r);
    else if (op.kind === 'svg' && op.img) ctx.drawImage(op.img, r.x, r.y, r.width, r.height);
    else if (op.kind === 'stamp') drawStamp(ctx, op);
    else if (op.kind === 'text') {
      if (op.clip) {
        ctx.beginPath();
        ctx.rect(op.clip.x, op.clip.y, op.clip.width, op.clip.height);
        ctx.clip();
      }
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      if ('letterSpacing' in ctx && op.spacing !== 'normal') ctx.letterSpacing = op.spacing;
      const m = ctx.measureText(op.text);
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      const base = asc ? r.y + (r.height - asc - desc) / 2 + asc : r.y + r.height * 0.78;
      ctx.fillText(op.text, r.x, base);
      if (op.strike) {
        ctx.fillStyle = op.strike;
        ctx.fillRect(r.x, r.y + r.height * 0.55, r.width, Math.max(1, r.height * 0.06));
      }
    }
    ctx.restore();
  }
  return { canvas, x: box.x, y: box.y, width: box.width, height: box.height, angle, scale: k, stamps };
}

// Штамп на листе: где он (центр, размер — в пикселях листа), чем и под каким углом — для оттиска в 3D.
export function stampOf(el, sheetBox) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
  const rot = cs.rotate && cs.rotate !== 'none' ? (parseFloat(cs.rotate) * Math.PI) / 180 : 0;
  return {
    text: el.textContent.trim().toUpperCase(),
    color: cs.color,
    cx: r.x + r.width / 2 - sheetBox.x,
    cy: r.y + r.height / 2 - sheetBox.y,
    w: el.offsetWidth,
    h: el.offsetHeight,
    angle: Math.atan2(m.b, m.a) + rot,
    font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
    border: parseFloat(cs.borderTopWidth) || 5,
    spacing: cs.letterSpacing,
    alpha: parseFloat(cs.opacity) || 0.82,
  };
}
