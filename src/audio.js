// Звук игры целиком синтезируется в браузере (Web Audio): бесконечный тёмный эмбиент и короткие звуки действий.
// Файлов нет — нечего грузить и нечему оказаться тишиной. Звук собран из синусов и треугольников с мягкими
// огибающими: так он не может прозвучать грубо, а основная энергия лежит в 200 Гц…3 кГц — это слышно
// и в динамике телефона, и в ноутбуке (басы ниже 120 Гц там почти не звучат, они тут лишь добавка).
// Браузер не даёт играть звук до первого действия игрока, поэтому контекст создаём по первому тапу.
// Синтез принимает контекст и время параметрами — тот же код рендерится в OfflineAudioContext для проверки.

import { mulberry32 } from './rng.js';

const FADE_IN = 2.5; // секунды плавного входа музыки
const FADE_OUT = 0.8; // и выхода
const LOOKAHEAD = 1.5; // на сколько секунд вперёд планируем ноты
const TICK = 250; // мс между проходами планировщика
const TENSION_TAU = 2.5; // постоянная времени, с которой музыка догоняет новое напряжение
const IDLE_SUSPEND = 30000; // мс: музыка выключена и звуков давно не было — усыпляем контекст ради батареи

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ——— Общие куски синтеза ———

// Белый шум для звуков действий и «розовый» (мягче, меньше шипения) для ветра. Один раз на контекст.
const noiseCache = new WeakMap();
function noise(ctx) {
  let cached = noiseCache.get(ctx);
  if (cached) return cached;
  const rand = mulberry32(404);
  const white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = rand() * 2 - 1;
  // розовый шум по Полу Келлету (упрощённый): три фильтра первого порядка
  const pink = ctx.createBuffer(1, ctx.sampleRate * 10, ctx.sampleRate);
  const p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < p.length; i++) {
    const x = rand() * 2 - 1;
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2;
  }
  cached = { white, pink };
  noiseCache.set(ctx, cached);
  return cached;
}

// Импульс реверберации: стерео-шум с экспоненциальным спадом, хвост к концу темнеет (как в каменном зале).
function impulse(ctx, seconds = 3.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const pre = Math.floor(rate * 0.02); // небольшая задержка до первых отражений
  const buffer = ctx.createBuffer(2, length, rate);
  const rand = mulberry32(1888);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / rate;
      const cutoff = 7000 * Math.exp(-t * 0.9) + 900; // чем дальше, тем глуше
      const a = Math.exp((-2 * Math.PI * cutoff) / rate);
      lp = a * lp + (1 - a) * (rand() * 2 - 1);
      data[i] = lp * Math.exp((-t * 6.9) / seconds); // −60 дБ к концу
    }
  }
  return buffer;
}

// Освобождаем узлы, когда источник доиграл, — чтобы ничего не копилось за 20 минут игры.
function release(src, nodes, live) {
  live?.add(src);
  src.onended = () => {
    live?.delete(src);
    src.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

// Огибающая «удар и затухание»: быстрый вход, экспоненциальный спад до тишины.
function strike(param, t, peak, attack, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, decay / 4);
}

// Колокольчик / челеста: основной тон и тихая двенадцатая, которая гаснет быстрее. Два синуса.
function bell(ctx, dest, wet, { freq, t, peak, decay = 3.5, pan = 0, wetLevel = 0.8, live }) {
  const out = ctx.createGain();
  out.gain.value = 1;
  let node = out;
  if (pan && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner);
    node = panner;
  }
  node.connect(dest);
  const send = ctx.createGain();
  send.gain.value = wetLevel;
  node.connect(send).connect(wet);
  const nodes = [out, node, send];
  [
    [1, 1, decay],
    [3, 0.12, decay * 0.25],
  ].forEach(([ratio, amp, d], i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq * ratio;
    const env = ctx.createGain();
    strike(env.gain, t, peak * amp, 0.006, d);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + d * 1.6); // к этому моменту тон стих до −55 дБ
    // узлы колокольчика освобождаем вместе с основным тоном
    release(osc, i === 0 ? [env, ...nodes] : [env], live);
  });
}

