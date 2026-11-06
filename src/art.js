// Картинки: силуэты подозреваемых у стены для опознания и дом на холме.

const INK = '#090807';
const PALE = '#d6cdbd';
const DIM = '#6f675c';
const RED = '#b0352a';
const GOLD = '#d4a948';
const BAG = '#3a352f';
const RED_STAMP = '#c0392b';

const GLASSES = `<g fill="none" stroke="${GOLD}" stroke-width="0.9"><circle cx="20.5" cy="24" r="2.6"/><circle cx="27.5" cy="24" r="2.6"/><path d="M23.1 24h1.8"/></g>`;
const SHIRT_BOW = `<path d="M20.5 40 L24 47 L27.5 40 Z" fill="${PALE}"/>
  <path d="M21 40.6 L24 42 L21 43.4 Z M27 40.6 L24 42 L27 43.4 Z" fill="${INK}"/>`;
const PEARLS = `<g fill="${PALE}">${[16.5, 19, 21.5, 24, 26.5, 29, 31.5]
  .map((x, i) => `<circle cx="${x}" cy="${41.5 + Math.abs(i - 3) * -0.5 + 1.5}" r="0.9"/>`)
  .join('')}</g>`;

// Что рисуется за головой (back) и поверх силуэта (front) — по роли.
const LOOKS = {
  сиделка: {
    front: `<path d="M15.5 19 L17 10 H31 L32.5 19 Q24 16 15.5 19 Z" fill="${PALE}"/>
      <path d="M23 11.5h2v5h-2zM21.5 13h5v2h-5z" fill="${RED}"/>`,
  },
  садовник: {
    front: `<ellipse cx="24" cy="17" rx="16" ry="2.6" fill="${INK}"/>
      <path d="M16.5 17 Q16.5 6.5 24 6.5 Q31.5 6.5 31.5 17 Z" fill="${INK}"/>
      <rect x="16.7" y="13.4" width="14.6" height="2" fill="${DIM}"/>`,
  },
  экономка: {
    back: `<circle cx="24" cy="11.5" r="5" fill="${INK}"/>`,
    front: `<path d="M17 39 L24 44 L31 39 L32 41.5 L24 47 L16 41.5 Z" fill="${PALE}"/>`,
  },
  нотариус: { front: GLASSES + SHIRT_BOW },
  племянница: {
    back: `<path d="M14.5 25 Q14 12.5 24 12.5 Q34 12.5 33.5 25 L35 43 Q24 46 13 43 Z" fill="${INK}"/>`,
    front: `<path d="M29 13.5 L33 11 L33 16 Z M29 13.5 L25 11 L25 16 Z" fill="${RED}"/><circle cx="29" cy="13.5" r="1.1" fill="${RED}"/>`,
  },
  шофёр: {
    front: `<path d="M15.5 18 Q15.5 9 24 9 Q32.5 9 32.5 18 Z" fill="${INK}"/>
      <path d="M15 17.5 H33 Q34 20.5 30 20.5 H18 Q14 20.5 15 17.5 Z" fill="${INK}"/>
      <rect x="15.5" y="15.5" width="17" height="1.8" fill="${DIM}"/>
      <circle cx="24" cy="12.5" r="1.4" fill="${GOLD}"/>`,
  },
  кухарка: {
    front: `<path d="M17 18 V13 Q13 12 14.5 8 Q16 4.5 20 6 Q22 2.5 26 3.5 Q29.5 2.5 31 6.5 Q35 6 34 10.5 Q33.5 12.5 31 13 V18 Z" fill="${PALE}"/>
      <rect x="17" y="15.4" width="14" height="0.8" fill="${DIM}"/>`,
  },
  сторож: {
    front: `<path d="M15 20 Q15 9 24 9 Q33 9 33 20 Z" fill="${INK}"/>
      <path d="M14 17 h4.5 v14 q-2.2 1.2 -4.5 0 Z M29.5 17 h4.5 v14 q-2.2 1.2 -4.5 0 Z" fill="${DIM}"/>
      <rect x="14.5" y="15.5" width="19" height="4" rx="2" fill="${DIM}"/>`,
  },
  гадалка: {
    front: `<path d="M14.5 27 Q13.5 11 24 11 Q34.5 11 33.5 27 Q33 20 24 19.5 Q15 20 14.5 27 Z" fill="#6e2620"/>
      <g fill="${GOLD}"><circle cx="17" cy="21.2" r="0.7"/><circle cx="20.5" cy="20" r="0.7"/><circle cx="24" cy="19.6" r="0.7"/><circle cx="27.5" cy="20" r="0.7"/><circle cx="31" cy="21.2" r="0.7"/></g>
      <circle cx="15.8" cy="30" r="1.8" fill="none" stroke="${GOLD}" stroke-width="0.8"/>`,
  },
  доктор: {
    front: `<path d="M15.5 17.5 Q24 14.5 32.5 17.5" stroke="${DIM}" stroke-width="1.2" fill="none"/>
      <circle cx="24" cy="15.6" r="3.4" fill="${PALE}"/><circle cx="24" cy="15.6" r="1" fill="${INK}"/>
      <path d="M18.5 40 Q17 50 24 51 Q31 50 29.5 40" fill="none" stroke="${DIM}" stroke-width="1.2"/>
      <circle cx="24" cy="51" r="1.6" fill="${DIM}"/>`,
  },
  фотограф: {
    front: `<ellipse cx="22.5" cy="15" rx="10.5" ry="3.8" fill="${INK}"/><rect x="22" y="9.6" width="1.4" height="2.6" fill="${INK}"/>
      <path d="M19 40 L17 44 M29 40 L31 44" stroke="${DIM}" stroke-width="0.8"/>
      <rect x="16" y="44" width="16" height="10" rx="1.5" fill="${BAG}" stroke="${DIM}" stroke-width="0.6"/>
      <circle cx="24" cy="49" r="3.2" fill="${INK}" stroke="${PALE}" stroke-width="0.8"/>
      <rect x="27.5" y="45.5" width="3" height="1.6" fill="${PALE}"/>`,
  },
  антиквар: {
    front: `<rect x="17" y="1.5" width="14" height="13" fill="${INK}"/><ellipse cx="24" cy="15" rx="12" ry="2.2" fill="${INK}"/>
      <rect x="17" y="11.6" width="14" height="1.6" fill="${DIM}"/>
      <circle cx="27.5" cy="24" r="2.8" fill="none" stroke="${GOLD}" stroke-width="0.9"/>
      <path d="M30 25.5 Q32 33 29 40" stroke="${GOLD}" stroke-width="0.5" fill="none"/>`,
  },
  горничная: {
    front: `<path d="M15.5 18 Q24 10.5 32.5 18 L32 20 Q24 13.5 16 20 Z" fill="${PALE}"/>
      <g fill="${PALE}"><circle cx="18" cy="15" r="1.3"/><circle cx="21" cy="13.4" r="1.3"/><circle cx="24" cy="12.8" r="1.3"/><circle cx="27" cy="13.4" r="1.3"/><circle cx="30" cy="15" r="1.3"/></g>
      <path d="M19 39.5 L24 43 L21 44.5 Z M29 39.5 L24 43 L27 44.5 Z" fill="${PALE}"/>`,
  },
  дворецкий: {
    front: `${SHIRT_BOW}
      <ellipse cx="39" cy="35" rx="7.5" ry="1.4" fill="${DIM}"/>
      <path d="M37.3 34.6 l0.6 -5.5 h2.2 l0.6 5.5 z" fill="${PALE}" opacity="0.85"/>
      <path d="M36 36 Q38 40 37 44" stroke="${INK}" stroke-width="3" fill="none"/>`,
  },
  вдова: {
    front: `<ellipse cx="24" cy="15.5" rx="13" ry="2.4" fill="${INK}"/>
      <path d="M17.5 15.5 Q18 8 24 8 Q30 8 30.5 15.5 Z" fill="${INK}"/>
      <g stroke="${DIM}" stroke-width="0.35" opacity="0.9">
        <path d="M16 17 L17 31 M18.5 17 L19 32 M21 17 L21.2 33 M23.5 17 V33.5 M26 17 L25.8 33 M28.5 17 L28 32 M31 17 L30.5 31"/>
        <path d="M15.8 20 H32.2 M15.9 24 H32.1 M16.3 28 H31.7"/>
      </g>
      ${PEARLS}`,
  },
  священник: {
    front: `<rect x="22.2" y="35" width="3.6" height="3" fill="${PALE}"/>
      <path d="M21 40 Q24 46 27 40" stroke="${GOLD}" stroke-width="0.5" fill="none"/>
      <path d="M23.4 45h1.2v6h-1.2z M21.8 46.6h4.4v1.2h-4.4z" fill="${GOLD}"/>`,
  },
  художница: {
    back: `<circle cx="27" cy="12.5" r="4.5" fill="${INK}"/>
      <path d="M27 12 L35 3.5" stroke="${GOLD}" stroke-width="1"/><path d="M26 12 L30.5 2" stroke="${RED}" stroke-width="1"/>`,
    front: `<g><circle cx="11" cy="50" r="1.6" fill="${RED}"/><circle cx="14" cy="48" r="1.3" fill="${GOLD}"/><circle cx="13" cy="52" r="1.2" fill="${PALE}"/></g>`,
  },
  охотник: {
    front: `<ellipse cx="24" cy="16.5" rx="11" ry="2" fill="${INK}"/>
      <path d="M16.5 16.5 Q17 8 24 8 Q31 8 31.5 16.5 Z" fill="${INK}"/>
      <rect x="17" y="13.5" width="14" height="1.6" fill="${DIM}"/>
      <path d="M30 13 Q36 7 38 3" stroke="${GOLD}" stroke-width="1.3" fill="none"/>
      <path d="M11 45 L35 56" stroke="${DIM}" stroke-width="1.6"/>`,
  },
  учительница: {
    back: `<circle cx="24" cy="11" r="4.6" fill="${INK}"/>`,
    front: `${GLASSES}<circle cx="24" cy="42" r="1.6" fill="${GOLD}"/>`,
  },
  почтальон: {
    front: `<path d="M15.5 18 Q24 8.5 32.5 18 Z" fill="${INK}"/>
      <path d="M15 17.5 H31 Q32 20 28.5 20 H18 Q14.5 20 15 17.5 Z" fill="${INK}"/>
      <rect x="15.5" y="15.8" width="17" height="1.6" fill="${DIM}"/>
      <path d="M14 42 L34 52" stroke="${DIM}" stroke-width="1.6"/>
      <rect x="30" y="47" width="11" height="9" rx="1" fill="${BAG}" stroke="${DIM}" stroke-width="0.6"/>
      <rect x="32" y="45" width="7" height="3.5" fill="${PALE}"/>`,
  },
  певица: {
    back: `<path d="M15 26 Q14 12.5 24 12.5 Q34 12.5 33 26 Q34.5 33 31 36 H17 Q13.5 33 15 26 Z" fill="${INK}"/>`,
    front: `<g fill="${RED}"><circle cx="31" cy="12.5" r="1.6"/><circle cx="33" cy="14.3" r="1.6"/><circle cx="31.8" cy="16.6" r="1.6"/><circle cx="29.2" cy="16" r="1.6"/><circle cx="29" cy="13.5" r="1.6"/></g>
      <circle cx="30.8" cy="14.6" r="0.9" fill="${GOLD}"/>
      ${PEARLS}`,
  },
  капитан: {
    front: `<path d="M15 17 Q15 9.5 24 9.5 Q33 9.5 33 17 Z" fill="${PALE}"/>
      <rect x="15.3" y="15" width="17.4" height="2.6" fill="${INK}"/>
      <path d="M15 17.5 H33 Q34 20.5 30 20.5 H18 Q14 20.5 15 17.5 Z" fill="${INK}"/>
      <circle cx="24" cy="13" r="1.5" fill="${GOLD}"/>
      <path d="M30.5 31 H36 V27.5 H38.5 V32.5 H30.5 Z" fill="${DIM}"/>`,
  },
  швея: {
    front: `<path d="M18.5 39.5 Q16.5 47 18 55" stroke="${GOLD}" stroke-width="2" fill="none"/>
      <path d="M29.5 39.5 Q31.5 46 30 52" stroke="${GOLD}" stroke-width="2" fill="none"/>
      <g stroke="${INK}" stroke-width="0.4"><path d="M16.9 43h1.6M16.7 46h1.6M16.8 49h1.6M17.2 52h1.6M30.5 43h1.6M30.8 46h1.6M30.5 49h1.6"/></g>
      <path d="M33 22 L37 10" stroke="${PALE}" stroke-width="0.6"/><circle cx="37" cy="10" r="0.7" fill="${PALE}"/>`,
  },
  репортёр: {
    front: `<ellipse cx="24" cy="16.2" rx="14" ry="2.4" fill="${INK}"/>
      <path d="M17 16 Q17 8.5 20 7.8 Q24 9.5 28 7.8 Q31 8.5 31 16 Z" fill="${INK}"/>
      <rect x="17.1" y="13" width="13.8" height="1.8" fill="${DIM}"/>
      <rect x="26.5" y="11" width="3.6" height="2.8" fill="${PALE}"/>`,
  },
};

