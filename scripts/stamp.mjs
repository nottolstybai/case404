// Перед публикацией: ставит в index.html и proto.html отпечатки файлов (?v=…).
// GitHub Pages кэширует файлы; без отпечатков после обновления браузер может взять
// новый index.html и старые скрипты из кэша — и игра сломается.
// Запуск из корня проекта: npm run stamp
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const hash = (path) => createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);
const versioned = (path) => `${path}?v=${hash(path)}`;

const modules = readdirSync('src').filter((f) => f.endsWith('.js')).sort();
const imports = Object.fromEntries(modules.map((f) => [`./src/${f}`, `./${versioned(`src/${f}`)}`]));

// Страница: свои стили и свой вход; карта модулей у всех общая.
const PAGES = [
  { html: 'index.html', styles: ['style.css'], entry: 'src/main.js' },
  { html: 'proto.html', styles: ['style.css', 'proto.css'], entry: 'src/proto.js' },
];

for (const page of PAGES) {
  const block = [
    '<!-- stamp: обновляется командой npm run stamp -->',
    ...page.styles.map((css) => `  <link rel="stylesheet" href="${versioned(css)}">`),
    `  <script type="importmap">${JSON.stringify({ imports })}</script>`,
    `  <script type="module" src="${versioned(page.entry)}"></script>`,
    '  <!-- /stamp -->',
  ].join('\n');
  const html = readFileSync(page.html, 'utf8');
  const updated = html.replace(/<!-- stamp:[\s\S]*?<!-- \/stamp -->/, block);
  if (updated === html && !html.includes(block)) throw new Error(`в ${page.html} нет блока <!-- stamp: … /stamp -->`);
  writeFileSync(page.html, updated);
  console.log(`${page.html}: ${modules.length} модулей + ${page.styles.join(', ')} с отпечатками`);
}