// Короткий шумовой всплеск через фильтр — основа шорохов, чирков и вздохов.
function noiseBurst(ctx, dest, { t, dur, peak, type = 'bandpass', freq, freqEnd, q = 1, attack = 0.004, white = true }) {
  const src = ctx.createBufferSource();
  const { white: wb, pink } = noise(ctx);
  src.buffer = white ? wb : pink;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + attack);
  env.gain.setTargetAtTime(0, t + attack, Math.max(0.005, (dur - attack) / 3));
  src.connect(filter).connect(env).connect(dest);
  const offset = Math.random() * (src.buffer.duration - dur - 0.1);
  src.start(t, Math.max(0, offset));
  src.stop(t + dur * 1.5 + 0.02);
  release(src, [filter, env]);
  return env;
}

// Глухой удар: тон, быстро падающий вниз. Треугольник — чтобы у удара были обертоны, слышные в телефоне.
function thump(ctx, dest, { t, from, to, dur, peak, type = 'triangle', cutoff = 600, live }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = ctx.createGain();
  strike(env.gain, t, peak, 0.005, dur);
  osc.connect(filter).connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + dur * 1.3 + 0.02);
  release(osc, [filter, env], live);
}

// Приглушённая нота: треугольник через фильтр, мягкий вход и спад.
function softNote(ctx, dest, { freq, t, dur, peak, cutoff = 1200 }) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.03);
  env.gain.setTargetAtTime(0, t + 0.03, dur / 3);
  osc.connect(filter).connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + dur * 1.4);
  release(osc, [filter, env]);
}

// ——— Записи: карандаш по бумаге (BigSoundBank №0221, CC0; нарезка — в sfx/CREDITS.md) ———
// ✗ — два штриха, ✓ — один; по три варианта, чтобы не звучало как из пулемёта.
// Пока записи не загрузились (или не загрузятся вовсе) — звучит синтез ниже.
const SAMPLE_FILES = {
  cross: ['pencil-x1', 'pencil-x2', 'pencil-x3'],
  check: ['pencil-v1', 'pencil-v2', 'pencil-v3'],
};
const samples = {}; // имя звука → загруженные AudioBuffer

// Подставить буферы (для тестов) — или загрузить файлы для живого контекста.
export function setSamples(name, buffers) {
  samples[name] = buffers;
}
function loadSamples(ctx) {
  if (typeof fetch !== 'function') return;
  for (const [name, files] of Object.entries(SAMPLE_FILES)) {
    samples[name] = [];
    for (const file of files) {
      fetch(new URL(`../sfx/${file}.wav`, import.meta.url))
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.status))))
        // форма с колбэками — её понимает и старый Safari
        .then((data) => new Promise((done, fail) => ctx.decodeAudioData(data, done, fail)))
        .then((buffer) => samples[name].push(buffer))
        .catch(() => {});
    }
  }
}

// Сыграть случайную запись; каждый раз чуть иная скорость — штрих не повторяется буквально.
function playSample({ ctx, sfxBus }, name, t, gain = 1) {
  const list = samples[name];
  if (!list?.length) return false;
  const src = ctx.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  const rate = 0.94 + Math.random() * 0.12;
  src.playbackRate.value = rate;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(env).connect(sfxBus);
  src.start(t);
  src.stop(t + src.buffer.duration / rate + 0.02);
  release(src, [env]);
  return true;
}

// ——— Общая схема: всё сходится в мастер и компрессор-ограничитель ———

// Общая громкость относительно полной: музыка ≈ −3 дБ, звуки действий (и карандаш) ≈ −2,5 дБ.
const MUSIC_LEVEL = 0.7;
const SFX_LEVEL = 0.75;