// Силуэт у стены с ростомером.
export function portrait(role) {
  const look = LOOKS[role] ?? {};
  const lines = [10, 20, 30, 40, 50].map((y) => `<path d="M0 ${y}H48"/>`).join('');
  return `<svg class="portrait" viewBox="0 0 48 56" aria-hidden="true">
    <rect width="48" height="56" fill="#2b2723"/>
    <g stroke="#3b3631" stroke-width="0.6">${lines}</g>
    ${look.back ?? ''}
    <path d="M5 56 C5 45 13 40 24 40 C35 40 43 45 43 56 Z" fill="${INK}"/>
    <rect x="20" y="31" width="8" height="10" fill="${INK}"/>
    <ellipse cx="24" cy="24" rx="8.5" ry="10.5" fill="${INK}"/>
    ${look.front ?? ''}
  </svg>`;
}

export const ROLES = Object.keys(LOOKS);

// Картинка дела: ночное небо, луна, погода — и силуэт места по теме дня.
// Сцена широкая (720×120): на телефоне видна середина, на большом экране — вся.
// art = { window, moon, weather } — меняется день ото дня: какое окно горит,
// полная луна или серп, ясно / дождь / снег / туман.
const SKY_INK = '#050404';
const STARS = [
  [24, 14], [70, 34], [118, 10], [160, 44], [214, 22], [262, 8], [318, 30], [396, 14],
  [430, 50], [530, 12], [566, 40], [612, 20], [664, 36], [700, 10],
];

