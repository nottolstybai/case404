// Пересобрать vendor/three.js — облегчённый Three.js только с тем, что импортирует src/office3d.js.
// Готовые сборки Three.js весят ~2 МБ; телефону столько для одного кабинета не нужно, а сборщика в проекте нет.
// Скрипт во временной папке ставит three и esbuild, собирает и кладёт результат в vendor/ (нужен интернет).
//   node scripts/vendor-three.mjs        — после того как в src/office3d.js поменялся список импортов из 'three'
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const THREE = '0.187.0';
const ESBUILD = '0.25.0';
const SOURCE = 'src/office3d.js';
// классы не из ядра three, а из его дополнений: имя → путь
const ADDONS = { RoomEnvironment: 'three/addons/environments/RoomEnvironment.js' };
const imported = readFileSync(SOURCE, 'utf8').match(/import \{([^}]+)\} from 'three'/);
if (!imported) throw new Error(`в ${SOURCE} нет import { … } from 'three'`);
const names = [...imported[1].matchAll(/\w+/g)].map((m) => m[0]);
const core = names.filter((name) => !ADDONS[name]);
const addons = names.filter((name) => ADDONS[name]).map((name) => `export { ${name} } from '${ADDONS[name]}';\n`);

const dir = mkdtempSync(join(tmpdir(), 'three-'));
try {
  writeFileSync(join(dir, 'package.json'), '{ "private": true }');
  writeFileSync(join(dir, 'entry.js'), `export { ${core.join(', ')} } from 'three';\n${addons.join('')}`);
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', `three@${THREE}`, `esbuild@${ESBUILD}`], { cwd: dir, stdio: 'inherit' });
  const banner = `/* three.js ${THREE} (MIT, © three.js authors) — только ${names.length} классов для ${SOURCE}. Пересборка: node scripts/vendor-three.mjs */`;
  execFileSync(join(dir, 'node_modules/.bin/esbuild'), ['entry.js', '--bundle', '--minify', '--format=esm', `--banner:js=${banner}`, '--outfile=out.js'], { cwd: dir, stdio: 'inherit' });
  mkdirSync('vendor', { recursive: true });
  copyFileSync(join(dir, 'out.js'), 'vendor/three.js');
  console.log(`vendor/three.js: ${names.length} классов, ${Math.round(readFileSync('vendor/three.js').length / 1024)} КБ`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