export function buildGraph(ctx, destination = ctx.destination) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(destination);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(limiter);
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const wet = ctx.createGain(); // вход реверберации
  wet.gain.value = 1;
  const wetOut = ctx.createGain();
  wetOut.gain.value = 0.5;
  wet.connect(reverb).connect(wetOut).connect(master);
  const musicBus = ctx.createGain();
  musicBus.gain.value = 1;
  musicBus.connect(master);
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_LEVEL;
  sfxBus.connect(master);
  // посыл звуков действий в реверберацию — с той же громкостью, что и сами звуки
  const sfxWet = ctx.createGain();
  sfxWet.gain.value = SFX_LEVEL;
  sfxWet.connect(wet);
  return { ctx, master, limiter, wet, musicBus, sfxBus, sfxWet };
}

// ——— Музыка ———

// Аккорды ре минора (MIDI): Dm, B♭, Gm, Asus4, F — в регистре 350…700 Гц, его слышно и в телефоне.
// Последнее число — тревожный тон на полтона выше одного из звуков аккорда. Ре минор звучит чаще.
const CHORDS = [
  [65, 69, 74, 75],
  [65, 70, 74, 71],
  [67, 70, 74, 68],
  [69, 74, 76, 70],
  [69, 72, 77, 73],
];
const CHORD_WEIGHTS = [3, 2, 2, 1.5, 1.5];
// Ноты, по которым бродит колокольчик: натуральный ре минор, A4…D6.
const SCALE = [69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86];