function weather(kind) {
  const range = (count) => Array.from({ length: count }, (_, i) => i);
  if (kind === 1) {
    const drops = range(70).map((i) => `M${(i * 37) % 724} ${(i * 53) % 112} l-4 10`);
    return `<path d="${drops.join(' ')}" stroke="#9a9286" stroke-width="0.7" opacity="0.35"/>`;
  }
  if (kind === 2) {
    const flakes = range(80).map((i) => `<circle cx="${(i * 41) % 720}" cy="${(i * 29) % 118}" r="${0.7 + (i % 3) * 0.4}"/>`);
    return `<g fill="#e8e1d4" opacity="0.6">${flakes.join('')}</g>`;
  }
  if (kind === 3) return '<rect x="0" y="60" width="720" height="60" fill="url(#fog)"/>';
  return '';
}

function moon(x, y, crescent) {
  const disc = crescent
    ? `<mask id="crescent"><circle cx="${x}" cy="${y}" r="17" fill="#fff"/><circle cx="${x + 9}" cy="${y - 6}" r="16" fill="#000"/></mask>
       <circle cx="${x}" cy="${y}" r="17" fill="#d9d0bf" mask="url(#crescent)"/>`
    : `<circle cx="${x}" cy="${y}" r="17" fill="#d9d0bf"/>
       <circle cx="${x - 6}" cy="${y - 5}" r="3" fill="#c5bba8"/><circle cx="${x + 5}" cy="${y + 5}" r="2" fill="#c5bba8"/>`;
  return `<circle cx="${x}" cy="${y}" r="46" fill="url(#glow)"/>${disc}`;
}

