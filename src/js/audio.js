/**
 * Efectos de sonido de 8 bits generados con WebAudio (sin archivos de audio).
 * El contexto se crea con el primer toque del jugador (los navegadores lo exigen).
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const Audio = GM.Audio = { muted: false, vol: 0.5 };
  let ac = null, master = null;
  const lastPlay = {};

  /** Crea el contexto de audio (llamar desde un gesto del usuario). */
  Audio.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = root.AudioContext || root.webkitAudioContext;
    if (!C) return;
    try {
      ac = new C();
      master = ac.createGain();
      master.gain.value = Audio.vol * 0.35;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  };

  /** Ajusta volumen (0-1) y silencio. */
  Audio.set = function (muted, vol) {
    Audio.muted = !!muted; Audio.vol = vol;
    if (master) master.gain.value = Audio.vol * 0.35;
  };

  function tone(freq, dur, type, vol, delay, slideTo) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; g.gain.value = vol || 0.2;
    src.connect(g); g.connect(master); src.start(t0);
  }

  const SOUNDS = {
    hit() { tone(180, 0.06, 'square', 0.14, 0, 90); },
    tap() { tone(320, 0.05, 'square', 0.12, 0, 200); },
    coin() { tone(988, 0.07, 'square', 0.12); tone(1319, 0.12, 'square', 0.12, 0.06); },
    buy() { tone(523, 0.06, 'square', 0.14); tone(784, 0.09, 'square', 0.14, 0.05); },
    deny() { tone(150, 0.12, 'sawtooth', 0.14, 0, 100); },
    cast() { tone(440, 0.25, 'triangle', 0.22, 0, 1200); },
    kill() { tone(300, 0.08, 'square', 0.1, 0, 600); },
    down() { tone(220, 0.3, 'sawtooth', 0.18, 0, 60); },
    wipe() { noise(0.4, 0.22); tone(200, 0.5, 'sawtooth', 0.2, 0, 50); },
    boss() { tone(110, 0.5, 'sawtooth', 0.25, 0, 55); noise(0.3, 0.15); },
    ach() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.15, i * 0.08)); },
    ascend() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'square', 0.16, i * 0.1)); },
    ending() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, i * 0.18)); },
    unlock() { tone(660, 0.1, 'square', 0.14); tone(880, 0.16, 'square', 0.14, 0.08); },
  };

  /**
   * Reproduce un efecto (con límite de frecuencia para no saturar).
   * @param {string} name
   */
  Audio.play = function (name) {
    if (!ac || Audio.muted || ac.state !== 'running') return;
    const now = ac.currentTime;
    const gap = name === 'hit' || name === 'kill' ? 0.08 : 0.03;
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    const f = SOUNDS[name];
    if (f) { try { f(); } catch (e) { /* sin audio */ } }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