// Один «оркестр» на время звучания музыки. graph — из buildGraph; rand — источник случайности.
// schedule(until) дописывает ноты до момента until, stop(at) глушит всё к моменту at.
export function createMusic(graph, rand = Math.random) {
  const { ctx } = graph;
  const live = new Set(); // все звучащие и запланированные источники — чтобы остановить их разом
  // фейдер: сухой путь и посыл в реверберацию гасятся вместе
  const dry = ctx.createGain();
  const wetSend = ctx.createGain();
  dry.connect(graph.musicBus);
  wetSend.connect(graph.wet);
  dry.gain.value = 0;
  wetSend.gain.value = 0;

  // подложка: общий фильтр, чтобы треугольники звучали мягко
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 1600;
  padFilter.Q.value = 0.4;
  const padOut = ctx.createGain();
  padOut.gain.value = 1;
  padFilter.connect(padOut);
  padOut.connect(dry);
  const padWet = ctx.createGain();
  padWet.gain.value = 0.35;
  padOut.connect(padWet).connect(wetSend);
  // тревожный тон аккорда идёт через свою шину — её громкость следует за напряжением
  const unease = ctx.createGain();
  unease.gain.value = 0;
  unease.connect(padFilter);

  // гул: ре малой октавы (треугольник через фильтр) и тихая ре большой — басы лишь добавка
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 520;
  const droneOut = ctx.createGain();
  droneOut.gain.value = 1;
  droneFilter.connect(droneOut).connect(dry);
  const drones = [
    ['triangle', midi(50), 0.022],
    ['sine', midi(38), 0.008],
  ].map(([type, freq, amp]) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = 3;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(droneFilter);
    return osc;
  });

  // ветер: розовый шум через медленно блуждающий полосовой фильтр
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 1000;
  windFilter.Q.value = 0.9;
  const windOut = ctx.createGain();
  windOut.gain.value = 1;
  windFilter.connect(windOut).connect(dry);

  let started = false;
  let nextChord = 0;
  let nextBell = 0;
  let nextWind = 0;
  let nextBeat = 0;
  let chord = 0;
  let step = 4; // где в гамме колокольчик сейчас
  let tFrom = 0;
  let tTo = 0;
  let tAt = 0;
  const tensionAt = (t) => (t <= tAt ? tFrom : tTo + (tFrom - tTo) * Math.exp(-(t - tAt) / TENSION_TAU));
  const uneaseLevel = (x) => x ** 1.3;

  function setTension(x, at, immediate = false) {
    x = clamp01(Number(x) || 0);
    tFrom = immediate ? x : tensionAt(at);
    tTo = x;
    tAt = at;
    unease.gain.cancelScheduledValues(at);
    unease.gain.setValueAtTime(uneaseLevel(tFrom), at);
    if (!immediate) unease.gain.setTargetAtTime(uneaseLevel(x), at, TENSION_TAU);
  }

  function pickChord() {
    const total = CHORD_WEIGHTS.reduce((a, b) => a + b, 0) - CHORD_WEIGHTS[chord];
    let r = rand() * total;
    for (let i = 0; i < CHORDS.length; i++) {
      if (i === chord) continue;
      r -= CHORD_WEIGHTS[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  // Аккорд: три тона по два слегка расстроенных треугольника, долгий вход и долгое затухание.
  // Плюс тревожный тон — слышен только при напряжении.
  function playChord(t) {
    const dur = 15 + rand() * 6;
    const attack = 5;
    const fade = 6;
    const end = t + dur;
    const notes = CHORDS[chord];
    const voices = notes.slice(0, 3).map((n) => [midi(n), padFilter, 0.02]);
    voices.push([midi(notes[3]), unease, 0.02]);
    for (const [freq, dest, amp] of voices) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(amp, t + attack);
      env.gain.setValueAtTime(amp, end - fade);
      env.gain.linearRampToValueAtTime(0, end);
      env.connect(dest);
      const detunes = dest === unease ? [0] : [-6, 6];
      detunes.forEach((cents, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = cents;
        osc.connect(env);
        osc.start(t);
        osc.stop(end + 0.05);
        release(osc, i === 0 ? [env] : [], live);
      });
    }
    // фильтр подложки и гул медленно «дышат» вместе со сменой аккорда
    padFilter.frequency.setTargetAtTime(1300 + rand() * 900, t, 4);
    droneOut.gain.setTargetAtTime(0.7 + rand() * 0.5, t, 5);
    nextChord = end - fade;
    chord = pickChord();
  }

  // Колокольчик бродит по гамме мелкими шагами; при напряжении иногда фальшивит на полтона.
  function playBell(t) {
    const tension = tensionAt(t);
    const moves = [-2, -1, -1, 1, 1, 2, -3, 3];
    step = Math.min(SCALE.length - 1, Math.max(0, step + moves[Math.floor(rand() * moves.length)]));
    let note = SCALE[step];
    if (rand() < 0.3 * tension) note += 1;
    const peak = 0.06 + rand() * 0.04;
    bell(ctx, dry, wetSend, { freq: midi(note), t, peak, decay: 3 + rand() * 1.5, pan: rand() * 1.2 - 0.6, wetLevel: 0.9, live });
    // иногда — тихое эхо октавой ниже
    if (rand() < 0.15) bell(ctx, dry, wetSend, { freq: midi(note - 12), t: t + 0.9, peak: peak * 0.5, decay: 3, live });
    const base = 6.5 - 3.5 * tension; // при напряжении ноты чаще
    nextBell = t + base * (0.6 + rand() * 0.8);
  }

  // Порыв ветра: кусок шума с мягким входом и выходом, следующие порывы перекрываются.
  function playWind(t) {
    const dur = 9;
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx).pink;
    const env = ctx.createGain();
    const level = 0.11 * (0.7 + 0.5 * tensionAt(t)) * (0.6 + rand() * 0.5);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 3);
    env.gain.setValueAtTime(level, t + dur - 3);
    env.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(env).connect(windFilter);
    src.start(t, rand() * (src.buffer.duration - dur));
    src.stop(t + dur);
    release(src, [env], live);
    windFilter.frequency.setTargetAtTime(700 + rand() * 1000, t + 1, 3);
    nextWind = t + dur - 3;
  }

  // Сердцебиение «тук-тук» — только у самого конца дела, громкость следует за напряжением.
  function playBeat(t) {
    const level = clamp01((tensionAt(t) - 0.65) / 0.35);
    if (level > 0.02) {
      thump(ctx, dry, { t, from: 200, to: 110, dur: 0.22, peak: 0.12 * level, cutoff: 800, live });
      thump(ctx, dry, { t: t + 0.27, from: 180, to: 100, dur: 0.2, peak: 0.075 * level, cutoff: 700, live });
    }
    nextBeat = t + 1.15;
  }

  function schedule(until) {
    if (!started) {
      const t = ctx.currentTime + 0.05;
      started = true;
      for (const osc of drones) osc.start(t);
      nextChord = t;
      nextWind = t;
      nextBell = t + 2 + rand() * 3;
      nextBeat = t;
    }
    while (nextChord < until) playChord(nextChord);
    while (nextWind < until) playWind(nextWind);
    while (nextBell < until) playBell(nextBell);
    while (nextBeat < until) playBeat(nextBeat);
  }

  function fade(to, at, seconds) {
    for (const g of [dry, wetSend]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value, at);
      g.gain.linearRampToValueAtTime(to * MUSIC_LEVEL, at + seconds); // сухой путь и реверберация музыки
    }
  }

  function stop(at) {
    for (const src of [...live, ...(started ? drones : [])]) {
      try {
        src.stop(at);
      } catch {
        // старый Safari не даёт вызвать stop дважды — источник и так затихнет под нулевым фейдером
      }
    }
    const nodes = [dry, wetSend, padFilter, padOut, padWet, unease, droneFilter, droneOut, windFilter, windOut];
    const unplug = () => nodes.forEach((node) => node.disconnect());
    if (started) drones[0].onended = unplug;
    else unplug();
  }

  return { schedule, setTension, fade, stop, live };
}

