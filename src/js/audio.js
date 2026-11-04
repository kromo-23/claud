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
      musicGain = ac.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(master);
    } catch (e) { ac = null; }
  };

  /** Ajusta volumen (0-1) y silencio. */
  Audio.set = function (muted, vol) {
    Audio.muted = !!muted; Audio.vol = vol;
    if (master) master.gain.value = Audio.vol * 0.35;
  };

  let musicGain = null;
  function tone(freq, dur, type, vol, delay, slideTo, dest) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
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
    crit() { tone(880, 0.05, 'square', 0.16); tone(1320, 0.09, 'square', 0.16, 0.04); noise(0.06, 0.1); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 'square', 0.13, i * 0.05)); },
    milestone() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.15, i * 0.06)); noise(0.2, 0.12); },
    chestShake() { for (let i = 0; i < 7; i++) tone(140 + (i % 2) * 40, 0.05, 'square', 0.12, i * 0.09); },
    chestOpen() { tone(300, 0.25, 'sawtooth', 0.14, 0, 900); noise(0.15, 0.12, 0.05); },
    reveal0() { tone(660, 0.08, 'square', 0.12); },
    reveal1() { tone(660, 0.07, 'square', 0.13); tone(880, 0.1, 'square', 0.13, 0.06); },
    reveal2() { [523, 659, 880, 1175].forEach((f, i) => tone(f, 0.09, 'square', 0.14, i * 0.06)); },
    reveal3() { [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, i * 0.09)); noise(0.3, 0.1, 0.1); },
    quest() { [587, 740, 880].forEach((f, i) => tone(f, 0.1, 'square', 0.13, i * 0.07)); },
    frenzy() { tone(180, 0.7, 'sawtooth', 0.2, 0, 1500); noise(0.4, 0.14, 0.1); },
    frenzyReady() { tone(660, 0.07, 'square', 0.12); tone(990, 0.07, 'square', 0.12, 0.07); tone(1320, 0.12, 'square', 0.12, 0.14); },
    gobSpawn() { [1319, 1568, 1319, 1568].forEach((f, i) => tone(f, 0.06, 'square', 0.1, i * 0.07)); },
    gobHit() { tone(700, 0.05, 'square', 0.14, 0, 1000); },
    gobCaught() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.1, 'square', 0.15, i * 0.06)); noise(0.2, 0.1, 0.2); },
    daily() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.16, i * 0.09)); },
    click() { tone(500, 0.03, 'square', 0.06); },
  };

  /**
   * Reproduce un efecto (con límite de frecuencia para no saturar).
   * @param {string} name
   */
  Audio.play = function (name, arg) {
    if (!ac || Audio.muted || ac.state !== 'running') return;
    const now = ac.currentTime;
    const gap = name === 'hit' || name === 'kill' || name === 'crit' ? 0.08 : 0.03;
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    const f = SOUNDS[name];
    if (f) { try { f(arg); } catch (e) { /* sin audio */ } }
  };

  /** Pitido de combo: sube de tono con la racha. */
  Audio.combo = function (n) {
    if (!ac || Audio.muted || ac.state !== 'running') return;
    if (n < 3 || n % 3) return;
    const semis = Math.min(24, Math.floor(n / 3));
    tone(440 * Math.pow(2, semis / 12), 0.07, 'square', 0.09);
  };

  /* ------------------------------------------------------------------ música */

  const MIDI = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], hminor: [0, 2, 3, 5, 7, 8, 11] };
  /** Una melodía de fondo por zona: raíz MIDI, escala, tempo y frase (grados de la escala; -1 = silencio). */
  const ZONE_MUSIC = [
    { root: 57, scale: 'minor', bpm: 96, arp: [0, 2, 4, 2], phrase: [4, -1, 2, -1, 0, -1, 2, 3, 4, -1, 6, -1, 4, 2, 1, -1] },
    { root: 60, scale: 'major', bpm: 116, arp: [0, 2, 4, 5], phrase: [4, 2, 4, 5, 4, 2, 0, -1, 2, 4, 5, 6, 5, 4, 2, -1] },
    { root: 50, scale: 'dorian', bpm: 88, arp: [0, 3, 4, 3], phrase: [2, -1, -1, 4, 3, -1, 1, -1, 2, -1, 4, -1, 6, 5, 4, -1] },
    { root: 52, scale: 'hminor', bpm: 132, arp: [0, 2, 4, 6], phrase: [4, 4, 5, 6, 4, -1, 2, 3, 4, 4, 6, 7, 6, 5, 4, -1] },
    { root: 54, scale: 'minor', bpm: 118, arp: [0, 4, 2, 4], phrase: [7, -1, 6, 4, 2, -1, 4, 6, 7, 9, 7, -1, 6, 4, 2, 0] },
  ];
  let mus = null;
  Audio.musicOn = true;

  function stopMusic() { if (mus) { clearInterval(mus.timer); mus = null; } }

  function musicStep() {
    if (!mus || !ac || ac.state !== 'running' || Audio.muted || !Audio.musicOn) return;
    const z = mus.z, sc = SCALES[z.scale], st = mus.step++ % 32;
    const deg = (d) => z.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    if (st % 8 === 0) tone(MIDI(z.root - 12 + (st >= 16 ? sc[3] : 0)), 0.5, 'triangle', 0.13, 0, undefined, musicGain);
    if (st % 2 === 0) tone(MIDI(deg(z.arp[(st / 2) % 4]) + 12), 0.1, 'square', 0.035, 0, undefined, musicGain);
    const n = z.phrase[st % 16];
    if (n >= 0 && st % 2 === 0) tone(MIDI(deg(n) + 12), 0.22, 'triangle', 0.075, 0, undefined, musicGain);
  }

  /**
   * Pone (o mantiene) la música de una zona. Se llama en cada refresco: solo reinicia si cambia la zona.
   * @param {number} zone Índice de zona 0-4.
   */
  Audio.music = function (zone) {
    if (!ac || Audio.muted || !Audio.musicOn) { stopMusic(); return; }
    if (mus && mus.zone === zone) return;
    stopMusic();
    const z = ZONE_MUSIC[Math.max(0, Math.min(4, zone))];
    mus = { zone: zone, z: z, step: 0, timer: setInterval(musicStep, 60000 / z.bpm / 2) };
  };
  /** Silencia la música (p. ej. con la pestaña oculta) sin perder la zona. */
  Audio.pauseMusic = function () { stopMusic(); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
