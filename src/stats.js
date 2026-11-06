// Статистика игрока по дням — хранится в браузере.
// stats = { [номер дела]: { result: 'solved' | 'gaveup', time, wrong, hints } }

export function record(stats, number, game) {
  if (stats[number] || !(game.solved || game.gaveUp)) return stats;
  return {
    ...stats,
    [number]: { result: game.solved ? 'solved' : 'gaveup', time: game.elapsed, wrong: game.wrong, hints: game.hints },
  };
}

// Сколько дел подряд раскрыто, считая сегодняшнее (если оно ещё не закрыто — со вчерашнего).
export function streak(stats, today) {
  let day = stats[today] ? today : today - 1;
  let count = 0;
  while (stats[day]?.result === 'solved') {
    count++;
    day--;
  }
  return count;
}

export const solvedCount = (stats) => Object.values(stats).filter((s) => s.result === 'solved').length;

// 1 подсказка, 2 подсказки, 5 подсказок.
export function plural(n, one, few, many) {
  const tens = n % 100;
  const last = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const count = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

export function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`;
}

// Текст «Поделиться» — без спойлеров.
export function shareText({ number, game, streak: days, url }) {
  const head = game.solved ? `Дело №${number} раскрыто за ${clock(game.elapsed)}` : `Дело №${number} не раскрыто`;
  const details = [];
  if (game.solved) {
    details.push(game.wrong ? count(game.wrong, 'ошибка', 'ошибки', 'ошибок') : 'без ошибок');
    details.push(game.hints ? count(game.hints, 'подсказка', 'подсказки', 'подсказок') : 'без подсказок');
  }
  if (days > 1) details.push(`серия ${count(days, 'день', 'дня', 'дней')}`);
  return [`case404 · ${head}`, details.join(' · '), url].filter(Boolean).join('\n');
}

// До следующего дела (полночь по местному времени): «07:42:10».
export function untilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const total = Math.max(0, Math.floor((next - now) / 1000));
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