const birds = (x, y) =>
  `<path d="M${x} ${y} q4 -4 8 0 q4 -4 8 0 M${x + 20} ${y + 16} q3 -3 6 0 q3 -3 6 0" stroke="${SKY_INK}" stroke-width="1.4" fill="none"/>`;

// Окна: все тёмные, кроме одного горящего lit (его выбирает art.window).
function windows(list, lit, w = 8, h = 10) {
  const dark = list
    .filter((p) => p !== lit)
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`)
    .join('');
  const [lx, ly] = lit;
  return `<g fill="#17140f">${dark}</g>
    <circle cx="${lx + w / 2}" cy="${ly + h / 2}" r="14" fill="url(#lamp)"/>
    <rect x="${lx}" y="${ly}" width="${w}" height="${h}" fill="${GOLD}"/>
    <path d="M${lx + w / 2} ${ly}v${h}M${lx} ${ly + h / 2}h${w}" stroke="${SKY_INK}" stroke-width="0.8"/>`;
}

// Какое окно горит сегодня: одно из кандидатов по art.window.
const pick = (candidates, art, draw) => draw(candidates[art.window % candidates.length]);
const HOUSE_WINDOWS = [[367, 40], [316, 58], [334, 58], [352, 58], [316, 72], [352, 72]];

const dist = (d) => `<path d="${d}" fill="#131116"/>`;
const tree = (x, y, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 L2 -26 L-6 -42 M2 -26 L11 -46 L16 -52 M6 -36 L22 -42 M-2 -34 L-14 -46 L-18 -44 M11 -46 L6 -54" stroke="${SKY_INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const pine = (x, y, h) => `<path d="M${x} ${y} l${h * 0.22} ${-h} l${h * 0.22} ${h} Z M${x + h * 0.06} ${y - h * 0.45} l${h * 0.16} ${-h * 0.45} l${h * 0.16} ${h * 0.45} Z" fill="${SKY_INK}"/>`;

// Усадьба на холме.
function houseLayer(art) {
  return `
  ${dist('M0 120 V82 Q110 62 230 76 Q370 54 520 70 Q630 60 720 68 V120 Z')}
  ${moon(472, 36, art.moon === 1)}
  ${birds(418, 30)}
  <g fill="${SKY_INK}">
    <path d="M180 120 V98 Q250 76 340 84 Q430 92 540 80 V120 Z"/>
    <rect x="308" y="50" width="62" height="38"/>
    <path d="M301 52 L339 24 L377 52 Z"/>
    <rect x="316" y="26" width="7" height="18"/>
    <rect x="362" y="32" width="18" height="40"/>
    <path d="M358 34 L371 8 L384 34 Z"/>
    <path d="M400 92 v-9 M408 91 v-9 M416 90 v-9 M424 90 v-9 M432 89 v-9 M396 86 H436" stroke="${SKY_INK}" stroke-width="1.6"/>
    <path d="M0 120 V100 Q100 86 180 98 V120 Z"/>
    <path d="M540 80 Q620 72 720 90 V120 H540 Z"/>
    <path d="M62 99 v-9 a4 4 0 0 1 8 0 v9 Z M88 96 v-11 a5 5 0 0 1 10 0 v11 Z M140 98 v-8 a3.5 3.5 0 0 1 7 0 v8 Z"/>
    <path d="M118 97 v-15 M113 87 h10" stroke="${SKY_INK}" stroke-width="2.5"/>
  </g>
  ${tree(240, 104, 0.95)}${tree(498, 96, 0.7)}${tree(640, 86, 0.9)}
  ${pick(HOUSE_WINDOWS, art, (lit) => windows(HOUSE_WINDOWS, lit))}
  <rect x="334" y="72" width="9" height="16" fill="#17140f"/>`;
}

// Ночной поезд на мосту, дым из трубы. Поезд сдвинут влево, чтобы паровоз был виден и на телефоне.
function trainLayer(art) {
  const cars = [60, 156, 252, 348];
  const carBodies = cars.map((x) => `<rect x="${x}" y="62" width="90" height="22" rx="3"/>`).join('');
  const wheels = [...cars.flatMap((x) => [x + 14, x + 76]), 470, 496, 522].map((x) => `<circle cx="${x}" cy="86" r="4"/>`).join('');
  const panes = cars.flatMap((x) => [10, 30, 50, 70].map((dx) => [x + dx, 67]));
  const lit = [panes[5], panes[6], panes[9], panes[10], panes[13], panes[14]];
  return `
  ${dist('M0 120 V86 Q140 70 280 80 Q430 66 560 76 Q650 70 720 78 V120 Z')}
  ${moon(385, 30, art.moon === 1)}
  <g fill="#2a2830" opacity="0.55">
    <circle cx="530" cy="42" r="6"/><circle cx="518" cy="33" r="9"/><circle cx="500" cy="24" r="12"/><circle cx="476" cy="17" r="14"/><circle cx="448" cy="14" r="15"/>
  </g>
  <g fill="${SKY_INK}">
    <rect x="0" y="88" width="720" height="5"/>
    ${[0, 90, 180, 270, 360, 450, 540, 630].map((x) => `<path d="M${x} 93 H${x + 90} V120 H${x + 78} Q${x + 45} 98 ${x + 12} 120 H${x} Z"/>`).join('')}
    ${carBodies}
    <rect x="452" y="58" width="80" height="26" rx="3"/>
    <rect x="452" y="48" width="26" height="14"/>
    <rect x="516" y="46" width="8" height="14"/>
    <path d="M532 84 L550 84 L538 74 Z"/>
    ${wheels}
    <path d="M620 88 V40 M614 46 H626 M690 88 V40 M684 46 H696" stroke="${SKY_INK}" stroke-width="2"/>
    <path d="M560 47 Q600 54 640 49 Q680 54 720 47" stroke="${SKY_INK}" stroke-width="0.8" fill="none"/>
  </g>
  ${pick(lit, art, (one) => windows(panes, one, 10, 8))}
  <rect x="458" y="52" width="10" height="7" fill="#17140f"/>`;
}

// Санаторий в соснах: колонны, крылья, купол.
function sanatoriumLayer(art) {
  const panes = [262, 280, 298, 316, 404, 422, 440, 458].flatMap((x) => [[x, 56], [x, 74]]);
  const lit = [panes[2], panes[5], panes[9], panes[12], panes[14], panes[7]];
  return `
  ${dist('M0 120 V84 Q160 66 320 78 Q480 62 720 76 V120 Z')}
  ${moon(530, 28, art.moon === 1)}
  ${birds(210, 26)}
  <g fill="${SKY_INK}">
    <path d="M0 120 V96 Q180 88 360 92 Q540 96 720 90 V120 Z"/>
    <rect x="250" y="48" width="220" height="46"/>
    <rect x="200" y="62" width="50" height="32"/><rect x="470" y="62" width="50" height="32"/>
    <rect x="326" y="40" width="68" height="54"/>
    <path d="M320 42 L360 24 L400 42 Z"/>
    <path d="M350 24 a10 10 0 0 1 20 0 Z"/><path d="M360 14 V6" stroke="${SKY_INK}" stroke-width="1.5"/>
    <path d="M150 96 V84 H570 V96" stroke="${SKY_INK}" stroke-width="1.2" fill="none"/>
    ${[160, 180, 200, 520, 540, 560].map((x) => `<path d="M${x} 96 v-12" stroke="${SKY_INK}" stroke-width="1.2"/>`).join('')}
  </g>
  <g fill="#121014">${[334, 350, 366, 382].map((x) => `<rect x="${x}" y="46" width="4" height="48"/>`).join('')}</g>
  ${pine(70, 100, 60)}${pine(110, 98, 46)}${pine(560, 96, 52)}${pine(612, 98, 64)}${pine(660, 94, 40)}${pine(10, 104, 40)}
  ${pick(lit, art, (one) => windows(panes, one, 8, 10))}`;
}

// Маяк на скале, луч над морем, домик смотрителя.
function lighthouseLayer(art) {
  const left = art.window % 2 === 0; // луч светит влево или вправо
  const beam = left ? 'M420 15 L-20 -30 L-20 70 Z' : 'M420 15 L740 -30 L740 70 Z';
  const waves = Array.from({ length: 9 }, (_, i) => `M${i * 84 - 20} ${104 + (i % 3) * 5} q10 -4 20 0 q10 4 20 0`).join(' ');
  return `
  <defs><linearGradient id="beam" x1="${left ? 1 : 0}" y1="0" x2="${left ? 0 : 1}" y2="0">
    <stop offset="0" stop-color="${GOLD}" stop-opacity="0.32"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
  </linearGradient></defs>
  ${moon(left ? 600 : 330, 30, art.moon === 1)}
  <path d="${beam}" fill="url(#beam)"/>
  <rect x="0" y="96" width="720" height="24" fill="#0b0c10"/>
  <path d="${waves}" stroke="#23242c" stroke-width="1.2" fill="none"/>
  <g fill="${SKY_INK}">
    <path d="M290 120 L302 96 Q334 78 380 76 L470 74 Q500 80 522 96 L540 120 Z"/>
    <path d="M407 76 L413 26 H427 L433 76 Z"/>
    <rect x="409" y="22" width="22" height="4"/>
    <path d="M412 12 L420 3 L428 12 Z"/>
    <rect x="452" y="62" width="30" height="14"/><path d="M448 63 L467 52 L486 63 Z"/>
    <path d="M150 104 q20 -14 40 0 Z M600 100 q26 -18 52 0 Z M80 108 q12 -8 24 0 Z"/>
    <path d="M210 102 h34 l-6 6 h-22 Z M226 102 V88 L238 100 Z"/>
    <path d="M520 100 V92 M520 96 H556 M556 100 V92" stroke="${SKY_INK}" stroke-width="2"/>
  </g>
  <circle cx="420" cy="17" r="20" fill="url(#lamp)"/>
  <rect x="414" y="12" width="12" height="10" fill="${GOLD}"/>
  <path d="M420 12v10" stroke="${SKY_INK}" stroke-width="0.8"/>
  ${art.window % 3 === 0 ? `<rect x="461" y="66" width="7" height="7" fill="${GOLD}"/>` : `<rect x="461" y="66" width="7" height="7" fill="#17140f"/>`}`;
}

const LAYERS = { house: houseLayer, train: trainLayer, sanatorium: sanatoriumLayer, lighthouse: lighthouseLayer };

export function scene(theme = 'house', art = { window: 0, moon: 0, weather: 0 }) {
  return `<svg class="house" viewBox="0 0 720 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e1c22"/><stop offset="1" stop-color="#0e0d0c"/>
    </linearGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfc6b6" stop-opacity="0"/><stop offset="0.6" stop-color="#cfc6b6" stop-opacity="0.16"/><stop offset="1" stop-color="#cfc6b6" stop-opacity="0.04"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#e3dac8" stop-opacity="0.22"/><stop offset="1" stop-color="#e3dac8" stop-opacity="0"/></radialGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="${GOLD}" stop-opacity="0.55"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="720" height="120" fill="url(#sky)"/>
  <g fill="#cfc6b6" opacity="0.45">${STARS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.8"/>`).join('')}</g>
  ${(LAYERS[theme] ?? houseLayer)(art)}
  ${weather(art.weather)}
</svg>`;
}

// Прежнее имя — дом на холме.
export const house = (art) => scene('house', art);

// Штамп «CASE 404» — логотип; ставится в угол картинки с домом, как печать на фото из дела.
export const STAMP = `<svg class="stamp-logo" viewBox="0 0 260 110" aria-label="case404">
  <filter id="stamp-ink"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>
  <g transform="rotate(-6 130 55)" filter="url(#stamp-ink)">
    <rect x="22" y="22" width="216" height="66" fill="none" stroke="${RED_STAMP}" stroke-width="4.5"/>
    <rect x="30" y="30" width="200" height="50" fill="none" stroke="${RED_STAMP}" stroke-width="1.5"/>
    <text x="130" y="68" text-anchor="middle" font-family="'PT Mono', monospace" font-size="32" letter-spacing="7" fill="${RED_STAMP}">CASE 404</text>
  </g>
</svg>`;
