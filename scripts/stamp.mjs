// Перед публикацией: ставит в index.html отпечатки файлов (?v=…).
// GitHub Pages кэширует файлы; без отпечатков после обновления браузер может взять
// новый index.html и старые скрипты из кэша — и игра сломается.
// Запуск из корня проекта: npm run stamp
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const hash = (path) => createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);
const versioned = (path) => `${path}?v=${hash(path)}`;

const modules = readdirSync('src').filter((f) => f.endsWith('.js')).sort();
const imports = Object.fromEntries(modules.map((f) => [`./src/${f}`, `./${versioned(`src/${f}`)}`]));

const block = [
  '<!-- stamp: обновляется командой npm run stamp -->',
  `  <link rel="stylesheet" href="${versioned('style.css')}">`,
  `  <script type="importmap">${JSON.stringify({ imports })}</script>`,
  `  <script type="module" src="${versioned('src/main.js')}"></script>`,
  '  <!-- /stamp -->',
].join('\n');

const html = readFileSync('index.html', 'utf8');
const updated = html.replace(/<!-- stamp:[\s\S]*?<!-- \/stamp -->/, block);
if (updated === html && !html.includes(block)) throw new Error('в index.html нет блока <!-- stamp: … /stamp -->');
writeFileSync('index.html', updated);
console.log(`index.html: ${modules.length} модулей + style.css с отпечатками`);
