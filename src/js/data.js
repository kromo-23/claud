/**
 * Datos del juego (todo lo que se puede ajustar sin tocar la lógica).
 * Se carga en el navegador y en Node (tests y simulador) sobre el espacio global GM.
 */
(function (root) {
  'use strict';
  const GM = root.GM || (root.GM = {});

  /** Parámetros numéricos de equilibrio. El simulador (tools/sim.js) los ajusta. */
  GM.CFG = {
    enemyScale: 1.25,      // multiplicador por piso SOLO para la Torre Infinita (pisos > 100); 1-100 usa floors.js
    enemyHp0: 10,
    enemyDmg0: 1.4,
    dmgExp: 1.0,           // exponente del daño enemigo respecto a la escala
    gold0: 1.6,
    goldExp: 0.85,         // el oro por enemigo crece como escala^goldExp
    levelGrowth: 1.07,     // crecimiento del coste de nivel de héroe
    spawnDelay: 0.5,
    killHeal: 0.10,        // curación al matar (fracción de vida máx.)
    reviveHp: 0.25,
    retryGain: 1.15,       // tras caer, reintenta cuando el equipo es un 15% más fuerte...
    retryMaxWaits: 12,     // ...o tras este número de tandas de espera (5 enemigos cada una)
    floorsPerRank: 20,
    killsPerFloor: 5,
    bossMini: { hp: 3, dmg: 1.3, gold: 5 },
    bossZone: { hp: 7, dmg: 1.6, gold: 15 },
    bossFinal: { hp: 14, dmg: 1.9, gold: 60 },
    goldenChance: 0.03,
    tapFrac: 0.05,         // daño de toque = fracción del DPS del equipo
    gearGold0: [60, 80, 120],
    gearGoldG: 5.2,
    gearIron0: [8, 8, 10],
    gearIronG: 2.1,
    gearMult: [1.55, 1.55, 1.30],
    maxGearTier: 20,
    milestones: [10, 25].concat(Array.from({ length: 59 }, (_, i) => 50 + 25 * i)), // 10, 25, 50, 75... 1500
    msMult: 2,             // multiplicador de poder por cada hito de nivel
    starBase: 8,           // divisor de la fórmula de estrellas
    starExp: 1.35,
    offlineBaseEff: 0.5,
    offlineBaseCapH: 8,
    ach: 0.02,             // bonus de daño/oro por logro
    startGold: 5,          // oro inicial de cada recorrido
    herenciaGrowth: 4,     // el talento Herencia multiplica el oro inicial por esto por nivel
    wipeFarmKills: 8,      // enemigos que se farmean tras caer antes de reintentar
    retryWaitKills: 5,     // tanda de espera extra si aún no es más fuerte
    wipeDelay: 1.5,        // pausa tras caer (s)
    goldenHp: 1.5, goldenGold: 8, goldenIron: 2,
    ironBase: 0.5, ironPerFloor: 0.06, ironBoss: 5,
    crystalGolden: 0.1, crystalMini: 0.2, crystalZoneBoss: 6,
    cdMin: 0.3,            // el enfriamiento no baja de esta fracción
    costMin: 0.4,          // el descuento de coste no baja de esta fracción
    offEffMax: 0.95,
    accountantShare: 0.5,  // parte del oro que gasta el Contable Goblin
    accountantEvery: 20,   // cada cuántos segundos actúa
    autoHealBelow: 0.55,   // el auto-lanzado de curación espera a que alguien baje de esto
    finalFloor: 100,
  };

  /** Rangos del gremio. Cada ascenso abre 20 pisos más. */
  GM.RANKS = [
    { id: 'F', name: 'Gremio en Quiebra' },
    { id: 'E', name: 'Gremio Endeudado' },
    { id: 'D', name: 'Gremio Solvente' },
    { id: 'C', name: 'Gremio Respetable' },
    { id: 'B', name: 'Gremio Legendario' },
    { id: 'A', name: 'Gremio Eterno' },
  ];

  /**
   * Héroes. type: 'phys' | 'magic'. costBase = coste de pasar de nivel 1 a 2.
   * ability.kind: shield | burst | selfBuff | heal | goldBurst | partyBuff
   */
  GM.HEROES = [
    { id: 'guerrero', name: 'Paco', cls: 'Guerrero', role: 'Tanque', type: 'phys',
      baseDps: 4, baseHp: 70, aggro: 3, heal: 0, hireFloor: 1, hireCost: 0, costBase: 4,
      ability: { name: 'Escudo Abollado', kind: 'shield', cd: 30, dur: 8, value: 0.6,
        desc: 'Reduce un 60% el daño que recibe el equipo durante 8 s.' },
      quote: '"Mi armadura tiene más abolladuras que mi currículum."' },
    { id: 'maga', name: 'Merlina', cls: 'Maga', role: 'Daño mágico', type: 'magic',
      baseDps: 5.5, baseHp: 34, aggro: 1, heal: 0, hireFloor: 3, hireCost: 150, costBase: 30,
      ability: { name: 'Bola de Fuego', kind: 'burst', cd: 25, value: 30,
        desc: 'Golpe instantáneo igual a 30 s de su daño.' },
      quote: '"No es magia, es física cuántica. Pero con más fuego."' },
    { id: 'arquero', name: 'Robín', cls: 'Arquero', role: 'Daño físico', type: 'phys',
      baseDps: 5, baseHp: 42, aggro: 1.5, heal: 0, hireFloor: 8, hireCost: 5000, costBase: 700,
      ability: { name: 'Lluvia de Flechas', kind: 'selfBuff', cd: 30, dur: 8, value: 3,
        desc: 'Triplica su daño durante 8 s.' },
      quote: '"Fallé a propósito. Era una flecha de advertencia."' },
    { id: 'clerigo', name: 'Hno. Ramón', cls: 'Clérigo', role: 'Sanador', type: 'magic',
      baseDps: 2, baseHp: 52, aggro: 1, heal: 3, hireFloor: 14, hireCost: 2.5e5, costBase: 3.5e4,
      ability: { name: 'Plegaria Express', kind: 'heal', cd: 40, value: 0.6, revive: 0.4,
        desc: 'Cura un 60% de la vida a todos y revive a los caídos.' },
      quote: '"Rezo por vosotros. El seguro médico no cubre esto."' },
    { id: 'ladrona', name: 'Lola', cls: 'Ladrona', role: 'Oro y críticos', type: 'phys',
      baseDps: 7, baseHp: 40, aggro: 1.2, heal: 0, hireFloor: 25, hireCost: 6e7, costBase: 7e6,
      goldPerLevel: 0.01,
      ability: { name: 'Guantes de Seda', kind: 'goldBurst', cd: 35, value: 12, dpsSecs: 8,
        desc: 'Golpe bajo y roba de golpe el oro de 12 enemigos.' },
      quote: '"No es robar si el dueño está muerto."' },
    { id: 'bardo', name: 'Tomás', cls: 'Bardo', role: 'Apoyo', type: 'magic',
      baseDps: 3, baseHp: 46, aggro: 1, heal: 0, hireFloor: 45, hireCost: 3e12, costBase: 3.5e11,
      aura: 0.004,
      ability: { name: 'Canción Pegadiza', kind: 'partyBuff', cd: 45, dur: 12, value: 0.8,
        desc: '+80% de daño y oro para todo el equipo durante 12 s.' },
      quote: '"Esta canción la compuse yo. Ahora no podréis olvidarla."' },
  ];

  // Segundos entre golpes visibles de cada héroe (solo afecta a la animación).
  const ATK = { guerrero: 1.0, maga: 1.4, arquero: 0.6, clerigo: 1.6, ladrona: 0.7, bardo: 1.5 };
  GM.HEROES.forEach((h) => { h.atk = ATK[h.id]; });
  // Nombre corto de la habilidad para los botones de la pantalla de combate.
  const SHORT = { guerrero: 'Escudo', maga: 'Fuego', arquero: 'Flechas', clerigo: 'Plegaria', ladrona: 'Robo', bardo: 'Canción' };
  GM.HEROES.forEach((h) => { h.ability.short = SHORT[h.id]; });

  /**
   * Tipos de enemigo. res: multiplicador de daño recibido (1 = normal).
   * sprite: nombre del sprite en sprites.js.
   */
  GM.ENEMIES = {
    rata:     { name: 'Rata Sindicalista',   sprite: 'rata',     hp: 0.8, dmg: 0.9, gold: 0.9, phys: 1.0, magic: 1.0 },
    limo:     { name: 'Limo Okupa',          sprite: 'limo',     hp: 1.2, dmg: 0.8, gold: 1.0, phys: 0.8, magic: 1.3 },
    murcielago:{ name: 'Murciélago Insomne', sprite: 'murcielago', hp: 0.7, dmg: 1.1, gold: 1.0, phys: 1.1, magic: 0.9 },
    goblin:   { name: 'Goblin Autónomo',     sprite: 'goblin',   hp: 1.0, dmg: 1.0, gold: 1.1, phys: 1.0, magic: 1.0 },
    lobo:     { name: 'Lobo con Complejo',   sprite: 'lobo',     hp: 0.9, dmg: 1.3, gold: 1.0, phys: 1.2, magic: 0.8 },
    seta:     { name: 'Seta Sospechosa',     sprite: 'seta',     hp: 1.3, dmg: 0.7, gold: 1.2, phys: 0.9, magic: 1.1 },
    esqueleto:{ name: 'Esqueleto Jubilado',  sprite: 'esqueleto', hp: 1.0, dmg: 1.1, gold: 1.1, phys: 0.5, magic: 1.5 },
    fantasma: { name: 'Fantasma Moroso',     sprite: 'fantasma', hp: 0.9, dmg: 1.0, gold: 1.2, phys: 0.25, magic: 1.4 },
    zombi:    { name: 'Zombi de Oficina',    sprite: 'zombi',    hp: 1.5, dmg: 0.9, gold: 1.1, phys: 0.9, magic: 1.1 },
    diablillo:{ name: 'Diablillo Comercial', sprite: 'diablillo', hp: 0.9, dmg: 1.2, gold: 1.2, phys: 1.3, magic: 0.6 },
    golem:    { name: 'Golem de Lava Low-Cost', sprite: 'golem', hp: 1.6, dmg: 1.0, gold: 1.3, phys: 1.2, magic: 0.45 },
    salamandra:{ name: 'Salamandra Fiestera', sprite: 'salamandra', hp: 1.0, dmg: 1.2, gold: 1.2, phys: 1.0, magic: 0.8 },
    gargola:  { name: 'Gárgola Portera',     sprite: 'gargola',  hp: 1.4, dmg: 1.1, gold: 1.3, phys: 0.5, magic: 1.3 },
    mimico:   { name: 'Mímico Administrativo', sprite: 'mimico', hp: 1.3, dmg: 1.2, gold: 1.6, phys: 1.0, magic: 1.0 },
    caballero:{ name: 'Caballero de la Fianza', sprite: 'caballero', hp: 1.2, dmg: 1.3, gold: 1.3, phys: 0.7, magic: 1.2 },
  };

  /** Jefes de zona (piso 20, 40, 60, 80, 100). */
  GM.BOSSES = {
    0: { name: 'Rey Limo I el Pegajoso', sprite: 'b_reylimo', phys: 0.9, magic: 1.2 },
    1: { name: 'Trol Peajero', sprite: 'b_trol', phys: 1.0, magic: 1.0 },
    2: { name: 'Lich Contable', sprite: 'b_lich', phys: 0.5, magic: 1.4 },
    3: { name: 'Dragoncito Hipotecado', sprite: 'b_dragon', phys: 1.1, magic: 0.7 },
    4: { name: 'Lord Casero', sprite: 'b_casero', phys: 1.0, magic: 1.0 },
  };

  /**
   * Zonas. mech: reglas propias.
   * poison = fracción del daño enemigo que ignora la aggro y daña a todo el equipo;
   * enrage = aumento de daño enemigo por segundo de combate.
   */
  GM.ZONES = [
    { id: 0, name: 'Sótano del Gremio', bg: 'sotano', enemies: ['rata', 'limo', 'murcielago'],
      mech: { poison: 0, enrage: 0 }, tip: 'Sin reglas especiales. Aquí se aprende.',
      intro: 'El Gremio de Mala Muerte lleva tres meses sin pagar el alquiler. Abajo, en el sótano, unas ratas sindicalistas exigen vacaciones pagadas. Alguien tiene que bajar.' },
    { id: 1, name: 'Bosque Cutre', bg: 'bosque', enemies: ['goblin', 'lobo', 'seta'],
      mech: { poison: 0.35, enrage: 0 }, tip: 'Veneno: parte del daño ignora al tanque y daña a todos. Un sanador ayuda mucho.',
      intro: 'Más allá del sótano hay un bosque. Se llama "Bosque Cutre" porque el cartel de "Bosque Encantado" costaba extra.' },
    { id: 2, name: 'Cripta de los Morosos', bg: 'cripta', enemies: ['esqueleto', 'fantasma', 'zombi'],
      mech: { poison: 0, enrage: 0 }, tip: 'Muertos vivientes: resisten los golpes físicos. Lleva magia.',
      intro: 'Aquí descansan los que murieron debiendo dinero. Siguen debiéndolo. Y ahora están enfadados.' },
    { id: 3, name: 'Volcán Low-Cost', bg: 'volcan', enemies: ['diablillo', 'golem', 'salamandra'],
      mech: { poison: 0, enrage: 0.05 }, tip: 'Furia: los enemigos pegan más fuerte cuanto más dura el combate. Mata rápido.',
      intro: 'Un volcán de oferta, sin ascensor ni aire acondicionado. Los diablillos te venden seguros de vida. Todos caducados.' },
    { id: 4, name: 'Torre del Casero', bg: 'torre', enemies: ['gargola', 'mimico', 'caballero', 'fantasma', 'golem'],
      mech: { poison: 0.2, enrage: 0.03 }, tip: 'Todo a la vez: veneno, furia y resistencias. Prepara bien el equipo.',
      intro: 'La torre desde la que Lord Casero cobra el alquiler del mundo entero. Cada piso, un apartamento sin ascensor. Arriba del todo, el dueño.' },
  ];

  /** Líneas de la Herrería. */
  GM.GEAR = [
    { id: 'arma', name: 'Armas', icon: '⚔️', base: 'Espada', stat: 'daño' },
    { id: 'armadura', name: 'Armaduras', icon: '🛡️', base: 'Armadura', stat: 'vida y curación' },
    { id: 'amuleto', name: 'Amuletos', icon: '📿', base: 'Amuleto', stat: 'oro' },
  ];
  GM.GEAR_MATERIALS = ['de Cartón', 'de Madera', 'de Cobre', 'de Hierro Oxidado', 'de Hierro', 'de Acero',
    'de Plata', 'de Oro Falso', 'de Mithril', 'de Obsidiana', 'de Rubí', 'de Hueso de Dragón', 'de Cristal',
    'de Estrellas', 'de Luna Llena', 'del Fin del Mes', 'de Mitología Barata', 'del Casero Descuidado',
    'de Eternidad', 'de Edición Limitada'];

  /** Edificios de la ciudad (los que suben de nivel). */
  GM.BUILDINGS = [
    { id: 'mercado', name: 'Mercado Chapucero', icon: '🏪', unlock: 1, max: 40, gold0: 100, goldG: 2.0, per: 0.08,
      desc: '+8% de oro por nivel.', effect: (l) => `+${l * 8}% oro` },
    { id: 'mina', name: 'Mina de Hierro', icon: '⛏️', unlock: 5, max: 40, gold0: 400, goldG: 2.1, rate: 0.25, growth: 1.1,
      desc: 'Produce hierro continuamente.', effect: (l) => `${(0.25 * l * Math.pow(1.1, l)).toFixed(1)} hierro/s` },
    { id: 'santuario', name: 'Santuario', icon: '⛪', unlock: 10, max: 15, gold0: 1500, goldG: 2.6, heal: 0.02, revive: 0.04,
      desc: 'Más curación al matar y los caídos vuelven con más vida.', effect: (l) => `+${l * 2}% cura / +${l * 4}% revivir` },
  ];

  /** Huecos del equipo (se mantienen al ascender). */
  GM.SLOTS = [
    { n: 2, name: 'Segundo hueco', gold: 250 },
    { n: 3, name: 'Tercer hueco', gold: 6e4 },
    { n: 4, name: 'Cuarto hueco', gold: 4e8 },
  ];

  /** Investigaciones de la Biblioteca (cristales; se mantienen al ascender). */
  GM.RESEARCH = [
    { id: 'autocast', name: 'Manual de Instrucciones', icon: '📖', cost: 3, unlock: 12,
      desc: 'Las habilidades se lanzan solas al estar listas.' },
    { id: 'turbo2', name: 'Cafeína para Todos', icon: '☕', cost: 5, unlock: 12,
      desc: 'Desbloquea la velocidad ×2.' },
    { id: 'tap', name: 'Dedo Gordo', icon: '👆', cost: 4, unlock: 12,
      desc: 'Tus toques hacen ×3 de daño.' },
    { id: 'contable', name: 'Contable Goblin', icon: '🧮', cost: 8, unlock: 20,
      desc: 'Un goblin sube niveles de héroe por ti de vez en cuando (también sin conexión).' },
    { id: 'cofres', name: 'Radar de Cofres', icon: '📡', cost: 6, unlock: 20,
      desc: 'Los enemigos dorados aparecen el doble.' },
    { id: 'horas', name: 'Horas Extra', icon: '🕒', cost: 10, unlock: 30,
      desc: 'El progreso sin conexión dura 4 horas más.' },
    { id: 'turbo3', name: 'Cafeína Intravenosa', icon: '⚡', cost: 15, unlock: 40,
      desc: 'Desbloquea la velocidad ×3.' },
    { id: 'bestiario', name: 'Bestiario Ilustrado', icon: '📚', cost: 12, unlock: 40,
      desc: '+1% de daño por cada tipo de enemigo derrotado 100 veces.' },
  ];

  /** Talentos (se compran con estrellas ⭐). max niveles; coste = 1 + floor(nivel/2) * step. */
  GM.TALENTS = [
    { id: 'fuerza', name: 'Músculo Motivacional', icon: '💪', max: 12, per: 0.6, group: 'Combate',
      desc: '+60% de daño por nivel (suma).' },
    { id: 'vida', name: 'Vitalidad de Oferta', icon: '❤️', max: 10, per: 0.4, group: 'Combate',
      desc: '+40% de vida y curación por nivel.' },
    { id: 'ritmo', name: 'Prisas', icon: '⏱️', max: 8, per: 0.05, group: 'Combate',
      desc: '-5% de enfriamiento de habilidades por nivel.' },
    { id: 'toque', name: 'Dedos Rápidos', icon: '✋', max: 8, per: 0.5, group: 'Combate',
      desc: '+50% de daño de toque por nivel.' },
    { id: 'oro', name: 'Buen Ojo para el Dinero', icon: '💰', max: 12, per: 0.5, group: 'Economía',
      desc: '+50% de oro por nivel (suma).' },
    { id: 'hierro', name: 'Imán de Chatarra', icon: '🧲', max: 8, per: 0.5, group: 'Economía',
      desc: '+50% de hierro por nivel.' },
    { id: 'regateo', name: 'Regateo Descarado', icon: '🗣️', max: 10, per: 0.03, group: 'Economía',
      desc: '-3% al coste de subir héroes por nivel.' },
    { id: 'veteranos', name: 'Memoria Muscular', icon: '🧠', max: 10, per: 8, group: 'Utilidad',
      desc: 'Los héroes empiezan cada recorrido con +8 niveles por nivel.' },
    { id: 'herencia', name: 'Herencia del Tío Rico', icon: '💼', max: 8, per: 1, group: 'Utilidad',
      desc: 'Empiezas cada recorrido con oro extra.' },
    { id: 'sueno', name: 'Sueño Productivo', icon: '😴', max: 8, per: 0.06, group: 'Utilidad',
      desc: '+6% de eficiencia sin conexión por nivel.' },
  ];

  /** Logros: cada uno da +2% de daño y oro. stat = clave de contadores en s.stats. */
  GM.ACHIEVEMENTS = [
    { id: 'k1', name: 'Primera sangre (de limo)', stat: 'kills', n: 1 },
    { id: 'k2', name: 'Exterminador de plagas', stat: 'kills', n: 100 },
    { id: 'k3', name: 'Matón profesional', stat: 'kills', n: 1500 },
    { id: 'k4', name: 'Genocida de nivel medio', stat: 'kills', n: 15000 },
    { id: 'f1', name: 'Escalera arriba', stat: 'maxFloor', n: 10 },
    { id: 'f2', name: 'Con vistas', stat: 'maxFloor', n: 25 },
    { id: 'f3', name: 'A mitad de camino', stat: 'maxFloor', n: 50 },
    { id: 'f4', name: 'Vértigo', stat: 'maxFloor', n: 75 },
    { id: 'f5', name: 'Hasta el ático', stat: 'maxFloor', n: 100 },
    { id: 'b1', name: 'Matajefes', stat: 'bossKills', n: 5 },
    { id: 'b2', name: 'Pesadilla del jefe', stat: 'bossKills', n: 25 },
    { id: 'b3', name: 'Cobrador de deudas', stat: 'bossKills', n: 100 },
    { id: 'a1', name: 'Primer ascenso', stat: 'ascents', n: 1 },
    { id: 'a2', name: 'Carrera meteórica', stat: 'ascents', n: 3 },
    { id: 'h1', name: 'Equipo completo', stat: 'heroesHired', n: 4 },
    { id: 'h2', name: 'Gremio al completo', stat: 'heroesHired', n: 6 },
    { id: 't1', name: 'Dedo nervioso', stat: 'taps', n: 100 },
    { id: 't2', name: 'Tendinitis', stat: 'taps', n: 2500 },
    { id: 'c1', name: 'Hechicero de oficina', stat: 'casts', n: 50 },
    { id: 'c2', name: 'Maestro del botón', stat: 'casts', n: 1000 },
    { id: 'g1', name: 'Brillo sospechoso', stat: 'golden', n: 10 },
    { id: 'g2', name: 'Fiebre del oro', stat: 'golden', n: 100 },
    { id: 'e1', name: 'Herrero aficionado', stat: 'gearTiers', n: 10 },
    { id: 'e2', name: 'Armero de lujo', stat: 'gearTiers', n: 40 },
    { id: 'p1', name: 'Una hora más', stat: 'hours', n: 1 },
    { id: 'p2', name: 'Esto ya es vicio', stat: 'hours', n: 5 },
    { id: 'p3', name: 'Tu familia te echa de menos', stat: 'hours', n: 10 },
    { id: 'x1', name: 'Todo en regla', stat: 'talentLevels', n: 25 },
  ];

  /** Textos de historia. */
  GM.STORY = {
    start: 'El Gremio de Mala Muerte se va a la ruina. Lord Casero, el dueño de todos los pisos del reino, sube el alquiler cada mes. Solo queda un aventurero: Paco, con una espada oxidada y mucha moral. Hora de bajar a la mazmorra.',
    boss: [
      ['¡Piiiiso!', 'El Rey Limo bloquea el paso, gelatinoso y orgulloso: "¡Este sótano es mío por derecho de okupación!"'],
      ['Peaje obligatorio', 'Un trol enorme con chaleco reflectante te corta el camino: "Son tres monedas. O cuatro. Depende de cómo te mire."'],
      ['Auditoría Final', 'El Lich Contable ajusta las gafas: "Tienes una deuda de 300 años. Intereses aparte. Procedamos a cobrarla."'],
      ['Hipoteca a tres siglos', 'Un dragoncito hecho una furia gruñe: "Pagué esta cueva a plazos y NADIE me la quita."'],
      ['El Casero', 'Lord Casero baja de su trono con un manojo de llaves: "He subido el alquiler mientras subías. Ahora te cobro la entrada."'],
    ],
    ascend: [
      ['Rango E: Gremio Endeudado', 'El Rey Limo cae. Debajo había una moneda. Con eso pagáis un mes y medio de alquiler. El gremio sube de rango... y de deudas.'],
      ['Rango D: Gremio Solvente', 'El Trol soltó su chaleco y tres monedas. Es oficial: ya no os embargan el sofá.'],
      ['Rango C: Gremio Respetable', 'El Lich Contable os deja pagar a plazos. Os dan una tarjeta de descuento en la herrería.'],
      ['Rango B: Gremio Legendario', 'El dragón vuelve a su hipoteca, ahora con carencia. Arriba, la Torre del Casero espera.'],
    ],
    ending: [
      'Lord Casero cae de rodillas, con sus llaves rotas por el suelo.',
      '"No... no podéis... ¡El alquiler es sagrado!"',
      'Paco le entrega un recibo: "Aquí tienes lo que debíamos. Y esto es el finiquito."',
      'El Gremio de Mala Muerte, por fin, es dueño de su propio edificio. Cambian el cartel: "Gremio de Muy Buena Vida".',
      'FIN... o casi. Detrás del ático hay una escalera sin final. La Torre Infinita os espera.',
    ],
  };

  /** Nombres para mostrar de las estadísticas. */
  GM.STAT_NAMES = {
    kills: 'Enemigos derrotados', bossKills: 'Jefes derrotados', taps: 'Toques', casts: 'Habilidades lanzadas',
    golden: 'Enemigos dorados', ascents: 'Ascensos', maxFloor: 'Piso máximo',
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
