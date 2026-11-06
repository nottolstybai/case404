// Дело: кто когда пришёл, где был, что у него нашли — и кто преступник.
//
// puzzle = {
//   suspects,    — [{ name, gen, ins, gender, role }] — N подозреваемых
//   categories,  — [{ key, title, ordered?, values: [...] }] — у каждой ровно N значений
//   solution,    — solution[g][k] — номер значения категории k у подозреваемого g (ответ)
//   clues,       — улики (см. ниже)
//   culprit,     — номер преступника
//   culpritClue, — { k, v }: «преступник — тот, у кого значение v в категории k»
// }
//
// Категория с ordered: true — время прихода: значения идут по порядку (раньше → позже),
// поэтому про неё бывают улики «раньше», «сразу после», «первым или последним».
//
// Улики. Субъект s — подозреваемый { g } или «тот, у кого значение v в категории k» { k, v }:
//   { type: 'is',  s, k, v }    — у s значение v в категории k («Вера была в подвале»)
//   { type: 'not', s, k, v }    — у s не v
//   { type: 'next', a, b }      — a и b пришли один за другим
//   { type: 'notNext', a, b }   — между a и b приходил кто-то ещё
//   { type: 'left', a, b }      — a пришёл раньше b (не обязательно сразу)
//   { type: 'rightNext', a, b } — a пришёл сразу после b
//   { type: 'edge', a }         — a пришёл первым или последним
//   { type: 'notEdge', a }      — a пришёл не первым и не последним
// У 'left' и 'rightNext' может быть flip: true — тот же факт, сказанный наоборот
// («b пришёл позже a»).

// Комнаты: loc — где? (в подвале), to — куда? (в подвал). Названия не длиннее 9 букв —
// иначе не влезут в кнопку на телефоне.
export const PLACES = [
  { name: 'подвал', to: 'в подвал', loc: 'в подвале' },
  { name: 'чердак', to: 'на чердак', loc: 'на чердаке' },
  { name: 'кухня', to: 'на кухню', loc: 'на кухне' },
  { name: 'часовня', to: 'в часовню', loc: 'в часовне' },
  { name: 'кабинет', to: 'в кабинет', loc: 'в кабинете' },
  { name: 'спальня', to: 'в спальню', loc: 'в спальне' },
  { name: 'веранда', to: 'на веранду', loc: 'на веранде' },
  { name: 'сад', to: 'в сад', loc: 'в саду' },
  { name: 'гостиная', to: 'в гостиную', loc: 'в гостиной' },
  { name: 'погреб', to: 'в погреб', loc: 'в погребе' },
  { name: 'склеп', to: 'в склеп', loc: 'в склепе' },
  { name: 'детская', to: 'в детскую', loc: 'в детской' },
  { name: 'конюшня', to: 'в конюшню', loc: 'в конюшне' },
  { name: 'кладовая', to: 'в кладовую', loc: 'в кладовой' },
  { name: 'оранжерея', to: 'в оранжерею', loc: 'в оранжерее' },
  { name: 'прачечная', to: 'в прачечную', loc: 'в прачечной' },
  { name: 'ванная', to: 'в ванную', loc: 'в ванной' },
  { name: 'холл', to: 'в холл', loc: 'в холле' },
];

export const ITEMS = [
  { name: 'верёвка', acc: 'верёвку' },
  { name: 'кочерга', acc: 'кочергу' },
  { name: 'ножницы', acc: 'ножницы' },
  { name: 'яд', acc: 'яд' },
  { name: 'шарф', acc: 'шарф' },
  { name: 'молоток', acc: 'молоток' },
  { name: 'гиря', acc: 'гирю' },
  { name: 'подушка', acc: 'подушку' },
  { name: 'лопата', acc: 'лопату' },
  { name: 'трость', acc: 'трость' },
  { name: 'статуэтка', acc: 'статуэтку' },
  { name: 'цепь', acc: 'цепь' },
  { name: 'галстук', acc: 'галстук' },
  { name: 'бутылка', acc: 'бутылку' },
  { name: 'ремень', acc: 'ремень' },
  { name: 'кирпич', acc: 'кирпич' },
  { name: 'ваза', acc: 'вазу' },
  { name: 'канделябр', acc: 'канделябр' },
];

export const orderIndex = (puzzle) => puzzle.categories.findIndex((c) => c.ordered);

// Кто из подозреваемых — субъект s в раскладке sol.
export function holder(s, sol) {
  if (s.g !== undefined) return s.g;
  return sol.findIndex((row) => row[s.k] === s.v);
}

// Верна ли улика при раскладке sol (sol[g][k]).
export function isTrue(clue, sol, n, orderK) {
  const pos = (s) => sol[holder(s, sol)][orderK];
  switch (clue.type) {
    case 'is':
      return sol[holder(clue.s, sol)][clue.k] === clue.v;
    case 'not':
      return sol[holder(clue.s, sol)][clue.k] !== clue.v;
    case 'next':
      return Math.abs(pos(clue.a) - pos(clue.b)) === 1;
    case 'notNext':
      return holder(clue.a, sol) !== holder(clue.b, sol) && Math.abs(pos(clue.a) - pos(clue.b)) !== 1;
    case 'left':
      return pos(clue.a) < pos(clue.b);
    case 'rightNext':
      return pos(clue.a) === pos(clue.b) + 1;
    case 'edge':
      return pos(clue.a) === 0 || pos(clue.a) === n - 1;
    case 'notEdge':
      return pos(clue.a) !== 0 && pos(clue.a) !== n - 1;
    default:
      throw new Error(`unknown clue ${clue.type}`);
  }
}

// Все верные улики для решения — из них генератор выбирает нужные.
export function trueClues(puzzle) {
  const { suspects, categories, solution: sol } = puzzle;
  const n = suspects.length;
  const orderK = orderIndex(puzzle);
  const people = suspects.map((_, g) => ({ g }));
  const attrs = [];
  categories.forEach((_, k) => {
    for (let v = 0; v < n; v++) attrs.push({ k, v });
  });
  const clues = [];
  const add = (clue) => {
    if (isTrue(clue, sol, n, orderK)) clues.push(clue);
  };

  for (const s of [...people, ...attrs]) {
    categories.forEach((_, k) => {
      if (s.k === k) return;
      for (let v = 0; v < n; v++) {
        add({ type: 'is', s, k, v });
        add({ type: 'not', s, k, v });
      }
    });
  }
  if (orderK < 0) return clues;
  // Про порядок прихода: «тот, кто пришёл в 21:30, пришёл раньше …» звучит странно,
  // поэтому здесь субъекты — люди и «тот, кто …» по остальным категориям.
  const named = [...people, ...attrs.filter((s) => s.k !== orderK)];
  named.forEach((a, i) => {
    add({ type: 'edge', a });
    add({ type: 'notEdge', a });
    named.forEach((b, j) => {
      if (holder(a, sol) === holder(b, sol)) return;
      if (i < j) {
        // «один за другим» симметрично — пару берём один раз
        add({ type: 'next', a, b });
        add({ type: 'notNext', a, b });
      }
      add({ type: 'left', a, b });
      add({ type: 'rightNext', a, b });
    });
  });
  return clues;
}
