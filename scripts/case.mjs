// Дело текстом — для плейтестов без браузера.
//   node scripts/case.mjs <режим> <ключ>                      — показать дело
//   node scripts/case.mjs <режим> <ключ> --check Имя ЧЧ:ММ место предмет — проверить обвинение
//   node scripts/case.mjs <режим> <ключ> --answer             — ответ (не для игроков)
// Режимы: classic — дело дня как сейчас; testimony — «лжёт только виновный».
// Ключ: дата 2026-12-01 или код случайного дела x-abc123.
import { existsSync, readFileSync } from 'node:fs';
import { casePuzzle, caseTitle, dateLabel } from '../src/daily.js';
import { testimonyPuzzle } from '../src/testimony.js';
import { clueText, introText, mainClueText, themeTitle } from '../src/text.js';

const [mode, key, flag, ...rest] = process.argv.slice(2);
if (!['classic', 'testimony'].includes(mode) || !key) {
  console.error('usage: node scripts/case.mjs classic|testimony <ключ> [--check Имя ЧЧ:ММ место предмет | --answer]');
  process.exit(2);
}
// для показаний — заготовка из cases/testimony, если есть (трудное дело собирается долго)
const cached = `cases/testimony/${key}.json`;
const p = mode === 'classic' ? casePuzzle(key) : existsSync(cached) ? JSON.parse(readFileSync(cached, 'utf8')) : testimonyPuzzle(key);
const k = (name) => p.categories.findIndex((c) => c.key === name);
const values = (name) => p.categories[k(name)].values.map((v) => v.name);
const lower = (s) => s.toLowerCase().replaceAll('ё', 'е').trim();
// Значение по слову игрока: «домик», «домик смотрителя», «в домике смотрителя» — всё годится.
const findValue = (cat, x) => {
  const list = p.categories[k(cat)].values;
  const word = lower(x ?? '');
  const exact = list.findIndex((v) => lower(v.name) === word);
  if (exact >= 0 || !word) return exact;
  return list.findIndex((v) => [v.loc, v.to, v.acc].some((t) => t && lower(t).includes(word)) || word.includes(lower(v.name)));
};
// «домик (в тексте — «в домике смотрителя»)»: если в показаниях место звучит длиннее названия
const placeLabel = (v) => (v.loc && v.loc.split(' ').length > 2 ? `${v.name} («${v.loc}»)` : v.name);

if (flag === '--check') {
  const [name, time, place, item] = rest;
  const g = p.suspects.findIndex((s) => lower(s.name) === lower(name ?? ''));
  const found = [['time', time], ['place', place], ['item', item]].map(([cat, x]) => findValue(cat, x));
  if (g < 0 || found.some((v) => v < 0)) {
    console.log('Не понял ответ. Нужно: имя, время, место и вещь, например: --check Вера 21:30 кабинет шприц');
    process.exit(1);
  }
  const answer = { [k('time')]: found[0], [k('place')]: found[1], [k('item')]: found[2] };
  const right = g === p.culprit && p.categories.every((_, c) => answer[c] === p.solution[g][c]);
  console.log(right ? 'Верно. Дело раскрыто.' : 'Неверно.');
  process.exit(0);
}

if (flag === '--answer') {
  const g = p.culprit;
  console.log(`${p.suspects[g].name}: ${p.categories.map((c, i) => c.values[p.solution[g][i]].name).join(', ')}`);
  if (mode === 'testimony') console.log(`уровень ${p.level}, тип ${p.kind}; под подозрением ещё: ${p.rivals.map((r) => p.suspects[r].name).join(', ') || '—'} (сведений на опровержение: ${p.refute.join(', ') || '—'}); после разоблачения шагов: ${p.steps}; фраз в деле: ${p.used}/10; фактов протокола: ${p.evidence.length}`);
  process.exit(0);
}

const READING = 'Как читать: «раньше» и «позже» — не обязательно сразу; «сразу после», «прямо перед» — подряд; «один за другим» — подряд, в любом порядке; «между ними приходил кто-то ещё» — не подряд; «первым или последним» — в самом начале или в самом конце.';
const out = [];
out.push(`${caseTitle(p)} · ${themeTitle(p)}, ${p.random ? 'случайное дело' : dateLabel(key)}`);
out.push('', introText(p), '');
out.push('Пятеро пришли этой ночью по одному. У каждого своё время прихода, своё место и своя вещь: ни время, ни место, ни вещь ни у кого не повторяются.');
out.push(`Время прихода: ${values('time').join(', ')} (по порядку).`);
out.push(`Места: ${p.categories[k('place')].values.map(placeLabel).join(', ')}.`);
out.push(`Вещи: ${values('item').join(', ')}.`);
out.push(`Подозреваемые: ${p.suspects.map((s) => `${s.name} (${s.role})`).join(', ')}.`);
out.push('');
if (mode === 'classic') {
  out.push(`Главная улика: ${mainClueText(p)}`);
  out.push('Улики:');
  p.clues.forEach((c, i) => out.push(`  ${i + 1}. ${clueText(p, c)}`));
} else {
  out.push('Правило: преступник один. Невиновные говорят правду, преступник лжёт — каждая его фраза неверна.');
  out.push(READING);
  out.push('Перевернуть фразу: «был» ↔ «не был», «раньше» ↔ «позже», «один за другим» ↔ «между ними кто-то был», «первым или последним» ↔ «не первым и не последним».');
  out.push('');
  out.push('Показания:');
  p.statements.forEach((st, g) => out.push(`  ${p.suspects[g].name}: «${st.map((c) => clueText(p, c)).join(' ')}»`));
  out.push('Протокол (это проверенные факты, они верны):');
  p.evidence.forEach((c) => out.push(`  — ${clueText(p, c)}`));
}
if (mode === 'classic') out.push(READING);
out.push('');
out.push('Задача: назвать преступника и всё о нём — когда пришёл, где был, что при нём нашли.');
console.log(out.join('\n'));
