// Фоновая музыка: фрагмент «Drone in D» (Kevin MacLeod, incompetech.com, CC BY 4.0), 90 секунд.
// Зацикливаем через Web Audio: следующий проход начинается за FADE секунд до конца предыдущего
// и плавно перетекает в него — без паузы и щелчка на стыке.
// Браузеры не дают играть звук до первого действия игрока, поэтому старт — по первому тапу.

const SRC = 'music/drone-v1.mp3';
const VOLUME = 0.32; // тихо: музыка на фоне, не поверх
const FADE = 4; // секунды перетекания на стыке
const RAMP = 2.5; // секунды нарастания и затухания при включении/выключении

let ctx = null;
let master = null;
let buffer = null;
let loading = null;
let nextStart = 0;
let timer = null;
let wanted = false; // игрок хочет музыку (и уже было действие на странице)

async function load() {
  if (buffer) return buffer;
  loading ??= fetch(SRC)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((decoded) => (buffer = decoded));
  return loading;
}

// Один проход трека: плавно входит, плавно выходит.
function scheduleOne(at) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const end = at + buffer.duration;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(1, at + FADE);
  gain.gain.setValueAtTime(1, end - FADE);
  gain.gain.linearRampToValueAtTime(0, end);
  source.connect(gain).connect(master);
  source.start(at);
  source.stop(end);
}

// Держим запланированным следующий проход. Пока контекст на паузе, его время стоит — лишнего не планируем.
function tick() {
  if (ctx.state === 'running') {
    while (nextStart < ctx.currentTime + FADE + 1) {
      scheduleOne(nextStart);
      nextStart += buffer.duration - FADE;
    }
  }
  timer = setTimeout(tick, 1000);
}

export async function startMusic() {
  wanted = true;
  try {
    ctx ??= new AudioContext();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    await ctx.resume();
    await load();
    if (!wanted) return; // успели выключить, пока грузилось
    if (!timer) {
      nextStart = ctx.currentTime + 0.05;
      tick();
    }
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(VOLUME, now + RAMP);
  } catch {
    // нет Web Audio или файл не загрузился — играем без музыки
  }
}

export function stopMusic() {
  wanted = false;
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 0.8);
  setTimeout(() => {
    if (!wanted) ctx.suspend();
  }, 900);
}

// Свернули вкладку — пауза; вернулись — продолжаем, если музыка включена.
document.addEventListener('visibilitychange', () => {
  if (!ctx || !wanted) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});