// ——— Звуки действий ———

// Каждый звук: (graph, t) → планирует себя на момент t. Уровни подобраны по замерам офлайн-рендера.
const SFX = {
  // ✗ карандашом: запись двух штрихов, иначе — два коротких шумовых штриха
  cross(graph, t) {
    if (playSample(graph, 'cross', t)) return;
    const { ctx, sfxBus } = graph;
    noiseBurst(ctx, sfxBus, { t, dur: 0.05, peak: 0.34, freq: 3200, freqEnd: 2200, q: 1.4 });
    noiseBurst(ctx, sfxBus, { t: t + 0.035, dur: 0.045, peak: 0.2, freq: 2600, freqEnd: 1700, q: 1.4 });
  },
  // ✓ карандашом: запись одного штриха, иначе — «тук» в два касания
  check(graph, t) {
    if (playSample(graph, 'check', t)) return;
    const { ctx, sfxBus } = graph;
    thump(ctx, sfxBus, { t, from: 1500, to: 1100, dur: 0.03, peak: 0.09, type: 'sine', cutoff: 4000 });
    thump(ctx, sfxBus, { t: t + 0.055, from: 820, to: 560, dur: 0.09, peak: 0.2, type: 'triangle', cutoff: 2200 });
  },
  // стирание: мягкий шорох
  clear({ ctx, sfxBus }, t) {
    noiseBurst(ctx, sfxBus, { t, dur: 0.11, peak: 0.12, type: 'lowpass', freq: 1800, freqEnd: 900, q: 0.5, attack: 0.03 });
  },
  // нельзя: глухой маленький удар
  blocked({ ctx, sfxBus }, t) {
    thump(ctx, sfxBus, { t, from: 320, to: 170, dur: 0.09, peak: 0.15, cutoff: 900 });
  },
  // выбор улики: едва слышный щелчок
  select({ ctx, sfxBus }, t) {
    thump(ctx, sfxBus, { t, from: 2400, to: 1900, dur: 0.018, peak: 0.07, type: 'sine', cutoff: 6000 });
  },
  // улика исчерпана: шелест бумаги
  done({ ctx, sfxBus }, t) {
    noiseBurst(ctx, sfxBus, { t, dur: 0.06, peak: 0.25, freq: 2400, freqEnd: 4200, q: 0.8, attack: 0.01 });
    noiseBurst(ctx, sfxBus, { t: t + 0.05, dur: 0.08, peak: 0.18, freq: 3500, freqEnd: 1800, q: 0.8, attack: 0.01 });
  },
  // столбец времени закрыт: два тихих колокольчика
  lock({ ctx, sfxBus, wet }, t) {
    bell(ctx, sfxBus, wet, { freq: midi(69), t, peak: 0.13, decay: 1.8, pan: -0.2 });
    bell(ctx, sfxBus, wet, { freq: midi(74), t: t + 0.16, peak: 0.13, decay: 2.2, pan: 0.2 });
  },
  // подсказка: одна стеклянная нота
  hint({ ctx, sfxBus, wet }, t) {
    bell(ctx, sfxBus, wet, { freq: midi(86), t, peak: 0.12, decay: 2, wetLevel: 1 });
  },
  // неверное обвинение: низкое фальшивое жужжание (ре, ми-бемоль и тритон) и удар
  wrong({ ctx, sfxBus }, t) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.02);
    env.gain.setValueAtTime(0.05, t + 0.3);
    env.gain.linearRampToValueAtTime(0, t + 0.5);
    filter.connect(env).connect(sfxBus);
    [midi(50), midi(51), midi(56)].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.52);
      release(osc, i === 0 ? [filter, env] : []);
    });
    thump(ctx, sfxBus, { t, from: 220, to: 110, dur: 0.18, peak: 0.2, cutoff: 700 });
  },
  // дело раскрыто: тяжёлый удар штампа, потом восходящая фигура колокольчиков, разрешающаяся в тонику
  solved({ ctx, sfxBus, wet }, t) {
    thump(ctx, sfxBus, { t, from: 240, to: 90, dur: 0.25, peak: 0.25, cutoff: 900 });
    noiseBurst(ctx, sfxBus, { t, dur: 0.07, peak: 0.18, type: 'lowpass', freq: 1400, q: 0.6, attack: 0.002 });
    [62, 65, 69, 74].forEach((n, i) => {
      bell(ctx, sfxBus, wet, { freq: midi(n), t: t + 0.45 + i * 0.17, peak: i === 3 ? 0.09 : 0.07, decay: i === 3 ? 3 : 1.6 });
    });
  },
  // сдался: две нисходящие приглушённые ноты
  gaveup({ ctx, sfxBus }, t) {
    softNote(ctx, sfxBus, { freq: midi(65), t, dur: 0.45, peak: 0.2 });
    softNote(ctx, sfxBus, { freq: midi(62), t: t + 0.32, dur: 0.8, peak: 0.2 });
  },
  // открылся лист: тихий низкий вздох
  open({ ctx, sfxBus }, t) {
    noiseBurst(ctx, sfxBus, { t, dur: 0.28, peak: 0.16, type: 'bandpass', freq: 400, freqEnd: 1200, q: 0.8, attack: 0.1, white: false });
  },
};

