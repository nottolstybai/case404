import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as audio from '../src/audio.js';
import { mulberry32 } from '../src/rng.js';

// Модуль импортируется и в Node без браузера — его тянут тесты экрана. Здесь нет ни document, ни AudioContext.

test('без браузера все функции звука — тихие заглушки', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  audio.setupAudio(() => ({ music: true, sfx: true }));
  audio.refreshAudio();
  audio.sfx('cross');
  audio.sfx('nonsense');
  audio.sfx();
  audio.setTension(0.5);
  audio.setTension(NaN);
  audio.setTension(7);
  assert.equal(audio.isMusicPlaying(), false);
  const off = audio.onAudioChange(() => {});
  assert.equal(typeof off, 'function');
  off();
});

test('есть все звуки действий, неизвестное имя молча пропускается', () => {
  const names = ['cross', 'check', 'clear', 'blocked', 'select', 'done', 'lock', 'hint', 'wrong', 'solved', 'gaveup', 'open'];
  assert.deepEqual([...audio.SFX_NAMES].sort(), [...names].sort());
  assert.equal(audio.playSfx({ ctx: { currentTime: 0 } }, 'nonsense'), false);
  assert.equal(audio.playSfx({ ctx: { currentTime: 0 } }, 'toString'), false);
});

// Поддельный контекст Web Audio: узлы ничего не звучат, но запоминают, когда источники стартуют и останавливаются.
function fakeContext(sampleRate = 4000) {
  const sources = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v) {
      assert.ok(v > 0, 'экспоненциальная огибающая не может идти к нулю');
    },
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({
    connect: (next) => next,
    disconnect() {},
    ...extra,
  });
  const source = (kind) => {
    const rec = { kind, start: null, stop: null };
    sources.push(rec);
    return node({
      frequency: param(440),
      detune: param(),
      playbackRate: param(1),
      start(t = 0) {
        rec.start = t;
      },
      stop(t = 0) {
        rec.stop = t;
      },
    });
  };
  const ctx = {
    sampleRate,
    currentTime: 0,
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1) }),
    createStereoPanner: () => node({ pan: param() }),
    createConvolver: () => node({ buffer: null }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createOscillator: () => source('osc'),
    createBufferSource: () => source('buffer'),
    createBuffer: (channels, length, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate: rate, duration: length / rate, getChannelData: (ch) => data[ch] };
    },
  };
  return { ctx, sources };
}

// Сколько осцилляторов звучит одновременно в худший момент.
function peakOscillators(sources, end) {
  const events = [];
  for (const s of sources) {
    if (s.kind !== 'osc' || s.start === null) continue;
    events.push([s.start, 1], [Math.min(s.stop ?? end, end), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, d] of events) max = Math.max(max, (now += d));
  return max;
}

test('каждый звук действия что-то запускает и сам останавливается', () => {
  for (const name of audio.SFX_NAMES) {
    const { ctx, sources } = fakeContext();
    assert.equal(audio.playSfx(audio.buildGraph(ctx), name, 1), true);
    assert.ok(sources.length > 0, name);
    for (const s of sources) {
      assert.ok(s.start >= 1, name);
      assert.ok(s.stop > s.start && s.stop < 1 + 8, `${name}: источник должен остановиться за несколько секунд`);
    }
  }
});

test('карандаш: если записи загружены, ✗ и ✓ играют запись и сами останавливаются', () => {
  for (const name of ['cross', 'check']) {
    const { ctx, sources } = fakeContext();
    audio.setSamples(name, [ctx.createBuffer(1, 1000, 4000)]);
    assert.equal(audio.playSfx(audio.buildGraph(ctx), name, 1), true);
    const played = sources.filter((s) => s.start !== null);
    assert.equal(played.length, 1, `${name}: одна запись, без синтеза`);
    assert.ok(played[0].stop > 1 && played[0].stop < 1.4, name);
    audio.setSamples(name, []); // остальные тесты — на синтезе
  }
});

test('музыка: всё запланированное останавливается, осцилляторов немного', () => {
  for (const tension of [0, 1]) {
    const { ctx, sources } = fakeContext();
    const music = audio.createMusic(audio.buildGraph(ctx), mulberry32(5));
    music.setTension(tension, 0, true);
    music.fade(1, 0, 2.5);
    // как в браузере: планировщик понемногу дописывает ноты вперёд
    for (let t = 0; t < 300; t += 0.25) {
      ctx.currentTime = t;
      music.schedule(t + 1.5);
    }
    assert.ok(peakOscillators(sources, 300) <= 25, `напряжение ${tension}`);
    // постоянный гул без конца, всё остальное — с концом
    assert.equal(sources.filter((s) => s.stop === null).length, 2);
    music.stop(300);
    assert.ok(sources.every((s) => s.stop !== null && s.stop <= 330));
  }
});

test('при напряжении нот больше и появляется сердцебиение', () => {
  const count = (tension) => {
    const { ctx, sources } = fakeContext();
    const music = audio.createMusic(audio.buildGraph(ctx), mulberry32(9));
    music.setTension(tension, 0, true);
    music.schedule(120);
    return sources.filter((s) => s.kind === 'osc').length;
  };
  assert.ok(count(1) > count(0) * 1.5);
});
