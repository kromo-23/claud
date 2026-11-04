/**
 * Datos de la capa de enganche: críticos, combo, frenesí, cofres, reliquias, especializaciones,
 * misiones, recompensa diaria, bestiario y logros ampliados. Ver design/engagement.md.
 * Se carga después de data.js.
 */
(function (root) {
  'use strict';
  const GM = root.GM;

  /** Números de equilibrio de la capa de enganche. */
  Object.assign(GM.CFG, {
    ach: 0.008,                 // cada logro da +0,8% de daño y oro (hay más de 80)
    critBase: 0.05, critMulBase: 2.5, critCap: 0.9,
    comboWindow: 5,             // segundos máximos entre dos bajas para mantener el combo
    comboGold: 0.01, comboMax: 50,   // +1% de oro por baja seguida, hasta +50%
    frenzyKill: 4, frenzyTap: 0.4, frenzyNeed: 100, frenzyDur: 8, frenzyDmg: 2, frenzyGold: 1.5,
    chestMini: 0.2,             // probabilidad de cofre de bronce al derrotar un minijefe
    chestGolden: 0.12,          // probabilidad de cofre de plata al derrotar un enemigo dorado
    chestFloorBoss: 0.0,
    goblinMin: 90, goblinMax: 210, goblinLife: 13, goblinHits: 6, goblinGold: 40,
    pityLegend: 40,             // tiradas de reliquia sin legendaria antes de garantizarla
    setEvery: 6, setBonus: 0.05,     // cada 6 reliquias distintas: +5% de daño y oro
    perkRespec: 3,              // cristales por reasignar las especializaciones de un héroe
    questSlots: 3,
    questRamp: 0.25,            // las metas de las misiones crecen un 25% por cada misión ya cumplida
    timeChestEvery: 480,        // un cofre de bronce cada 8 min de juego (cada 4º es de plata): goteo constante
    welcomeAfterS: 1800,        // tras esta ausencia, cofre de bienvenida
    bestiaryTiers: [10, 100, 1000, 10000],
    bestiaryDmg: 0.005,         // +0,5% de daño por cada hito de cada tipo de enemigo
    bestiaryCrystals: [0, 1, 2, 4],
  });

  /** Rarezas de reliquia. */
  GM.RARITY = [
    { id: 'comun', name: 'Común', color: '#94b0c2' },
    { id: 'rara', name: 'Rara', color: '#41a6f6' },
    { id: 'epica', name: 'Épica', color: '#b06bff' },
    { id: 'legendaria', name: 'Legendaria', color: '#ffcd75' },
  ];
  /** Niveles máximos de reliquia por rareza (los repetidos extra se convierten en cristales). */
  GM.RELIC_MAX = [15, 12, 10, 8];

  /**
   * Cofres. gold = múltiplo de "oro medio por baja" actual; rolls = tiradas de reliquia;
   * w = pesos de rareza [común, rara, épica, legendaria]; crystals = [probabilidad, máx]; levels = [mín, máx] niveles gratis.
   */
  GM.CHESTS = {
    bronce: { name: 'Cofre de bronce', gold: 12, rolls: 1, w: [78, 19, 3, 0], crystals: [0.15, 1], levels: [1, 2], color: '#ef7d57' },
    plata: { name: 'Cofre de plata', gold: 40, rolls: 2, w: [50, 36, 12, 2], crystals: [0.5, 2], levels: [2, 4], color: '#94b0c2' },
    oro: { name: 'Cofre de oro', gold: 120, rolls: 3, w: [22, 44, 26, 8], crystals: [1, 3], levels: [4, 8], color: '#ffcd75', guarantee: 1 },
  };
  GM.CHEST_ORDER = ['bronce', 'plata', 'oro'];

  /** Textos de cada tipo de efecto. */
  GM.FX_TEXT = {
    dmg: 'daño', hp: 'vida', gold: 'oro', iron: 'hierro', crit: 'prob. de crítico', critMul: 'daño crítico',
    tap: 'daño de toque', cd: 'recarga de habilidades', heal: 'curación al matar', frenzy: 'carga de frenesí',
    chest: 'cofres', offline: 'eficiencia sin conexión', abil: 'potencia de la habilidad', pdmg: 'daño del equipo',
  };
  /**
   * Describe un conjunto de efectos, p. ej. {dmg:0.1, cd:0.05} → "+10% daño · -5% recarga de habilidades".
   * @param {object} fx Efectos.
   * @param {number} [k=1] Multiplicador (nivel).
   */
  GM.fxText = function (fx, k) {
    k = k || 1;
    return Object.keys(fx).map((key) => {
      const v = fx[key] * k, name = GM.FX_TEXT[key] || key;
      if (key === 'critMul') return `+${v.toFixed(2)}× ${name}`;
      const pct = Math.round(v * 1000) / 10;
      return `${key === 'cd' ? '-' : '+'}${pct}% ${name}`;
    }).join(' · ');
  };

  /** Reliquias: rar = índice de GM.RARITY; fx = efectos POR NIVEL. */
  GM.RELICS = [
    { id: 'moneda', name: 'Moneda de la Suerte', icon: '🪙', rar: 0, fx: { gold: 0.04 } },
    { id: 'cuchillo', name: 'Cuchillo Mellado', icon: '🔪', rar: 0, fx: { dmg: 0.03 } },
    { id: 'botas', name: 'Botas Remendadas', icon: '🥾', rar: 0, fx: { cd: 0.015 } },
    { id: 'escudo', name: 'Escudo de Cartón', icon: '🛡️', rar: 0, fx: { hp: 0.04 } },
    { id: 'trebol', name: 'Trébol Seco', icon: '🍀', rar: 0, fx: { crit: 0.005 } },
    { id: 'pala', name: 'Pala Oxidada', icon: '⛏️', rar: 0, fx: { iron: 0.06 } },
    { id: 'pergamino', name: 'Pergamino Arrugado', icon: '📜', rar: 0, fx: { frenzy: 0.05 } },
    { id: 'cinta', name: 'Cinta del Pelo', icon: '🎀', rar: 0, fx: { tap: 0.08 } },
    { id: 'anillo', name: 'Anillo del Avaro', icon: '💍', rar: 1, fx: { gold: 0.07 } },
    { id: 'espada', name: 'Espada Gemela', icon: '🗡️', rar: 1, fx: { dmg: 0.06 } },
    { id: 'amuleto', name: 'Amuleto Cardíaco', icon: '❤️', rar: 1, fx: { hp: 0.07 } },
    { id: 'ojo', name: 'Ojo de Halcón', icon: '👁️', rar: 1, fx: { crit: 0.01 } },
    { id: 'reloj', name: 'Reloj de Arena', icon: '⏳', rar: 1, fx: { cd: 0.025 } },
    { id: 'mapa', name: 'Mapa del Tesoro', icon: '🗺️', rar: 1, fx: { chest: 0.08 } },
    { id: 'cantimplora', name: 'Cantimplora Mágica', icon: '🧪', rar: 1, fx: { heal: 0.01 } },
    { id: 'corona', name: 'Corona del Casero (usada)', icon: '👑', rar: 2, fx: { gold: 0.12 } },
    { id: 'hacha', name: 'Hacha Berserker', icon: '🪓', rar: 2, fx: { dmg: 0.10 } },
    { id: 'lagrima', name: 'Lágrima de Dragón', icon: '💧', rar: 2, fx: { critMul: 0.10 } },
    { id: 'diario', name: 'Diario de Horas Extra', icon: '📓', rar: 2, fx: { offline: 0.015 } },
    { id: 'caliz', name: 'Cáliz Sagrado', icon: '🏆', rar: 2, fx: { hp: 0.10 } },
    { id: 'excalibur', name: 'Excalibur de Segunda Mano', icon: '⚔️', rar: 3, fx: { dmg: 0.16 } },
    { id: 'cuerno', name: 'Cuerno de la Abundancia', icon: '🐂', rar: 3, fx: { gold: 0.16 } },
    { id: 'relojp', name: 'Reloj Parado', icon: '⌚', rar: 3, fx: { cd: 0.04 } },
    { id: 'corazon', name: 'Corazón del Gremio', icon: '💖', rar: 3, fx: { dmg: 0.07, hp: 0.07, gold: 0.07 } },
  ];

  /**
   * Especializaciones por héroe: 3 nodos (se abren al alcanzar el nivel) con 2 opciones cada uno.
   * Cada opción: [nombre, efectos]. Efectos de héroe: dmg, hp, crit, heal, cd, abil. Del equipo: pdmg, gold.
   */
  GM.PERK_LEVELS = [20, 60, 120];
  GM.PERKS = {
    guerrero: [
      [['Escudo Reforzado', { hp: 0.6 }], ['Espada Afilada', { dmg: 0.5 }]],
      [['Grito Motivador', { pdmg: 0.2 }], ['Piel de Rinoceronte', { hp: 1.0 }]],
      [['Furia del Gremio', { dmg: 1.5 }], ['Muro Inamovible', { abil: 0.5, cd: 0.2 }]],
    ],
    maga: [
      [['Llama Viva', { dmg: 0.5 }], ['Concentración', { crit: 0.10 }]],
      [['Bola Mayor', { abil: 0.6 }], ['Recarga Rápida', { cd: 0.25 }]],
      [['Tormenta de Fuego', { dmg: 1.5 }], ['Archimaga', { crit: 0.15, abil: 0.4 }]],
    ],
    arquero: [
      [['Puntería', { crit: 0.10 }], ['Carcaj Grande', { dmg: 0.5 }]],
      [['Flechas Dobles', { dmg: 0.8 }], ['Disparo Veloz', { cd: 0.25 }]],
      [['Lluvia Mortal', { abil: 0.6 }], ['Ojo de Águila', { crit: 0.20 }]],
    ],
    clerigo: [
      [['Manos Sanadoras', { heal: 0.6 }], ['Fe Ardiente', { dmg: 0.8 }]],
      [['Plegaria Larga', { cd: 0.25 }], ['Bendición', { pdmg: 0.15 }]],
      [['Milagro', { abil: 0.8 }], ['Aureola de Oro', { gold: 0.10 }]],
    ],
    ladrona: [
      [['Dedos Ágiles', { gold: 0.10 }], ['Daga Envenenada', { dmg: 0.5 }]],
      [['Golpe Maestro', { crit: 0.12 }], ['Guante Blanco', { abil: 0.5 }]],
      [['Botín Gordo', { gold: 0.20 }], ['Asesina', { dmg: 1.5 }]],
    ],
    bardo: [
      [['Canción Larga', { abil: 0.5 }], ['Acordes Épicos', { pdmg: 0.15 }]],
      [['Estribillo Pegajoso', { cd: 0.25 }], ['Himno del Oro', { gold: 0.12 }]],
      [['Concierto Final', { pdmg: 0.3 }], ['Dúo Dinámico', { crit: 0.10, pdmg: 0.10 }]],
    ],
  };

  /**
   * Plantillas de misión. ev = evento que las hace avanzar; base/grow = meta = base × (1 + nivel × grow);
   * reward = cofre; unlock = piso máximo necesario.
   */
  GM.QUESTS = [
    { id: 'kills', ev: 'kill', text: (n) => `Derrota ${n} enemigos`, base: 30, grow: 0.5, reward: 'bronce', unlock: 1 },
    { id: 'killsType', ev: 'killType', text: (n, t) => `Derrota ${n} × ${t}`, base: 14, grow: 0.4, reward: 'bronce', unlock: 1 },
    { id: 'boss', ev: 'boss', text: (n) => `Derrota ${n} jefes`, base: 2, grow: 0.3, reward: 'plata', unlock: 5 },
    { id: 'floors', ev: 'floorUp', text: (n) => `Supera ${n} pisos`, base: 4, grow: 0.3, reward: 'bronce', unlock: 2 },
    { id: 'casts', ev: 'cast', text: (n) => `Lanza ${n} habilidades`, base: 8, grow: 0.5, reward: 'bronce', unlock: 1 },
    { id: 'taps', ev: 'tap', text: (n) => `Toca al enemigo ${n} veces`, base: 60, grow: 0.5, reward: 'bronce', unlock: 1 },
    { id: 'crits', ev: 'crit', text: (n) => `Haz ${n} golpes críticos`, base: 15, grow: 0.6, reward: 'bronce', unlock: 2 },
    { id: 'frenzy', ev: 'frenzy', text: (n) => `Activa el frenesí ${n} veces`, base: 2, grow: 0.3, reward: 'plata', unlock: 3 },
    { id: 'levels', ev: 'levels', text: (n) => `Sube ${n} niveles de héroe`, base: 15, grow: 0.8, reward: 'bronce', unlock: 1 },
    { id: 'gear', ev: 'gear', text: (n) => `Mejora ${n} piezas en la Herrería`, base: 2, grow: 0.3, reward: 'bronce', unlock: 3 },
    { id: 'chest', ev: 'chestOpen', text: (n) => `Abre ${n} cofres`, base: 2, grow: 0.3, reward: 'bronce', unlock: 2 },
    { id: 'goblin', ev: 'goblin', text: (n) => `Atrapa ${n} goblin del tesoro`, base: 1, grow: 0.2, reward: 'plata', unlock: 4 },
    { id: 'time', ev: 'time', text: (n) => `Juega ${n} minutos`, base: 6, grow: 0.3, reward: 'bronce', unlock: 1 },
    { id: 'gold', ev: 'gold', text: (n) => `Gana ${GM.fmt(n)} de oro`, base: 40, grow: 0.5, reward: 'bronce', unlock: 1, amount: true },
    { id: 'combo', ev: 'combo', max: true, text: (n) => `Alcanza un combo de ${n}`, base: 8, grow: 0.4, reward: 'bronce', unlock: 2 },
  ];

  /** Recompensa diaria (día 1 a 7 de la racha). */
  GM.DAILY = [
    { chest: 'bronce' }, { chest: 'bronce', crystals: 1 }, { chest: 'plata' }, { chest: 'bronce', crystals: 2 },
    { chest: 'plata', crystals: 2 }, { chest: 'oro' }, { chest: 'oro', crystals: 4 },
  ];

  /** Nombres de los tipos de enemigo para el bestiario (incluye jefes). */
  GM.BESTIARY = [].concat(
    Object.keys(GM.ENEMIES).map((id) => ({ id: id, name: GM.ENEMIES[id].name, sprite: GM.ENEMIES[id].sprite })),
    Object.keys(GM.BOSSES).map((i) => ({ id: 'boss' + i, name: GM.BOSSES[i].name, sprite: GM.BOSSES[i].sprite })),
  );

  /** Logros nuevos (reward = cofre). Los antiguos de data.js dan cofre de bronce. */
  const R = { b: 'bronce', p: 'plata', o: 'oro' };
  const ACH = [
    ['crit1', 'Primer golpe de suerte', 'crits', 1, 'b'], ['crit2', 'Tiro certero', 'crits', 250, 'b'], ['crit3', 'Ojo de lince', 'crits', 5000, 'p'], ['crit4', 'Suerte insultante', 'crits', 100000, 'o'],
    ['cmb1', 'Racha corta', 'combo', 10, 'b'], ['cmb2', 'Imparable', 'combo', 30, 'b'], ['cmb3', 'Combo de feria', 'combo', 60, 'p'], ['cmb4', 'Esto no se para', 'combo', 120, 'o'],
    ['fr1', 'A tope', 'frenzies', 1, 'b'], ['fr2', 'Adicto a la adrenalina', 'frenzies', 25, 'p'], ['fr3', 'Furia perpetua', 'frenzies', 250, 'o'],
    ['ch1', 'Primer cofre', 'chests', 1, 'b'], ['ch2', 'Coleccionista de cofres', 'chests', 25, 'b'], ['ch3', 'Cerrajero', 'chests', 100, 'p'], ['ch4', 'Dragón de tesoros', 'chests', 400, 'o'],
    ['rl1', 'Primera reliquia', 'relics', 1, 'b'], ['rl2', 'Trapero con suerte', 'relics', 6, 'b'], ['rl3', 'Museo en casa', 'relics', 12, 'p'], ['rl4', 'Vitrina completa', 'relics', 18, 'p'], ['rl5', 'Colección completa', 'relics', 24, 'o'],
    ['rl6', 'Brillo naranja', 'legendary', 1, 'p'], ['rl7', 'Legendario por partida doble', 'legendary', 3, 'o'], ['rl8', 'Reliquia al máximo', 'relicsMaxed', 1, 'p'],
    ['qs1', 'Mandado cumplido', 'quests', 1, 'b'], ['qs2', 'Empleado del mes', 'quests', 10, 'b'], ['qs3', 'Gremio en marcha', 'quests', 40, 'p'], ['qs4', 'Pluriempleado', 'quests', 150, 'o'],
    ['gb1', 'Cazagoblins', 'goblins', 1, 'b'], ['gb2', 'Pesadilla de goblins', 'goblins', 10, 'p'], ['gb3', 'Exterminador de tesoreros', 'goblins', 40, 'o'],
    ['dl1', 'Puntual', 'dailies', 1, 'b'], ['dl2', 'Constante', 'dailies', 7, 'p'], ['dl3', 'De la familia', 'dailies', 30, 'o'], ['st1', 'Racha de 3', 'streak', 3, 'b'], ['st2', 'Racha de 7', 'streak', 7, 'p'],
    ['pk1', 'Primera especialización', 'perks', 1, 'b'], ['pk2', 'Aprendiz de todo', 'perks', 6, 'p'], ['pk3', 'Maestros de su oficio', 'perks', 18, 'o'],
    ['bs1', 'Aprendiz de bestiario', 'bestiary', 5, 'b'], ['bs2', 'Biólogo del sótano', 'bestiary', 20, 'p'], ['bs3', 'Enciclopedia andante', 'bestiary', 50, 'o'],
    ['k5', 'Millón de bajas', 'kills', 1000000, 'o'], ['f6', 'Torre Infinita', 'maxFloor', 120, 'p'], ['f7', 'Rascacielos', 'maxFloor', 150, 'o'],
    ['a3', 'Cuatro ascensos', 'ascents', 4, 'p'], ['a4', 'Ascenso eterno', 'ascents', 6, 'o'],
    ['g3', 'Primer millón', 'goldTotal', 1e6, 'b'], ['g4', 'Billonario', 'goldTotal', 1e12, 'b'], ['g5', 'Trillonario', 'goldTotal', 1e18, 'p'], ['g6', 'Oro por un tubo', 'goldTotal', 1e30, 'p'], ['g7', 'Más oro que el Casero', 'goldTotal', 1e45, 'o'],
    ['hl1', 'Héroe de nivel 100', 'topLevel', 100, 'b'], ['hl2', 'Héroe de nivel 250', 'topLevel', 250, 'p'], ['hl3', 'Héroe de nivel 500', 'topLevel', 500, 'o'],
    ['bk1', 'Primera tanda de jefes', 'bossKills', 250, 'p'], ['bk2', 'El terror de los jefes', 'bossKills', 1000, 'o'],
  ];
  ACH.forEach((a) => GM.ACHIEVEMENTS.push({ id: a[0], name: a[1], stat: a[2], n: a[3], reward: R[a[4]] }));
  GM.ACHIEVEMENTS.forEach((a) => { if (!a.reward) a.reward = 'bronce'; });
  GM.STAT_NAMES = Object.assign(GM.STAT_NAMES || {}, {
    crits: 'Golpes críticos', frenzies: 'Frenesíes', chests: 'Cofres abiertos', quests: 'Misiones cumplidas', goblins: 'Goblins atrapados',
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
