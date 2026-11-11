// Картинка превью ссылки og.png (1200×630) — то, что показывают Telegram, ВК и др., когда кидаешь ссылку на игру.
// Лист бумаги на сукне: вклеенная ночная сцена со штампом «CASE 404» и заголовок.
// Сцена и штамп — те же, что в игре (src/art.js); цвета — из style.css.
// Нужен браузер для скриншотов из ~/tools/headless-chromium (Playwright + Chromium); у проекта зависимостей нет.
// Запуск из корня проекта: npm run og   (или node scripts/og.mjs другой-файл.png)
import path from 'node:path';
import { createRequire } from 'node:module';
import { scene, STAMP } from '../src/art.js';

const tools = path.join(process.env.HOME, 'tools/headless-chromium');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(tools, 'browsers');
const { chromium } = createRequire(path.join(tools, 'package.json'))('playwright');
const out = process.argv[2] ?? 'og.png';

const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0.1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Serif:wght@400;700&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:${grain},#24372e;font-family:'PT Serif',serif;color:#25221e}
.sheet{position:absolute;left:44px;top:40px;width:1112px;height:550px;padding:34px 40px;background:${grain},#e3e4dc;box-shadow:0 2px 0 rgba(0,0,0,.2),0 24px 50px rgba(0,0,0,.4)}
.photo{position:relative;height:232px;border:10px solid #f3f3ee;box-shadow:0 2px 5px rgba(37,34,30,.4);overflow:hidden}
.photo svg.house{display:block;width:100%;height:100%}
.photo .stamp-logo{position:absolute;top:8px;left:14px;width:250px;height:106px}
h1{margin:34px 0 0;font-size:84px;line-height:1;font-weight:700;letter-spacing:-0.01em}
p{margin:16px 0 0;font-size:29px;line-height:1.35;color:#55544f}
</style></head><body>
<div class="sheet">
  <div class="photo">${scene('house', { window: 2, moon: 0, weather: 0 })}${STAMP}</div>
  <h1>Кто это сделал?</h1>
  <p>Каждый день новое дело.<br>Пятеро подозреваемых, улики и один преступник.</p>
</div>
</body></html>`;

const browser = await chromium.launch({ env: { ...process.env, LD_LIBRARY_PATH: path.join(tools, 'sysroot/usr/lib/x86_64-linux-gnu') } });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: out });
  console.log(`готово: ${out}`);
} finally {
  await browser.close();
}
