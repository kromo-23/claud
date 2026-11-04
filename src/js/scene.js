/**
 * Escena de combate dibujada en un canvas de 256x144 píxeles lógicos:
 * fondo por zona, héroes, enemigo, partículas y efectos. Solo navegador.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const W = 256, H = 144;
  const FEET = 114;                         // y de los pies de los personajes
  const Scene = GM.Scene = {};

  let cv = null, ctx = null, k = 2, last = 0, time = 0;
  const bgCache = {};
  const A = {
    heroes: {},
    enemy: { key: '', spawnT: 0, hitT: 0, deadT: 0, sprite: null, scale: 2, tint: null },
    parts: [], proj: [], shake: 0, flash: 0, bolt: 0,
    amb: [],
  };
  /** Callback que asigna la interfaz para mostrar textos flotantes: (xLógica, yLógica, texto, clase). */
  Scene.onFloat = null;

  const MELEE = { guerrero: true, ladrona: true, bardo: true };
  const PROJ_COLOR = { maga: '#73eff7', arquero: '#f4f4f4', clerigo: '#ffcd75' };

  function hero(id) {
    return A.heroes[id] || (A.heroes[id] = { lunge: 0, hurt: 0, cast: 0, hp: 1, seed: Math.random() * 6 });
  }

  /**
   * Prepara el canvas.
   * @param {HTMLCanvasElement} canvas
   */
  Scene.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    Scene.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(Scene.resize).observe(cv);
    for (let i = 0; i < 28; i++) A.amb.push({ x: Math.random() * W, y: Math.random() * H, v: 0.3 + Math.random(), s: 1 + Math.random() * 1.4, p: Math.random() * 6 });
  };

  /** Ajusta la resolución real del canvas a un múltiplo entero de la lógica (píxeles nítidos). */
  Scene.resize = function () {
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    k = Math.max(2, Math.round((rect.width * dpr) / W));
    cv.width = W * k; cv.height = H * k;
    ctx.imageSmoothingEnabled = false;
  };

  function bg(kind) {
    return bgCache[kind] || (bgCache[kind] = GM.makeBackground(kind, W, H));
  }

  /** Posición de un héroe según su orden en el equipo (visual). */
  function heroPos(i) { return { x: 104 - i * 27, y: FEET - 32 + (i % 2) * 5 }; }
  const ENEMY_X = 178;

  /**
   * Procesa un evento del motor (hit, kill, spawn...).
   * @param {object} s Estado.
   * @param {object} e Evento.
   */
  Scene.event = function (s, e) {
    const f = Scene.onFloat;
    switch (e.t) {
      case 'spawn': {
        const en = e.enemy, E = A.enemy;
        E.spawnT = 0.4; E.deadT = 0; E.hitT = 0;
        E.sprite = en.sprite;
        E.scale = en.boss === 3 ? 4 : en.boss >= 1 ? 3 : 2;
        E.tint = en.golden ? 'gold' : en.boss === 1 ? 'red' : null;
        break;
      }
      case 'hit': {
        const idx = s.party.indexOf(e.id);
        const h = hero(e.id);
        if (idx >= 0) {
          const p = heroPos(Math.max(0, s.party.filter((x, i) => x && i < idx).length));
          if (MELEE[e.id]) h.lunge = 0.18;
          else A.proj.push({ x: p.x + 28, y: p.y + 14, t: 0, c: PROJ_COLOR[e.id] || '#fff', big: !!e.big });
        }
        A.enemy.hitT = 0.1;
        if (f && e.v > 0) f(ENEMY_X + (Math.random() * 14 - 7), 60 + Math.random() * 10, GM.fmt(e.v), e.big ? 'big' : '');
        break;
      }
      case 'tap':
        A.enemy.hitT = 0.08;
        break;
      case 'kill': {
        A.enemy.deadT = 0.35;
        for (let i = 0; i < (e.boss ? 14 : 6); i++) {
          A.parts.push({ x: ENEMY_X, y: 88, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, t: 0, life: 0.9, c: e.golden ? '#ffcd75' : '#ffcd75', s: 2 });
        }
        if (f) f(ENEMY_X, 52, '+' + GM.fmt(e.gold), 'gold');
        if (e.crystals && f) f(ENEMY_X, 40, '+' + e.crystals + ' 💎', 'gem');
        if (e.boss) A.shake = 0.3;
        break;
      }
      case 'cast': {
        hero(e.id).cast = 0.5;
        const idx = s.party.indexOf(e.id);
        const p = heroPos(Math.max(0, s.party.filter((x, i) => x && i < idx).length));
        const h = GM.HERO_BY_ID[e.id];
        if (f) f(p.x + 16, p.y - 6, h.ability.name, 'cast');
        break;
      }
      case 'wipe': A.shake = 0.4; A.flash = 0.5; break;
      case 'bossDown': A.shake = 0.5; break;
      case 'ending': A.flash = 1; break;
      default:
    }
  };

  function drawSprite(name, x, y, scale, tint, alpha, flipX) {
    const c = GM.spriteCanvas(name, tint);
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    if (flipX) { ctx.translate(x + 16 * scale, y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, 16 * scale, 16 * scale); } else {
      ctx.drawImage(c, Math.round(x), Math.round(y), 16 * scale, 16 * scale);
    }
    ctx.restore();
  }

  /** Escudito sobre el héroe que recibe los golpes (el tanque). */
  function shieldIcon(x, y) {
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - 1, y - 1, 8, 8);
    ctx.fillStyle = '#41a6f6'; ctx.fillRect(x, y, 6, 4);
    ctx.fillStyle = '#73eff7'; ctx.fillRect(x, y, 6, 1);
    ctx.fillStyle = '#41a6f6'; ctx.fillRect(x + 1, y + 4, 4, 1); ctx.fillRect(x + 2, y + 5, 2, 1);
  }

  function bar(x, y, w, frac, col) {
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, Math.round(w * frac)), 2);
  }

  function ambient(zone, dt, s) {
    const kind = GM.ZONES[zone].bg;
    for (const a of A.amb) {
      a.p += dt;
      if (kind === 'volcan') { a.y -= a.v * 18 * dt; a.x += Math.sin(a.p * 2) * 4 * dt; if (a.y < -2) { a.y = H; a.x = Math.random() * W; } }
      else if (kind === 'bosque') { a.x += Math.sin(a.p) * 6 * dt; a.y += Math.cos(a.p * 0.7) * 4 * dt; }
      else if (kind === 'cripta') { a.x += a.v * 5 * dt; if (a.x > W) a.x = -2; }
      else if (kind === 'torre') { a.y += a.v * 22 * dt; if (a.y > H) { a.y = -2; a.x = Math.random() * W; } }
      else { a.y += a.v * 3 * dt; a.x += Math.sin(a.p) * 2 * dt; if (a.y > H) a.y = 0; }
      const col = kind === 'volcan' ? '#ffa13a' : kind === 'bosque' ? '#e6ff8a' : kind === 'cripta' ? '#9aa8c8' : kind === 'torre' ? '#b7c4ff' : '#8a7aa8';
      ctx.globalAlpha = kind === 'cripta' ? 0.25 : 0.7;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(a.x), Math.round(a.y), a.s > 2 ? 2 : 1, a.s > 2 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Dibuja un fotograma.
   * @param {object} s Estado del juego.
   * @param {number} now Marca de tiempo (ms).
   */
  Scene.draw = function (s, now) {
    if (!ctx) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now; time += dt;
    const r = s.run;
    const zi = GM.zoneIndex(r.floor);
    const zone = GM.ZONES[zi];
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let ox = 0, oy = 0;
    if (A.shake > 0) { A.shake -= dt; ox = Math.round((Math.random() - 0.5) * 4); oy = Math.round((Math.random() - 0.5) * 3); }
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(bg(zone.bg), 0, 0);
    ambient(zi, dt, s);

    // Relámpago en la torre.
    if (zone.bg === 'torre' && r.floor % 20 === 0) {
      A.bolt -= dt;
      if (A.bolt < -2.5 && Math.random() < 0.02) A.bolt = 0.12;
      if (A.bolt > 0) { ctx.fillStyle = 'rgba(220,230,255,0.35)'; ctx.fillRect(0, 0, W, H); }
    }

    // Héroes.
    const party = s.party.filter((id) => id && s.heroes[id].lvl > 0);
    const D = GM.D(s);
    if (s.fx.shieldT > 0) {
      ctx.fillStyle = 'rgba(65,166,246,0.22)';
      const lx = heroPos(party.length - 1).x - 4, rx = heroPos(0).x + 36;
      ctx.fillRect(lx, FEET - 40, rx - lx, 44);
      ctx.strokeStyle = 'rgba(115,239,247,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(lx + 0.5, FEET - 39.5, rx - lx - 1, 43);
    }
    const tankId = r.enemy ? GM.tankId(s) : null;
    party.forEach((id, i) => {
      const hs = s.heroes[id], h = hero(id), p = heroPos(i);
      h.lunge = Math.max(0, h.lunge - dt); h.cast = Math.max(0, h.cast - dt); h.hurt = Math.max(0, h.hurt - dt);
      if (hs.hpf < h.hp - 0.001) h.hurt = 0.1;
      h.hp = hs.hpf;
      let x = p.x, y = p.y;
      if (hs.down) {
        ctx.save();
        ctx.translate(x + 16, y + 28); ctx.rotate(-Math.PI / 2); ctx.translate(-16, -28);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(GM.spriteDown(id), 0, 0, 32, 32);
        ctx.restore();
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x + 12, y + 6 + Math.round(Math.sin(time * 4) * 1), 2, 2); // estrellitas
        return;
      }
      if (r.enemy) x += Math.round(Math.sin((h.lunge / 0.18) * Math.PI) * 9);
      y += Math.round(Math.sin(time * 3 + h.seed) * 1);
      if (h.cast > 0) { ctx.fillStyle = 'rgba(255,205,117,' + (h.cast).toFixed(2) + ')'; ctx.fillRect(x + 4, y + 30, 24, 2); }
      drawSprite(id, x, y, 2, h.hurt > 0 ? 'white' : null);
      bar(x + 5, y - 4, 22, hs.hpf, hs.hpf > 0.5 ? '#38b764' : hs.hpf > 0.25 ? '#ffcd75' : '#b13e53');
      if (id === tankId) shieldIcon(x + 13, y - 13);
      if (s.fx.partyT > 0 && Math.sin(time * 14 + i) > 0.6) { ctx.fillStyle = '#ffcd75'; ctx.fillRect(x + 4 + (i * 7) % 20, y + 2, 2, 2); }
      if (hs.buffT > 0) { ctx.fillStyle = 'rgba(177,62,83,0.4)'; ctx.fillRect(x + 6, y + 31, 20, 1); }
      // Veneno.
      if (zone.mech.poison > 0 && r.enemy && Math.sin(time * 5 + i * 2) > 0.7) { ctx.fillStyle = '#a7f070'; ctx.fillRect(x + 10 + (i * 5) % 8, y - 8, 2, 2); }
    });

    // Enemigo.
    const E = A.enemy, e = r.enemy;
    E.spawnT = Math.max(0, E.spawnT - dt); E.hitT = Math.max(0, E.hitT - dt);
    if (e) {
      const size = 16 * E.scale;
      const slide = Math.round((E.spawnT / 0.4) * 40);
      const bob = Math.round(Math.sin(time * 2.5) * 1);
      let tint = E.hitT > 0 ? 'white' : E.tint;
      drawSprite(e.sprite, ENEMY_X - size / 2 + slide, FEET - size + 2 + bob, E.scale, tint, 1 - E.spawnT * 1.2);
      if (zone.mech.enrage > 0 || zone.mech.poison > 0) {
        const en = Math.min(0.4, zone.mech.enrage * e.t * 0.08);
        if (en > 0.02) { ctx.fillStyle = 'rgba(200,30,30,' + en.toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
      }
    } else if (E.deadT > 0 && E.sprite) {
      E.deadT = Math.max(0, E.deadT - dt);
      const size = 16 * E.scale;
      drawSprite(E.sprite, ENEMY_X - size / 2, FEET - size + 2, E.scale, E.tint || 'white', E.deadT / 0.35);
    }

    // Proyectiles.
    for (let i = A.proj.length - 1; i >= 0; i--) {
      const p = A.proj[i];
      p.t += dt / 0.22;
      if (p.t >= 1) { A.proj.splice(i, 1); continue; }
      const x = p.x + (ENEMY_X - 8 - p.x) * p.t, y = p.y + (86 - p.y) * p.t - Math.sin(p.t * Math.PI) * 6;
      ctx.fillStyle = p.c; ctx.fillRect(Math.round(x), Math.round(y), p.big ? 4 : 2, p.big ? 4 : 2);
    }
    // Partículas (monedas).
    for (let i = A.parts.length - 1; i >= 0; i--) {
      const p = A.parts[i];
      p.t += dt; if (p.t >= p.life) { A.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
      ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (A.flash > 0) { A.flash = Math.max(0, A.flash - dt); ctx.fillStyle = 'rgba(177,62,83,' + (A.flash * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
  };

  /** Convierte coordenadas lógicas de la escena a porcentajes del canvas. */
  Scene.pct = function (x, y) { return { x: (x / W) * 100, y: (y / H) * 100 }; };
  /** Tamaño lógico. */
  Scene.size = { w: W, h: H };
})(typeof globalThis !== 'undefined' ? globalThis : this);