export const SFX_NAMES = Object.keys(SFX);

export function playSfx(graph, name, t = graph.ctx.currentTime) {
  if (!SFX_NAMES.includes(name)) return false;
  SFX[name]({ ...graph, wet: graph.sfxWet }, t);
  return true;
}

// Рендер без колонок — для проверки уровней и спектра: музыка за seconds секунд или один звук.
// OfflineAudioContext передаётся параметром: в браузере он глобальный, в Node — из пакета.
export async function renderPreview({ seconds = 10, tension = 0, sfx: name = null, sampleRate = 44100, seed = 1, OfflineAudioContext: Offline = globalThis.OfflineAudioContext } = {}) {
  const ctx = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = buildGraph(ctx);
  let music = null;
  if (name) playSfx(graph, name, 0.02);
  else {
    music = createMusic(graph, mulberry32(seed));
    music.setTension(tension, 0, true);
    music.fade(1, 0, 0.01);
    music.schedule(seconds);
  }
  return { buffer: await ctx.startRendering(), graph, music };
}

// ——— Живой звук в браузере ———

let getPrefs = null;
let ctx = null;
let graph = null;
let music = null; // текущий оркестр, пока музыка включена
let timer = null;
let tension = 0;
let idleTimer = null;
let lastPlaying = false;
const listeners = new Set();

const prefs = () => {
  try {
    return { music: false, sfx: false, ...getPrefs?.() };
  } catch {
    return { music: false, sfx: false };
  }
};
const hidden = () => typeof document !== 'undefined' && document.hidden;
const AudioCtor = () => globalThis.AudioContext || globalThis.webkitAudioContext;

function notify() {
  const playing = isMusicPlaying();
  if (playing === lastPlaying) return;
  lastPlaying = playing;
  for (const fn of listeners) {
    try {
      fn(playing);
    } catch {
      // ошибка подписчика не должна ломать звук
    }
  }
}

