/**
 * Pixel art generado por código: héroes, enemigos, jefes y fondos.
 * Cada sprite se dibuja con formas simples sobre una rejilla de 16x16 y luego se le añaden
 * contorno y sombreado automáticamente, para que todos tengan el mismo estilo.
 *
 * Paleta de 16 colores (Sweetie-16): el carácter de cada color se usa al dibujar.
 */
(function (root) {
  'use strict';
  const GM = root.GM || (root.GM = {});

  const PAL = {
    '0': '#1a1c2c', '1': '#5d275d', '2': '#b13e53', '3': '#ef7d57', '4': '#ffcd75', '5': '#a7f070',
    '6': '#38b764', '7': '#257179', '8': '#29366f', '9': '#3b5dc9', 'a': '#41a6f6', 'b': '#73eff7',
    'c': '#f4f4f4', 'd': '#94b0c2', 'e': '#566c86', 'f': '#333c57',
  };
  GM.PAL = PAL;
  // Color de sombra para cada color base.
  const SHADE = { '5': '6', '6': '7', 'd': 'e', 'e': 'f', '2': '1', '3': '2', '4': '3', 'c': 'd', '9': '8', 'a': '9', 'b': 'a', '1': '0', '7': '0', '8': '0', 'f': '0' };

  const N = 16;

  /** Lienzo de 16x16 sobre el que se dibuja con formas simples. */
  function Grid() {
    const g = Array.from({ length: N }, () => Array(N).fill('.'));
    const api = {
      g: g,
      set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c; return api; },
      get(x, y) { return x >= 0 && x < N && y >= 0 && y < N ? g[y][x] : '.'; },
      rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) api.set(x + i, y + j, c); return api; },
      ell(cx, cy, rx, ry, c) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) g[y][x] = c;
        }
        return api;
      },
      line(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= n; i++) api.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
        return api;
      },
      /** Pone varios píxeles: lista de [x, y]. */
      pts(list, c) { list.forEach((p) => api.set(p[0], p[1], c)); return api; },
    };
    return api;
  }

  /** Añade sombreado inferior y contorno oscuro. Devuelve las 16 filas como texto. */
  function finish(grid, opts) {
    opts = opts || {};
    const src = grid.g.map((r) => r.slice());
    const out = src.map((r) => r.slice());
    if (!opts.noShade) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = src[y][x];
        if (c !== '.' && c !== '0' && SHADE[c] && (y + 1 >= N || src[y + 1][x] === '.')) out[y][x] = SHADE[c];
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (src[y][x] !== '.') continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const d of nb) {
        const nx = x + d[0], ny = y + d[1];
        if (nx >= 0 && nx < N && ny >= 0 && ny < N && src[ny][nx] !== '.') { out[y][x] = '0'; break; }
      }
    }
    return out.map((r) => r.join(''));
  }

  /* ------------------------------------------------------------------ héroes */

  /** Figura humana base (mira a la derecha). */
  function human(o) {
    const g = Grid();
    g.rect(5, 13, 2, 2, o.boots || 'f').rect(9, 13, 2, 2, o.boots || 'f');   // botas
    g.rect(6, 11, 4, 2, o.legs || 'e');                                       // piernas
    g.rect(4, 7, 8, 5, o.armor);                                              // torso
    if (o.belt) g.rect(4, 11, 8, 1, o.belt);
    g.rect(3, 8, 1, 3, o.armor).rect(12, 8, 1, 3, o.armor);                   // brazos
    g.set(3, 11, o.skin || '4').set(12, 11, o.skin || '4');                   // manos
    g.ell(8, 4, 3.6, 3.2, o.skin || '4');                                     // cabeza
    if (o.hair) g.ell(8, 2.6, 3.7, 2.1, o.hair).rect(4, 3, 1, 3, o.hair);     // pelo
    g.set(7, 5, '0').set(10, 5, '0');                                         // ojos
    return g;
  }

  const HERO_DRAW = {
    guerrero(g) {            // Paco: casco con penacho, espada y escudo
      const h = human({ armor: 'd', belt: '2', hair: null, legs: 'e', boots: 'f' });
      h.ell(8, 3, 3.8, 2.6, 'd').rect(4, 3, 1, 3, 'd').rect(11, 3, 1, 2, 'd');
      h.rect(7, 0, 2, 2, '2').set(8, 2, '2');                                 // penacho
      h.set(7, 5, '0').set(10, 5, '0').rect(6, 6, 4, 1, '4');
      h.rect(14, 2, 1, 8, 'c').set(14, 1, 'c').rect(13, 10, 3, 1, '4').set(14, 11, '3'); // espada
      h.rect(1, 8, 3, 5, 'e').rect(2, 9, 1, 3, '2');                          // escudo
      return h;
    },
    maga(g) {                // Merlina: sombrero de pico y bastón
      const h = human({ armor: '9', belt: '4', hair: '3', legs: '8', boots: '1' });
      h.rect(3, 3, 10, 1, '8').rect(5, 1, 6, 2, '8').rect(6, 0, 3, 1, '8').set(8, 0, '8');
      h.set(8, 2, '4');                                                        // estrella
      h.set(7, 5, '0').set(10, 5, '0');
      h.rect(13, 3, 1, 11, '3').ell(13.5, 2.5, 1.6, 1.6, 'b');                 // bastón con orbe
      return h;
    },
    arquero(g) {             // Robín: gorro verde con pluma y arco
      const h = human({ armor: '6', belt: '3', hair: '3', legs: '7', boots: '1' });
      h.rect(5, 1, 6, 2, '6').rect(4, 3, 8, 1, '6').rect(11, 0, 3, 1, 'c').set(13, 1, 'c');
      h.set(7, 5, '0').set(10, 5, '0');
      h.line(13, 3, 15, 6, '3').line(15, 6, 15, 9, '3').line(15, 9, 13, 13, '3').line(13, 3, 13, 13, 'c');
      return h;
    },
    clerigo(g) {             // Hno. Ramón: calvo con aureola y mazo
      const h = human({ armor: 'c', belt: '4', hair: null, legs: 'd', boots: '3' });
      h.ell(8, 0.8, 3, 0.8, '4');
      h.rect(6, 1, 4, 1, '4').set(7, 5, '0').set(10, 5, '0');
      h.rect(14, 4, 1, 9, '3').rect(13, 2, 3, 3, '4').set(14, 3, '2');
      return h;
    },
    ladrona(g) {             // Lola: capucha oscura y dagas
      const h = human({ armor: '1', belt: '2', hair: null, legs: 'f', boots: '0' });
      h.ell(8, 3.6, 4.1, 3.6, '1').rect(5, 5, 6, 2, '4').set(7, 5, '0').set(10, 5, '0');
      h.set(5, 6, '1').set(10, 6, '1');
      h.rect(13, 8, 1, 4, 'c').set(13, 12, '3').rect(14, 10, 1, 3, 'd').set(14, 13, '3');
      h.rect(5, 6, 1, 1, '1');
      return h;
    },
    bardo(g) {               // Tomás: boina con pluma y laúd
      const h = human({ armor: '2', belt: '4', hair: '3', legs: '9', boots: '3' });
      h.rect(4, 2, 8, 2, '1').rect(5, 1, 6, 1, '1').rect(11, 0, 2, 2, 'c');
      h.set(7, 5, '0').set(10, 5, '0');
      h.ell(13, 11, 2.4, 2.4, '3').rect(13, 4, 1, 6, '4').set(13, 11, '0');
      return h;
    },
  };

  /* ---------------------------------------------------------------- enemigos */

  const ENEMY_DRAW = {
    rata() {
      const g = Grid();
      g.ell(9.5, 11, 4.3, 3, 'd').ell(4.5, 10.4, 2.7, 2.2, 'd');                // cuerpo y cabeza
      g.ell(5, 7.6, 1.5, 1.6, '2').ell(8, 7.8, 1.5, 1.6, '2');                  // orejas
      g.rect(1, 10, 1, 1, '3').set(3, 9, '0');                                  // nariz y ojo
      g.line(13, 11, 15, 8, '3').set(15, 7, '3');                               // cola
      g.rect(5, 13, 2, 2, 'e').rect(10, 13, 2, 2, 'e');                         // patas
      return g;
    },
    limo() {
      const g = Grid();
      g.ell(8, 10.5, 6.2, 4.6, '5');
      g.rect(4, 7, 2, 1, 'c').rect(5, 6, 2, 1, 'c');                            // brillo
      g.rect(5, 9, 2, 2, 'c').rect(9, 9, 2, 2, 'c').set(6, 10, '0').set(10, 10, '0');
      g.rect(7, 12, 2, 1, '0');
      return g;
    },
    murcielago() {
      const g = Grid();
      g.ell(3.2, 7, 3.2, 2.2, '1').ell(12.8, 7, 3.2, 2.2, '1');                 // alas
      g.rect(0, 8, 2, 2, '1').rect(14, 8, 2, 2, '1');
      g.ell(8, 8, 2.6, 3.4, 'e');
      g.rect(6, 4, 1, 2, 'e').rect(9, 4, 1, 2, 'e');                            // orejas
      g.set(7, 7, '2').set(9, 7, '2').set(7, 10, 'c').set(9, 10, 'c');          // ojos y colmillos
      g.rect(7, 12, 2, 1, 'e');
      return g;
    },
    goblin() {
      const g = Grid();
      g.rect(5, 13, 2, 2, '3').rect(9, 13, 2, 2, '3').rect(6, 10, 4, 3, '3');
      g.rect(5, 8, 6, 3, '2');                                                  // chaleco
      g.ell(8, 5, 3.6, 3, '6');
      g.rect(1, 4, 3, 2, '6').rect(12, 4, 3, 2, '6').set(0, 3, '6').set(15, 3, '6'); // orejas
      g.set(6, 4, '4').set(10, 4, '4').set(6, 4, '4').rect(7, 7, 2, 1, '0');
      g.rect(12, 9, 1, 4, 'd').set(12, 13, '3');                                // daga
      return g;
    },
    lobo() {
      const g = Grid();
      g.ell(9, 9.5, 5, 3, 'e').ell(3.6, 8, 2.6, 2.2, 'e');
      g.pts([[2, 5], [3, 5], [5, 5], [6, 5]], 'e').pts([[2, 6], [5, 6]], 'e');
      g.rect(0, 9, 2, 1, 'f').set(3, 8, '2');
      g.rect(13, 8, 3, 2, 'e').set(15, 7, 'e');                                 // cola
      g.rect(5, 12, 2, 3, 'e').rect(11, 12, 2, 3, 'e').rect(8, 12, 1, 3, 'f');
      g.set(1, 11, 'c').set(2, 11, 'c');
      return g;
    },
    seta() {
      const g = Grid();
      g.rect(6, 9, 4, 5, 'c');
      g.ell(8, 6, 6.2, 4.2, '2');
      g.rect(2, 7, 12, 2, '2');
      g.rect(4, 4, 2, 2, 'c').rect(9, 3, 2, 2, 'c').rect(11, 6, 2, 1, 'c').rect(7, 6, 1, 1, 'c');
      g.set(7, 10, '0').set(9, 10, '0').rect(7, 12, 2, 1, '2');
      return g;
    },
    esqueleto() {
      const g = Grid();
      g.rect(7, 12, 1, 3, 'c').rect(9, 12, 1, 3, 'c').rect(6, 14, 2, 1, 'c').rect(9, 14, 2, 1, 'c');
      g.rect(5, 7, 6, 5, 'c');
      g.rect(5, 8, 6, 1, '0').rect(5, 10, 6, 1, '0');                           // costillas
      g.rect(7, 7, 2, 5, 'c');
      g.rect(3, 8, 1, 4, 'c').rect(12, 8, 1, 4, 'c');
      g.ell(8, 4, 3.4, 3, 'c');
      g.rect(6, 4, 2, 2, '0').rect(9, 4, 2, 2, '0').rect(7, 7, 1, 1, '0');
      g.rect(5, 7, 6, 1, 'c').set(8, 1, 'e').set(9, 1, 'e');                    // pelo de jubilado
      g.rect(13, 6, 1, 8, '3');                                                 // bastón
      return g;
    },
    fantasma() {
      const g = Grid();
      g.ell(8, 6, 5, 5, 'c').rect(3, 6, 10, 7, 'c');
      g.pts([[3, 13], [4, 14], [5, 13], [7, 13], [8, 14], [9, 13], [11, 13], [12, 14], [13, 13]], 'c');
      g.rect(5, 5, 2, 3, '0').rect(9, 5, 2, 3, '0').rect(7, 9, 2, 2, '0');
      g.set(12, 9, 'b').set(3, 10, 'b');
      return g;
    },
    zombi() {
      const g = Grid();
      g.rect(5, 13, 2, 2, 'f').rect(9, 13, 2, 2, 'f').rect(6, 11, 4, 2, '8');
      g.rect(4, 7, 8, 5, '9').rect(5, 9, 2, 1, 'c');                            // camisa con corbata torcida
      g.rect(8, 8, 1, 4, '2');
      g.rect(1, 7, 3, 2, '5').rect(12, 7, 3, 2, '5');                           // brazos extendidos
      g.ell(8, 4, 3.6, 3.2, '5');
      g.set(7, 4, '0').set(10, 4, '2').set(7, 6, '0').set(8, 6, '0').set(9, 6, '0');
      g.rect(4, 1, 2, 1, '6');
      return g;
    },
    diablillo() {
      const g = Grid();
      g.rect(5, 13, 2, 2, '1').rect(9, 13, 2, 2, '1').rect(6, 10, 4, 3, '2');
      g.ell(8, 8, 3.6, 3, '2');
      g.ell(3, 7, 2.2, 2, '1').ell(13, 7, 2.2, 2, '1');                         // alitas
      g.ell(8, 4, 3.4, 2.8, '2');
      g.pts([[5, 1], [5, 2], [10, 1], [10, 2], [4, 0], [11, 0]], '4');          // cuernos
      g.set(7, 4, '4').set(9, 4, '4').rect(7, 6, 3, 1, '0');
      g.line(12, 12, 14, 9, '2').pts([[14, 8], [15, 8], [14, 7]], '2');
      g.rect(7, 8, 3, 1, 'c');                                                  // corbata
      return g;
    },
    golem() {
      const g = Grid();
      g.rect(5, 12, 3, 3, 'e').rect(9, 12, 3, 3, 'e');
      g.rect(3, 4, 10, 8, 'e').rect(4, 3, 8, 1, 'e');
      g.rect(1, 6, 2, 6, 'e').rect(13, 6, 2, 6, 'e').rect(0, 11, 3, 2, 'f').rect(13, 11, 3, 2, 'f');
      g.rect(5, 5, 2, 2, '3').rect(9, 5, 2, 2, '3');
      g.pts([[4, 9], [5, 10], [6, 9], [10, 8], [11, 9], [9, 10]], '3');         // grietas de lava
      g.rect(7, 8, 2, 1, 'f');
      return g;
    },
    salamandra() {
      const g = Grid();
      g.ell(9, 10.5, 4.6, 2.6, '3').ell(3.8, 9.4, 2.8, 2.2, '3');
      g.rect(12, 11, 3, 2, '3').rect(14, 10, 2, 1, '3').set(15, 9, '3');        // cola
      g.rect(5, 12, 2, 3, '3').rect(10, 12, 2, 3, '3');
      g.set(3, 8, '0').pts([[7, 9], [9, 8], [11, 9], [8, 11]], '4');
      g.rect(1, 10, 2, 1, '2');
      g.rect(2, 5, 4, 2, '9').rect(3, 3, 2, 2, '9').set(3, 2, '4');             // gorrito de fiesta
      return g;
    },
    gargola() {
      const g = Grid();
      g.ell(3, 6, 3, 3.2, 'e').ell(13, 6, 3, 3.2, 'e');                         // alas
      g.rect(5, 12, 2, 3, 'd').rect(9, 12, 2, 3, 'd');
      g.rect(5, 7, 6, 6, 'd');
      g.ell(8, 4.6, 3.6, 3, 'd');
      g.pts([[4, 1], [4, 2], [11, 1], [11, 2]], 'e');
      g.rect(6, 4, 2, 1, '3').rect(9, 4, 2, 1, '3').rect(7, 6, 3, 1, '0');
      g.set(7, 7, 'c').set(9, 7, 'c');
      return g;
    },
    mimico() {
      const g = Grid();
      g.rect(2, 8, 12, 6, '3').rect(2, 8, 12, 1, '2').rect(7, 8, 2, 6, '4');
      g.ell(8, 6.4, 6, 2.6, '3').rect(7, 4, 2, 4, '4');
      g.pts([[3, 9], [5, 9], [7, 9], [9, 9], [11, 9], [13, 9]], 'c');           // dientes
      g.rect(6, 6, 1, 1, '0').rect(10, 6, 1, 1, '0').rect(6, 5, 1, 1, '4').rect(10, 5, 1, 1, '4');
      g.rect(7, 11, 2, 2, '2');                                                 // lengua
      g.rect(0, 11, 2, 2, '3').rect(14, 11, 2, 2, '3');
      return g;
    },
    caballero() {
      const g = Grid();
      g.rect(5, 13, 2, 2, 'e').rect(9, 13, 2, 2, 'e').rect(6, 11, 4, 2, 'd');
      g.rect(4, 7, 8, 5, 'd').rect(7, 8, 2, 3, '2');
      g.rect(3, 8, 1, 4, 'd').rect(12, 8, 1, 4, 'd');
      g.ell(8, 4, 3.6, 3.2, 'd').rect(5, 4, 6, 1, '0').rect(5, 5, 6, 1, 'd').pts([[7, 4], [8, 4]], 'b');
      g.rect(7, 0, 2, 2, '2');
      g.rect(0, 8, 3, 5, 'c').rect(1, 9, 1, 3, '2');                            // escudo
      g.rect(14, 3, 1, 8, 'c').rect(13, 10, 3, 1, '4');
      return g;
    },
  };

  /** Cofre dibujado con los colores dados. */
  function chest(c) {
    const g = Grid();
    g.rect(2, 9, 12, 5, c.body).ell(8, 8.2, 6, 3.8, c.body);
    g.rect(2, 12, 12, 1, c.dark).rect(2, 9, 12, 1, c.dark);
    g.rect(7, 5, 2, 9, c.band);
    g.rect(7, 9, 2, 3, c.lock).set(8, 10, '0');
    g.set(4, 6, c.hi).set(5, 5, c.hi).set(10, 5, c.hi);
    if (c.gem) g.set(4, 11, c.gem).set(11, 11, c.gem);
    return g;
  }
  Object.assign(ENEMY_DRAW, {
    cofre_bronce() { return chest({ body: '3', dark: '2', band: '4', lock: '4', hi: '4' }); },
    cofre_plata() { return chest({ body: 'd', dark: 'e', band: 'c', lock: '4', hi: 'c', gem: 'b' }); },
    cofre_oro() { return chest({ body: '4', dark: '3', band: 'c', lock: '2', hi: 'c', gem: '2' }); },
    tesorero() {           // Goblin del Tesoro: chaleco dorado y un saco de monedas
      const g = Grid();
      g.rect(5, 13, 2, 2, '3').rect(9, 13, 2, 2, '3').rect(6, 10, 3, 3, '3');
      g.rect(5, 8, 5, 3, '4');
      g.ell(7, 5, 3.4, 3, '6');
      g.rect(1, 4, 3, 2, '6').rect(10, 4, 2, 2, '6').set(0, 3, '6');
      g.set(5, 4, '4').set(8, 4, '4').rect(6, 7, 2, 1, '0');
      g.ell(12.5, 10.5, 3, 3.2, '3').rect(11, 6, 3, 1, '3').set(12, 5, '4').set(12, 10, '4').set(13, 12, '4');
      g.pts([[10, 13], [14, 14], [15, 11]], '4');
      return g;
    },
  });

  const BOSS_DRAW = {
    b_reylimo() {
      const g = Grid();
      g.ell(8, 10.5, 7.2, 5, '5');
      g.rect(4, 7, 2, 1, 'c').rect(5, 6, 2, 1, 'c');
      g.rect(4, 9, 3, 3, 'c').rect(9, 9, 3, 3, 'c').rect(5, 10, 1, 2, '0').rect(10, 10, 1, 2, '0');
      g.rect(6, 13, 4, 1, '0').set(5, 12, '0').set(10, 12, '0');
      g.rect(5, 3, 6, 3, '4').pts([[5, 2], [8, 1], [10, 2]], '4').set(8, 4, '2').set(6, 4, 'a');   // corona
      return g;
    },
    b_trol() {
      const g = Grid();
      g.rect(4, 12, 3, 3, '6').rect(9, 12, 3, 3, '6');
      g.rect(3, 6, 10, 7, '6').rect(5, 6, 6, 7, '4').rect(5, 8, 6, 1, 'd').rect(5, 10, 6, 1, 'd');  // chaleco reflectante
      g.rect(0, 6, 3, 6, '6').rect(13, 6, 3, 6, '6').rect(0, 11, 3, 2, '5').rect(13, 11, 3, 2, '5');
      g.ell(8, 4, 4, 3, '6');
      g.rect(6, 3, 1, 2, '0').rect(9, 3, 1, 2, '0').rect(5, 6, 6, 1, '0').pts([[6, 6], [10, 6]], 'c');
      g.pts([[3, 2], [12, 2]], '6');
      g.rect(12, 8, 3, 3, '4');                                                // peaje
      return g;
    },
    b_lich() {
      const g = Grid();
      g.rect(4, 8, 8, 7, '1').rect(3, 11, 10, 4, '1').rect(7, 9, 2, 6, '9');
      g.rect(1, 9, 2, 5, '1').rect(13, 9, 2, 5, '1').set(1, 8, 'c').set(14, 8, 'c');
      g.ell(8, 5, 3.6, 3.4, 'c');
      g.rect(5, 4, 2, 2, '0').rect(9, 4, 2, 2, '0').rect(5, 4, 2, 1, 'b').rect(9, 4, 2, 1, 'b');   // gafas
      g.rect(7, 7, 2, 1, '0');
      g.rect(5, 0, 6, 2, '4').pts([[5, 0], [8, 0], [10, 0]], '4').set(7, 1, '2');                 // corona
      g.rect(13, 3, 1, 7, '3').rect(12, 2, 3, 2, 'c');                                              // calculadora
      return g;
    },
    b_dragon() {
      const g = Grid();
      g.ell(2.5, 6, 2.6, 4, '1').ell(13.5, 6, 2.6, 4, '1');                     // alas
      g.ell(8, 10, 5, 4, '2').rect(5, 12, 2, 3, '2').rect(9, 12, 2, 3, '2');
      g.rect(7, 9, 2, 4, '4');
      g.ell(8, 5, 3.4, 2.8, '2').rect(6, 6, 4, 2, '3');
      g.pts([[5, 1], [5, 2], [10, 1], [10, 2]], '4');
      g.set(7, 4, '4').set(9, 4, '4').set(7, 7, '0').set(9, 7, '0');
      g.line(12, 13, 15, 10, '2').set(15, 9, '4');
      g.rect(0, 13, 3, 2, '4').rect(1, 12, 1, 1, '4');                          // llave de la hipoteca
      return g;
    },
    b_casero() {
      const g = Grid();
      g.rect(4, 13, 3, 2, '0').rect(9, 13, 3, 2, '0').rect(5, 11, 6, 2, 'f');
      g.rect(3, 6, 10, 6, '8').rect(7, 7, 2, 5, 'c').rect(8, 8, 1, 4, '2');     // traje, camisa y corbata
      g.rect(1, 7, 2, 5, '8').rect(13, 7, 2, 5, '8').rect(0, 11, 2, 2, '4').rect(14, 11, 2, 2, '4');
      g.ell(8, 4.6, 3.6, 3.2, '4');
      g.rect(4, 1, 8, 2, 'f').rect(5, 0, 6, 1, 'f').rect(5, 1, 6, 1, '2');      // sombrero de copa
      g.set(7, 4, '0').set(9, 4, '0').rect(6, 6, 4, 1, '3').rect(7, 7, 2, 1, '0');
      g.rect(14, 5, 2, 2, '4').set(15, 7, '4').rect(13, 7, 1, 2, '4');          // llavero
      g.rect(2, 9, 2, 1, '4');
      return g;
    },
  };

  /* --------------------------------------------------------------- caché y API */

  const rowsCache = {};
  const canvasCache = {};

  /** Devuelve las 16 filas de texto de un sprite. @param {string} name */
  GM.spriteRows = function (name) {
    if (rowsCache[name]) return rowsCache[name];
    let g;
    if (HERO_DRAW[name]) g = HERO_DRAW[name]();
    else if (ENEMY_DRAW[name]) g = ENEMY_DRAW[name]();
    else if (BOSS_DRAW[name]) g = BOSS_DRAW[name]();
    else throw new Error('Sprite desconocido: ' + name);
    rowsCache[name] = finish(g);
    return rowsCache[name];
  };

  /** Nombres de todos los sprites disponibles. */
  GM.spriteNames = function () { return [].concat(Object.keys(HERO_DRAW), Object.keys(ENEMY_DRAW), Object.keys(BOSS_DRAW)); };

  /**
   * Devuelve un canvas de 16x16 con el sprite. `tint` puede ser 'gold' o 'red' para variantes.
   * Solo funciona en el navegador (usa document).
   */
  GM.spriteCanvas = function (name, tint) {
    const key = name + '|' + (tint || '');
    if (canvasCache[key]) return canvasCache[key];
    const rows = GM.spriteRows(name);
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = PAL[ch];
      ctx.fillRect(x, y, 1, 1);
    }
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint === 'gold' ? 'rgba(255, 205, 80, 0.62)' : tint === 'red' ? 'rgba(220, 40, 60, 0.35)' : tint === 'white' ? 'rgba(255,255,255,0.8)' : tint;
      ctx.fillRect(0, 0, N, N);
    }
    canvasCache[key] = c;
    return c;
  };

  /** Versión en grises/oscura para héroes caídos. */
  GM.spriteDown = function (name) {
    return GM.spriteCanvas(name, 'rgba(26, 28, 44, 0.65)');
  };

  /* --------------------------------------------------------------- fondos */

  /**
   * Dibuja el fondo estático de una zona en un canvas de w×h píxeles lógicos.
   * @param {string} kind sotano | bosque | cripta | volcan | torre
   * @returns {HTMLCanvasElement}
   */
  GM.makeBackground = function (kind, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const groundY = Math.round(h * 0.7);
    const rng = GM.seeded(kind.length * 977 + 13);
    const R = (a, b) => a + rng() * (b - a);
    const grad = (y0, y1, c0, c1) => {
      const g = x.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      x.fillStyle = g; x.fillRect(0, y0, w, y1 - y0);
    };
    if (kind === 'sotano') {
      grad(0, h, '#2a1f3d', '#1a1428');
      for (let yy = 0; yy < groundY; yy += 8) {
        for (let xx = -((yy / 8) % 2) * 8; xx < w; xx += 16) {
          x.fillStyle = (xx / 16 + yy / 8) % 3 === 0 ? '#34274a' : '#2d2242';
          x.fillRect(xx + 1, yy + 1, 14, 6);
        }
      }
      x.fillStyle = '#0f0a1a'; for (let i = 0; i < 6; i++) x.fillRect(R(0, w), 0, 2, R(8, 22));   // goteras
      x.fillStyle = '#3d2f52'; x.fillRect(0, groundY, w, h - groundY);
      x.fillStyle = '#4a3a63'; for (let xx = 0; xx < w; xx += 24) x.fillRect(xx, groundY, 22, 2);
      x.fillStyle = '#2a1f3d'; for (let xx = 0; xx < w; xx += 24) x.fillRect(xx + 22, groundY, 2, h - groundY);
      x.fillStyle = '#5a4373'; for (let yy = groundY + 12; yy < h; yy += 12) x.fillRect(0, yy, w, 1);
    } else if (kind === 'bosque') {
      grad(0, groundY, '#264f4a', '#4c8a6a');
      for (let layer = 0; layer < 2; layer++) {
        x.fillStyle = layer === 0 ? '#1d4a3d' : '#163a31';
        for (let xx = -10 + layer * 18; xx < w; xx += 40) {
          const th = R(30, 54);
          x.fillRect(xx + 14, groundY - th, 6, th);
          x.beginPath(); x.arc(xx + 17, groundY - th, 15 + layer * 2, 0, Math.PI * 2); x.fill();
        }
      }
      x.fillStyle = '#2d7a3c'; x.fillRect(0, groundY, w, h - groundY);
      x.fillStyle = '#3f9a4a'; for (let xx = 0; xx < w; xx += 6) x.fillRect(xx, groundY - 1, 3, 2);
      x.fillStyle = '#1f5f2c'; for (let i = 0; i < 40; i++) x.fillRect(R(0, w), R(groundY + 3, h), 3, 1);
      x.fillStyle = '#5a3d2a'; x.fillRect(0, groundY + 14, w, 1);
    } else if (kind === 'cripta') {
      grad(0, h, '#222a3a', '#141a26');
      for (let xx = 8; xx < w; xx += 56) {
        x.fillStyle = '#3a4560'; x.fillRect(xx, 0, 12, groundY);
        x.fillStyle = '#2d374d'; x.fillRect(xx + 9, 0, 3, groundY);
        x.fillStyle = '#4a5878'; x.fillRect(xx - 2, 0, 16, 5); x.fillRect(xx - 2, groundY - 5, 16, 5);
      }
      x.fillStyle = '#10141e'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(R(20, w - 20), R(20, 50), 6, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#2b3347'; x.fillRect(0, groundY, w, h - groundY);
      x.fillStyle = '#3a4560'; for (let xx = 0; xx < w; xx += 20) x.fillRect(xx, groundY, 18, 1);
      x.fillStyle = '#1a2030'; for (let yy = groundY + 10; yy < h; yy += 10) x.fillRect(0, yy, w, 1);
      x.fillStyle = '#c8d0e0'; x.fillRect(30, groundY + 6, 6, 3); x.fillRect(31, groundY + 4, 4, 2);   // calavera
    } else if (kind === 'volcan') {
      grad(0, groundY, '#4a1a2a', '#c4502a');
      x.fillStyle = '#2a0f1a';
      x.beginPath(); x.moveTo(w * 0.15, groundY); x.lineTo(w * 0.42, 22); x.lineTo(w * 0.7, groundY); x.fill();
      x.beginPath(); x.moveTo(w * 0.55, groundY); x.lineTo(w * 0.78, 40); x.lineTo(w * 1.0, groundY); x.fill();
      x.fillStyle = '#ff8a3a'; x.fillRect(w * 0.42 - 6, 22, 12, 3);
      x.fillStyle = '#3a1520'; x.fillRect(0, groundY, w, h - groundY);
      x.fillStyle = '#6a2a30'; for (let xx = 0; xx < w; xx += 18) x.fillRect(xx, groundY, 14, 2);
      x.fillStyle = '#ff6a2a'; x.fillRect(0, groundY + 16, w, 3);
      x.fillStyle = '#ffd05a'; for (let i = 0; i < 12; i++) x.fillRect(R(0, w), groundY + 17, 6, 1);
      x.fillStyle = '#2a0f1a'; for (let i = 0; i < 24; i++) x.fillRect(R(0, w), R(groundY + 3, groundY + 14), 3, 2);
    } else {   // torre
      grad(0, h, '#141a3a', '#0a0e24');
      x.fillStyle = '#dfe6ff'; for (let i = 0; i < 40; i++) x.fillRect(R(0, w), R(0, groundY - 10), 1, 1);
      x.fillStyle = '#1d2550';
      for (let xx = 10; xx < w; xx += 52) {
        x.fillRect(xx, 14, 26, groundY - 14);
        x.fillStyle = '#ffcd75'; x.fillRect(xx + 9, 28, 8, 12); x.fillRect(xx + 9, 56, 8, 12);
        x.fillStyle = '#1d2550';
      }
      x.fillStyle = '#2a3270'; x.fillRect(0, groundY, w, h - groundY);
      for (let yy = groundY, row = 0; yy < h; yy += 10, row++) {
        for (let xx = (row % 2) * 10; xx < w; xx += 20) { x.fillStyle = '#3a4590'; x.fillRect(xx, yy, 10, 10); }
      }
      x.fillStyle = '#ffcd75'; x.fillRect(0, groundY, w, 1);
    }
    return c;
  };

  /** Altura del suelo (en píxeles lógicos) para colocar personajes. */
  GM.groundY = function (h) { return Math.round(h * 0.7); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