// Создаём контекст и будим его. Вызывается только из действия игрока — иначе браузер не разрешит.
function unlock() {
  const Ctor = AudioCtor();
  if (!Ctor) return false;
  try {
    if (!ctx) {
      // на iPhone без этого Web Audio молчит при включённом беззвучном режиме
      if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback';
      ctx = new Ctor();
      graph = buildGraph(ctx);
      loadSamples(ctx);
      ctx.onstatechange = () => notify();
      // старому iOS нужен хотя бы один проигранный буфер внутри жеста
      const blank = ctx.createBufferSource();
      blank.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      blank.connect(ctx.destination);
      blank.start(0);
    }
    if (ctx.state !== 'running' && !hidden()) ctx.resume().then(sync, () => {});
    return true;
  } catch {
    ctx = null;
    graph = null;
    return false;
  }
}

function tick() {
  if (!music) return;
  if (ctx.state === 'running') music.schedule(ctx.currentTime + LOOKAHEAD);
  timer = setTimeout(tick, TICK);
}

// Свести звук к настройкам: включить или погасить музыку, усыпить контекст, когда он не нужен.
function sync() {
  if (!ctx) return;
  const want = prefs();
  const now = ctx.currentTime;
  if (want.music && !music) {
    music = createMusic(graph);
    music.setTension(tension, now, true);
    music.fade(1, now, FADE_IN);
    tick();
  } else if (!want.music && music) {
    const old = music;
    music = null;
    clearTimeout(timer);
    old.fade(0, now, FADE_OUT);
    old.stop(now + FADE_OUT + 0.05);
  }
  clearTimeout(idleTimer);
  if (!music) idleTimer = setTimeout(sleep, want.sfx ? IDLE_SUSPEND : (FADE_OUT + 0.3) * 1000);
  notify();
}

function sleep() {
  if (ctx && !music && ctx.state === 'running') ctx.suspend().then(notify, () => {});
}

export function setupAudio(fn) {
  getPrefs = fn;
  if (typeof document === 'undefined' || !AudioCtor()) return;
  // Браузеры по-разному считают «действием»: на телефонах — когда палец отпущен (pointerup / touchend / click),
  // на компьютере — клик или клавиша. Слушаем всё и не снимаем: iOS может снова усыпить звук (звонок, свернули).
  const handler = (event) => {
    if (ctx && ctx.state === 'running') return;
    const want = prefs();
    if (!want.music && !want.sfx) return;
    if (!unlock()) return;
    // кнопка музыки сама вызовет refreshAudio — не запускаем музыку, которую она сейчас выключит
    if (event.target?.closest?.('[data-act="sound"]')) return;
    if (ctx.state === 'running') sync();
  };
  for (const name of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(name, handler, true);
  // Свернули вкладку — пауза; вернулись — продолжаем, если звук нужен.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().then(notify, () => {});
    else if (prefs().music || prefs().sfx) ctx.resume().then(sync, () => {});
  });
}

export function refreshAudio() {
  if (!getPrefs) return;
  const want = prefs();
  if (want.music || want.sfx) {
    if (!unlock()) return;
    if (ctx.state === 'running') sync();
    // иначе sync позовёт resume(), когда контекст проснётся
  } else sync();
}

export function sfx(name) {
  if (!ctx || !SFX_NAMES.includes(name) || !prefs().sfx || hidden()) return;
  try {
    // контекст мог уснуть от бездействия — звук прозвучит, как только он проснётся
    if (ctx.state !== 'running') ctx.resume().then(sync, () => {});
    playSfx(graph, name, ctx.currentTime + 0.005);
    if (!music) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(sleep, IDLE_SUSPEND);
    }
  } catch {
    // звук — украшение, игра работает и без него
  }
}

export function setTension(x) {
  tension = clamp01(Number(x) || 0);
  if (music && ctx) music.setTension(tension, ctx.currentTime);
}

export const isMusicPlaying = () => Boolean(ctx && music && ctx.state === 'running');

export function onAudioChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
