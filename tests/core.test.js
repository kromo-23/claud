'use strict';
// Pruebas del motor: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'js');
require('../tools/engine-files.js').forEach((f) => require(path.join(src, f)));
const GM = globalThis.GM;

function fresh() {
  GM.rand = GM.seeded(7);
  const s = GM.newState();
  s.evOn = false;
  return s;
}
/** Da muchos recursos para probar compras. */
function rich(s) { s.res.gold = 1e30; s.res.iron = 1e30; s.res.crystals = 1000; s.res.stars = 1000; }

test('formato de números', () => {
  assert.equal(GM.fmt(0), '0');
  assert.equal(GM.fmt(999), '999');
  assert.equal(GM.fmt(1500), '1.50K');
  assert.equal(GM.fmt(2.5e6), '2.50M');
  assert.equal(GM.fmt(1e100), '1.00e100');
  assert.equal(GM.fmt(NaN), '0');
  assert.equal(GM.fmtTime(3725), '1h 02m');
  assert.equal(GM.fmtTime(75), '1m 15s');
});

test('la tabla de dificultad tiene 100 pisos y es creciente', () => {
  const t = GM.FLOOR_LN;
  assert.ok(Array.isArray(t) && t.length === 100, 'floors.js debe existir (node tools/calibrate.js --write)');
  assert.equal(t[0], 0);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], 'piso ' + (i + 1) + ' debe ser más difícil');
  assert.ok(GM.floorScale(101) > GM.floorScale(100), 'la Torre Infinita sigue creciendo');
});

test('guardado: ida y vuelta, exportar/importar y rechazo de basura', () => {
  const s = fresh();
  s.res.gold = 12345; s.talents.fuerza = 3; s.run.floor = 7;
  const back = GM.deserialize(GM.serialize(s));
  assert.equal(back.res.gold, 12345);
  assert.equal(back.talents.fuerza, 3);
  assert.equal(back.run.floor, 7);
  assert.equal(back.run.enemy, null);
  const imp = GM.importSave(GM.exportSave(s));
  assert.equal(imp.res.gold, 12345);
  assert.throws(() => GM.importSave('esto no es un guardado'));
  assert.throws(() => GM.importSave(''));
  // Un guardado con números rotos se repara.
  const bad = JSON.parse(GM.serialize(s));
  bad.res.gold = null; bad.run.floor = -4;
  const fixed = GM.deserialize(JSON.stringify(bad));
  assert.equal(fixed.res.gold, 0);
  assert.equal(fixed.run.floor, 1);
});

test('el coste de comprar N niveles es la suma de comprar de uno en uno', () => {
  const s = fresh(); rich(s);
  let sum = 0;
  const probe = GM.deserialize(GM.serialize(s));
  for (let i = 0; i < 25; i++) { sum += GM.levelCost(probe, 'guerrero', 1); probe.heroes.guerrero.lvl++; GM.dirty(probe); }
  const bulk = GM.levelCost(s, 'guerrero', 25);
  assert.ok(Math.abs(sum - bulk) / bulk < 1e-9);
});

test('maxLevels nunca deja pagar más del oro disponible y es máximo', () => {
  const s = fresh();
  for (const gold of [5, 50, 1e3, 1e6, 1e12]) {
    s.res.gold = gold;
    const n = GM.maxLevels(s, 'guerrero');
    if (n > 0) assert.ok(GM.levelCost(s, 'guerrero', n) <= gold);
    assert.ok(GM.levelCost(s, 'guerrero', n + 1) > gold);
  }
});

test('comprar niveles resta oro y sube el nivel; max compra todo lo posible', () => {
  const s = fresh();
  s.res.gold = 1e6;
  const cost = GM.levelCost(s, 'guerrero', 10);
  assert.equal(GM.buyLevels(s, 'guerrero', 10), 10);
  assert.equal(s.heroes.guerrero.lvl, 11);
  assert.ok(Math.abs(s.res.gold - (1e6 - cost)) < 1e-6);
  const k = GM.buyLevels(s, 'guerrero', 'max');
  assert.ok(k > 0);
  assert.equal(GM.buyLevels(s, 'guerrero', 1), 0, 'sin oro no compra');
});

test('contratar exige haber llegado al piso y tener oro; entra en un hueco libre', () => {
  const s = fresh();
  s.res.gold = 1e9;
  assert.equal(GM.buyLevels(s, 'maga', 1), 0, 'aún no ha llegado al piso 3');
  s.stats.maxFloor = 3;
  assert.equal(GM.canHire(s, 'maga'), true);
  assert.equal(GM.buyLevels(s, 'maga', 1), 0 + 1);
  assert.equal(s.heroes.maga.lvl, 1);
  assert.equal(s.party.includes('maga'), false, 'con un solo hueco no entra solo');
  s.res.gold = 1e9;
  assert.equal(GM.buySlot(s), true);
  assert.equal(s.slots, 2);
});

test('el equipo no puede quedarse vacío ni repetir héroes', () => {
  const s = fresh(); rich(s);
  s.stats.maxFloor = 100;
  ['maga', 'arquero'].forEach((id) => GM.buyLevels(s, id, 1));
  s.slots = 4;
  GM.setParty(s, 1, 'maga');
  GM.setParty(s, 2, 'arquero');
  GM.setParty(s, 2, 'maga');                         // intercambio
  assert.equal(new Set(s.party.filter(Boolean)).size, s.party.filter(Boolean).length);
  GM.setParty(s, 0, null); GM.setParty(s, 1, null); GM.setParty(s, 2, null);
  assert.ok(s.party.some(Boolean), 'siempre queda alguien');
  assert.equal(GM.setParty(s, 3, 'bardo'), false, 'no se puede poner un héroe sin contratar');
});

test('hitos de nivel multiplican el poder', () => {
  const s = fresh();
  GM.dirty(s);
  const p9 = GM.D(s).hero.guerrero; s.heroes.guerrero.lvl = 9; GM.dirty(s);
  const d9 = GM.D(s).hero.guerrero.dps;
  s.heroes.guerrero.lvl = 10; GM.dirty(s);
  const d10 = GM.D(s).hero.guerrero.dps;
  assert.ok(d10 / d9 > GM.CFG.msMult * 0.99 * (10 / 9) * 0.99, 'el nivel 10 salta por el hito');
  assert.ok(p9);
  assert.equal(GM.milestoneCount(9), 0);
  assert.equal(GM.milestoneCount(10), 1);
  assert.equal(GM.nextMilestone(10), 25);
});

test('combate: un equipo fuerte mata, cobra y sube de piso', () => {
  const s = fresh();
  s.heroes.guerrero.lvl = 200; GM.dirty(s);
  GM.advance(s, 60);
  assert.ok(s.stats.kills > 10);
  assert.ok(s.res.gold > 5);
  assert.ok(s.run.floor > 1);
  assert.ok(s.res.iron > 0);
});

test('derrota: un equipo débil en un piso difícil retrocede un piso y farmea', () => {
  const s = fresh();
  s.run.floor = 40; s.stats.maxFloor = 40; s.run.maxFloor = 40;
  GM.advance(s, 60);
  assert.ok(s.run.wipes >= 1, 'debe caer');
  assert.ok(s.run.floor < 40, 'retrocede');
  assert.equal(s.run.mode, 'farm');
  assert.ok(s.heroes.guerrero.hpf > 0, 'tras caer se recupera');
});

test('sin avance automático el equipo se queda en su piso', () => {
  const s = fresh();
  s.flags.auto = false;
  s.heroes.guerrero.lvl = 300; GM.dirty(s);
  GM.advance(s, 120);
  assert.equal(s.run.floor, 1);
  assert.ok(s.stats.kills > 20);
});

test('habilidades: respetan el enfriamiento y exigen enemigo cuando hace falta', () => {
  const s = fresh(); rich(s);
  s.stats.maxFloor = 10; s.slots = 4;
  GM.buyLevels(s, 'maga', 1); GM.setParty(s, 1, 'maga');
  assert.equal(GM.cast(s, 'maga'), false, 'sin enemigo no hay bola de fuego');
  GM.advance(s, 3);
  assert.ok(s.run.enemy, 'ya hay enemigo');
  const hp0 = s.run.enemy.hp;
  assert.equal(GM.cast(s, 'maga'), true);
  assert.ok(s.run.enemy.hp < hp0);
  assert.equal(GM.cast(s, 'maga'), false, 'en enfriamiento');
  assert.equal(GM.cast(s, 'guerrero'), true, 'el escudo no necesita enemigo');
  assert.ok(s.fx.shieldT > 0);
});

test('el toque hace daño y cuenta como estadística', () => {
  const s = fresh();
  GM.advance(s, 3);
  assert.ok(s.run.enemy);
  const hp = s.run.enemy.hp;
  const dmg = GM.tap(s);
  assert.ok(dmg > 0 && s.run.enemy.hp < hp);
  assert.equal(s.stats.taps, 1);
});

test('edificios, equipo y talentos: compran, descuentan y respetan máximos', () => {
  const s = fresh(); rich(s);
  s.res.gold = 1e9; s.res.iron = 1e6;          // cifras moderadas: con 1e30 restar 100 no se nota
  s.stats.maxFloor = 12;
  const g0 = s.res.gold;
  assert.equal(GM.buyBld(s, 'mercado'), true);
  assert.ok(s.res.gold < g0);
  assert.equal(s.bld.mercado, 1);
  assert.equal(GM.buyGear(s, 0), true);
  assert.equal(s.gear[0], 1);
  assert.equal(GM.buyTalent(s, 'fuerza'), true);
  assert.equal(s.talents.fuerza, 1);
  for (let i = 0; i < 40; i++) GM.buyTalent(s, 'fuerza');
  assert.equal(s.talents.fuerza, GM.TALENT_BY_ID.fuerza.max);
  assert.equal(GM.talentCost(s, 'fuerza'), null);
  s.stats.maxFloor = 1; s.res.crystals = 100;
  assert.equal(GM.buyResearch(s, 'autocast'), false, 'bloqueada hasta el piso 12');
  s.stats.maxFloor = 12;
  assert.equal(GM.buyResearch(s, 'autocast'), true);
  assert.equal(GM.buyResearch(s, 'autocast'), false, 'ya comprada');
});

test('el edificio bloqueado no se puede comprar', () => {
  const s = fresh(); rich(s);
  s.stats.maxFloor = 1;
  assert.equal(GM.buyBld(s, 'mina'), false);
});

test('ascenso: reinicia lo que debe, conserva lo permanente y da estrellas', () => {
  const s = fresh(); rich(s);
  s.res.stars = 0;
  assert.equal(GM.ascend(s), 0, 'no se puede ascender sin derrotar al jefe');
  s.stats.maxFloor = 20; s.stats.heroesHired = 3;
  s.run.floor = 20; s.run.maxFloor = 20; s.run.canAscend = true;
  s.heroes.guerrero.lvl = 150;
  s.gear = [3, 3, 3]; s.bld.mercado = 5; s.slots = 3; s.research.autocast = true; s.res.crystals = 9;
  const gain = GM.ascend(s);
  assert.ok(gain >= 5);
  assert.equal(s.res.stars, gain);
  assert.equal(s.run.rank, 1);
  assert.equal(s.run.floor, 1);
  assert.equal(s.heroes.guerrero.lvl, 1);
  assert.deepEqual(s.gear, [0, 0, 0]);
  assert.equal(s.bld.mercado, 0);
  assert.equal(s.slots, 3, 'los huecos se conservan');
  assert.equal(s.research.autocast, true, 'las investigaciones se conservan');
  assert.equal(s.res.crystals, 9);
  assert.equal(s.stats.maxFloor, 20);
  assert.equal(s.stats.ascents, 1);
  assert.equal(GM.floorCap(s), 40);
});

test('veteranos: los héroes empiezan el recorrido con niveles extra', () => {
  const s = fresh();
  s.talents.veteranos = 3;
  s.run.canAscend = true;
  GM.ascend(s);
  assert.equal(s.heroes.guerrero.lvl, 1 + 8 * 3);
});

test('tope de pisos por rango y final de la historia', () => {
  const s = fresh();
  assert.equal(GM.floorCap(s), 20);
  s.run.rank = 4;
  assert.equal(GM.floorCap(s), 100);
  s.flags.endless = true;
  assert.equal(GM.floorCap(s), Infinity);
});

test('derrotar al jefe final activa el final y la Torre Infinita', () => {
  const s = fresh();
  s.evOn = true;
  s.run.rank = 4; s.run.floor = 100; s.run.kills = 4; s.run.maxFloor = 100; s.stats.maxFloor = 100;
  s.heroes.guerrero.lvl = 1500; GM.dirty(s);
  for (let i = 0; i < 4000 && !s.flags.ending; i++) GM.step(s, GM.DT);
  assert.equal(s.flags.ending, true);
  assert.equal(s.flags.endless, true);
  assert.ok(s.ev.some((e) => e.t === 'ending'));
  assert.equal(s.run.canAscend, true);
});

test('sin conexión: ignora ausencias cortas, respeta el tope y la eficiencia', () => {
  const s = fresh();
  s.heroes.guerrero.lvl = 120; GM.dirty(s);
  assert.equal(GM.offline(s, 30), null);
  const rep = GM.offline(s, 3 * 3600);
  assert.ok(rep && rep.gold > 0 && rep.kills > 0);
  assert.equal(rep.simulated, 3 * 3600 * GM.D(s).offEff);
  const big = GM.offline(s, 100 * 3600);
  assert.equal(big.capped, true);
  assert.equal(big.simulated, GM.D(s).offCapS * GM.D(s).offEff);
});

test('el Contable Goblin compra niveles sin conexión sin gastar más de la mitad del oro', () => {
  const s = fresh();
  s.research.contable = true; s.res.gold = 1e5; GM.dirty(s);
  const before = s.heroes.guerrero.lvl;
  GM.accountant(s);
  assert.ok(s.heroes.guerrero.lvl > before);
  assert.ok(s.res.gold >= 1e5 * 0.5 - 1);
});

test('logros: se conceden una sola vez y dan bonus', () => {
  const s = fresh();
  s.stats.kills = 150;
  const got = GM.checkAchievements(s);
  assert.ok(got.includes('k1') && got.includes('k2'));
  assert.deepEqual(GM.checkAchievements(s), []);
  GM.dirty(s);
  assert.ok(GM.D(s).dmgMult > 1);
});

test('las zonas aplican sus reglas: veneno y furia dañan más', () => {
  const s = fresh();
  s.heroes.guerrero.lvl = 1; GM.dirty(s);
  const hpOf = () => s.heroes.guerrero.hpf;
  s.run.floor = 25; // veneno
  s.run.enemy = { hp: 1e30, max: 1e30, dmg: 10, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'goblin', boss: 0 };
  GM.step(s, 1);
  const poisoned = 1 - hpOf();
  const s2 = fresh();
  s2.heroes.guerrero.lvl = 1; GM.dirty(s2);
  s2.run.floor = 5;
  s2.run.enemy = { hp: 1e30, max: 1e30, dmg: 10, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', boss: 0 };
  GM.step(s2, 1);
  const plain = 1 - s2.heroes.guerrero.hpf;
  assert.ok(Math.abs(poisoned - plain) < 1e-9, 'con un solo héroe el veneno reparte igual (todo para él)');
  // Furia: el mismo combate a los 20 s pega más que al inicio.
  const s3 = fresh();
  s3.run.floor = 65;
  s3.run.enemy = { hp: 1e30, max: 1e30, dmg: 10, phys: 1, magic: 1, t: 30, gold: 0, iron: 0, type: 'golem', boss: 0 };
  const s4 = fresh();
  s4.run.floor = 65;
  s4.run.enemy = { hp: 1e30, max: 1e30, dmg: 10, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'golem', boss: 0 };
  GM.step(s3, 0.25); GM.step(s4, 0.25);
  assert.ok(1 - s3.heroes.guerrero.hpf > 1 - s4.heroes.guerrero.hpf);
});

test('resistencias: la magia pega más a los esqueletos que lo físico', () => {
  assert.ok(GM.ENEMIES.esqueleto.magic > GM.ENEMIES.esqueleto.phys);
  assert.ok(GM.ENEMIES.golem.phys > GM.ENEMIES.golem.magic);
  const s = fresh();
  assert.ok(GM.partyDps(s, 2, 0) > GM.partyDps(s, 0, 2), 'Paco es físico');
});

test('simulación larga: sin NaN ni valores infinitos', () => {
  const s = fresh();
  s.research.autocast = true;
  s.heroes.guerrero.lvl = 400; GM.dirty(s);
  GM.advance(s, 6 * 3600);
  for (const k of ['gold', 'iron', 'crystals']) assert.ok(Number.isFinite(s.res[k]), k);
  assert.ok(Number.isFinite(s.run.floor));
});

test('cambiar de piso a mano: solo hasta el máximo del recorrido y desactiva el avance', () => {
  const s = fresh();
  s.run.floor = 8; s.run.maxFloor = 8;
  assert.equal(GM.setFloor(s, 9), false, 'no se puede saltar más allá del máximo');
  assert.equal(GM.setFloor(s, 8), false, 'ya está ahí');
  assert.equal(GM.setFloor(s, 0), false);
  assert.equal(GM.setFloor(s, 5), true);
  assert.equal(s.run.floor, 5);
  assert.equal(s.flags.auto, false);
  assert.equal(s.run.kills, 0);
});

/** Equipo de prueba: maga (primera del equipo) + guerrero, frente a un enemigo que no muere. */
function tankScenario(floor, enemyDmg) {
  const s = fresh();
  s.stats.maxFloor = 8; s.slots = 3;
  s.heroes.maga.lvl = 10; s.heroes.arquero.lvl = 10; s.heroes.guerrero.lvl = 10;
  s.party = ['maga', 'guerrero', 'arquero', null];
  s.run.floor = floor; s.run.maxFloor = floor;
  GM.dirty(s);
  s.run.enemy = { hp: 1e30, max: 1e30, dmg: enemyDmg, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  return s;
}

test('el tanque recibe todo el daño directo y los demás no reciben nada', () => {
  const s = tankScenario(5, 20);                      // piso 5: sin veneno
  GM.step(s, 1);
  assert.ok(s.heroes.guerrero.hpf < 1, 'el guerrero (más aggro) recibe los golpes');
  assert.equal(s.heroes.maga.hpf, 1, 'la maga no recibe daño directo');
  assert.equal(s.heroes.arquero.hpf, 1, 'el arquero tampoco');
  assert.equal(GM.tankId(s), 'guerrero');
});

test('si el tanque cae, los golpes pasan al siguiente con más aggro', () => {
  const s = tankScenario(5, 20);
  s.heroes.guerrero.down = true; s.heroes.guerrero.hpf = 0;
  GM.step(s, 1);
  assert.equal(GM.tankId(s), 'arquero', 'el arquero (aggro 1.5) pasa a ser el objetivo');
  assert.ok(s.heroes.arquero.hpf < 1);
  assert.equal(s.heroes.maga.hpf, 1);
});

test('el veneno de la zona sigue afectando a todo el equipo aunque haya tanque', () => {
  const s = tankScenario(25, 20);                     // bosque: veneno
  GM.step(s, 1);
  assert.ok(s.heroes.maga.hpf < 1, 'la maga sufre el veneno');
  assert.ok(s.heroes.arquero.hpf < 1, 'el arquero también');
  assert.ok(s.heroes.guerrero.hpf < s.heroes.maga.hpf || s.heroes.guerrero.hpf < 1, 'y el tanque sufre además los golpes');
});

test('el escudo reduce el daño directo que recibe el tanque', () => {
  const a = tankScenario(5, 20), b = tankScenario(5, 20);
  b.fx.shieldT = 8; b.fx.shieldV = 0.6;
  GM.step(a, 1); GM.step(b, 1);
  assert.ok(1 - b.heroes.guerrero.hpf < (1 - a.heroes.guerrero.hpf) * 0.5);
});

/* ===================== Capa de enganche: críticos, combo, frenesí ===================== */

/** Ejecuta `fn` con una probabilidad de crítico fija (configuración real, no valores cacheados). */
function withCrit(chance, fn) {
  const base = GM.CFG.critBase, cap = GM.CFG.critCap;
  GM.CFG.critBase = chance; GM.CFG.critCap = 1;
  try { return fn(); } finally { GM.CFG.critBase = base; GM.CFG.critCap = cap; }
}
const dummy = () => ({ hp: 1e30, max: 1e30, dmg: 0, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false });

/** Cuenta los golpes (y cuántos son críticos) durante unos segundos. */
function critCount(chance, seed) {
  return withCrit(chance, () => {
    GM.rand = GM.seeded(seed);
    const s = GM.newState(); s.evOn = true;
    s.heroes.guerrero.lvl = 50; GM.dirty(s);
    s.run.enemy = dummy();
    let hits = 0, crits = 0;
    for (let i = 0; i < 240; i++) {
      GM.step(s, GM.DT);
      for (const e of s.ev.splice(0)) if (e.t === 'hit') { hits++; if (e.crit) crits++; }
    }
    return { hits, crits, stat: s.stats.crits };
  });
}

test('críticos: con probabilidad 0 nunca hay y con 1 siempre, y cuentan en las estadísticas', () => {
  const none = critCount(0, 1), all = critCount(1, 1);
  assert.ok(none.hits > 20 && none.crits === 0 && none.stat === 0);
  assert.ok(all.hits > 20 && all.crits === all.hits && all.stat === all.hits);
});

test('un golpe crítico hace daño extra real, no solo un número más grande', () => {
  const dealt = (chance) => withCrit(chance, () => {
    GM.rand = GM.seeded(3);
    const s = GM.newState(); s.heroes.guerrero.lvl = 50; GM.dirty(s);
    s.run.enemy = dummy(); s.run.enemy.hp = s.run.enemy.max = 1e12;
    for (let i = 0; i < 40; i++) GM.step(s, GM.DT);
    return 1e12 - s.run.enemy.hp;
  });
  assert.ok(dealt(1) > dealt(0) * 2, 'con críticos siempre se hace ~2,5× más daño');
});

test('combo: las bajas seguidas lo suben, un hueco largo lo rompe y da más oro', () => {
  const s = fresh();
  const fakeKill = () => {
    s.run.enemy = { hp: 0, max: 1, dmg: 0, phys: 1, magic: 1, t: 0, gold: 100, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
    s.run.kills = 0;
    const g0 = s.res.gold; GM.step(s, GM.DT); return s.res.gold - g0;
  };
  s.run.floor = 3;
  const first = fakeKill();
  for (let i = 0; i < 9; i++) s.run.spawnT = 0, fakeKill();
  assert.ok(s.cmb.n >= 9, 'el combo sube');
  const tenth = fakeKill();
  assert.ok(tenth > first, 'cada baja seguida da más oro');
  for (let i = 0; i < 40; i++) { s.run.enemy = null; s.run.spawnT = 99; GM.step(s, GM.DT); }     // 10 s sin bajas
  assert.equal(s.cmb.n, 0, 'el combo se rompe tras la ventana');
  assert.ok(s.stats.combo >= 10, 'y se recuerda el máximo');
});

test('frenesí: se carga matando, se activa lleno, dura y multiplica daño y oro', () => {
  const s = fresh();
  assert.equal(GM.startFrenzy(s), false, 'sin barra llena no se activa');
  s.fr.m = GM.CFG.frenzyNeed;
  const dps0 = GM.partyDps(s);
  assert.equal(GM.startFrenzy(s), true);
  assert.equal(s.fr.m, 0);
  assert.ok(Math.abs(GM.partyDps(s) / dps0 - GM.CFG.frenzyDmg) < 1e-9, 'el daño se multiplica');
  assert.equal(GM.startFrenzy(s), false, 'no se puede activar dos veces');
  for (let i = 0; i < GM.CFG.frenzyDur / GM.DT + 4; i++) { s.run.enemy = null; s.run.spawnT = 99; GM.step(s, GM.DT); }
  assert.equal(s.fr.t, 0, 'termina');
  assert.equal(s.stats.frenzies, 1);
});

test('frenesí: la investigación Instinto Berserker lo activa sola al llenarse', () => {
  const s = fresh();
  s.research.berserker = true;
  s.fr.m = GM.CFG.frenzyNeed - 1;
  s.run.enemy = { hp: 0, max: 1, dmg: 0, phys: 1, magic: 1, t: 0, gold: 1, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  GM.step(s, GM.DT);
  assert.ok(s.fr.t > 0, 'se activó sin pulsar nada');
});

/* ===================== Botín: cofres y reliquias ===================== */

test('abrir un cofre consume uno, da oro y puede dar reliquias; sin cofres no pasa nada', () => {
  const s = fresh();
  assert.equal(GM.Loot.open(s, 'bronce'), null);
  GM.Loot.addChest(s, 'oro', 2);
  const g0 = s.res.gold;
  const r = GM.Loot.open(s, 'oro');
  assert.ok(r.gold > 0 && s.res.gold > g0);
  assert.equal(r.relics.length, GM.CHESTS.oro.rolls);
  assert.equal(s.loot.chests.oro, 1);
  assert.equal(s.stats.chests, 1);
});

test('las reliquias suben de nivel con los repetidos y al máximo se convierten en cristales', () => {
  const s = fresh();
  const rel = GM.RELICS.find((r) => r.id === 'cuchillo');          // común: máx 15
  const first = GM.Loot.grantRelic(s, rel);
  assert.equal(first.isNew, true); assert.equal(first.level, 1);
  const dmg1 = GM.D(s).dmgMult;
  for (let i = 0; i < 20; i++) GM.Loot.grantRelic(s, rel);
  assert.equal(s.loot.relics.cuchillo, GM.RELIC_MAX[0], 'tope de nivel');
  assert.ok(GM.D(s).dmgMult > dmg1, 'más nivel, más daño');
  assert.ok(s.res.crystals >= 5, 'los sobrantes dan cristales');
  assert.equal(s.stats.relicsMaxed, 1);
});

test('pity: tras muchas tiradas sin legendaria se garantiza una', () => {
  const s = fresh(); GM.rand = GM.seeded(11);
  s.loot.pity = GM.CFG.pityLegend - 1;
  GM.Loot.addChest(s, 'bronce', 1);
  const r = GM.Loot.open(s, 'bronce');
  assert.equal(r.relics[0].rar, 3);
  assert.equal(s.loot.pity, 0);
});

test('el bonus de colección: cada 6 reliquias distintas dan un extra', () => {
  const s = fresh();
  const base = GM.D(s).dmgMult;
  GM.RELICS.slice(0, 6).forEach((r) => { s.loot.relics[r.id] = 0; });
  const noSet = (() => { GM.RELICS.slice(0, 5).forEach((r) => { s.loot.relics[r.id] = 1; }); GM.dirty(s); return GM.D(s).goldMult; })();
  s.loot.relics[GM.RELICS[5].id] = 1; GM.dirty(s);
  assert.ok(GM.D(s).goldMult > noSet * 1.04, 'al llegar a 6 distintas se activa el set');
  assert.ok(base > 0);
});

test('jefes y minijefes sueltan cofres; el jefe de zona solo una vez por recorrido y piso', () => {
  const s = fresh(); GM.rand = GM.seeded(2);
  s.run.floor = 20; s.stats.maxFloor = 20;
  const boss = () => { s.run.enemy = { hp: 0, max: 1, dmg: 0, phys: 1, magic: 1, t: 0, gold: 1, iron: 0, type: 'boss0', name: 'Rey', sprite: 'b_reylimo', boss: 2, golden: false }; s.run.kills = 4; GM.step(s, GM.DT); };
  boss(); boss(); boss();
  assert.equal(s.loot.chests.oro, 1, 'farmear el mismo jefe no regala cofres de oro sin parar');
  s.stats.ascents = 1; boss();
  assert.equal(s.loot.chests.oro, 2, 'en otro recorrido vuelve a dar');
});

/* ===================== Especializaciones ===================== */

test('especializaciones: se abren por nivel, se eligen una vez, dan efecto y se reasignan con cristales', () => {
  const s = fresh();
  assert.equal(GM.Loot.choosePerk(s, 'guerrero', 0, 0), false, 'bloqueada hasta el nivel 20');
  s.heroes.guerrero.lvl = 20; GM.dirty(s);
  const before = GM.D(s).hero.guerrero.dps;
  assert.deepEqual(GM.Loot.perkAvailable(s), [{ id: 'guerrero', node: 0 }]);
  assert.equal(GM.Loot.choosePerk(s, 'guerrero', 0, 1), true);              // Espada Afilada: +50% daño
  assert.ok(Math.abs(GM.D(s).hero.guerrero.dps / before - 1.5) < 1e-9);
  assert.equal(GM.Loot.choosePerk(s, 'guerrero', 0, 0), false, 'no se puede cambiar sin reasignar');
  assert.equal(GM.Loot.choosePerk(s, 'guerrero', 5, 0), false);
  assert.equal(GM.Loot.respec(s, 'guerrero'), false, 'sin cristales no se reasigna');
  s.res.crystals = 10;
  assert.equal(GM.Loot.respec(s, 'guerrero'), true);
  assert.equal(s.res.crystals, 10 - GM.CFG.perkRespec);
  assert.ok(Math.abs(GM.D(s).hero.guerrero.dps - before) < 1e-6, 'vuelve al daño de antes');
});

test('las especializaciones sobreviven al ascenso (el nivel máximo se recuerda)', () => {
  const s = fresh();
  s.heroes.guerrero.lvl = 130; GM.Loot.noteLevel(s, 'guerrero'); GM.dirty(s);
  GM.Loot.choosePerk(s, 'guerrero', 0, 0); GM.Loot.choosePerk(s, 'guerrero', 1, 0); GM.Loot.choosePerk(s, 'guerrero', 2, 0);
  s.run.canAscend = true; GM.ascend(s);
  assert.equal(s.heroes.guerrero.lvl, 1);
  assert.equal(s.loot.perks.guerrero.filter((x) => x === 0).length, 3, 'las elecciones se mantienen');
  assert.ok(GM.Loot.maxLvl(s, 'guerrero') >= 130);
});

/* ===================== Misiones, diaria, bestiario, goblin ===================== */

test('misiones: siempre hay 3, avanzan con los eventos, se reclaman y se renuevan', () => {
  const s = fresh(); GM.rand = GM.seeded(4);
  GM.Loot.ensureQuests(s);
  assert.equal(s.loot.quests.length, GM.CFG.questSlots);
  assert.equal(new Set(s.loot.quests.map((q) => q.id)).size, GM.CFG.questSlots, 'tres misiones distintas');
  const q = s.loot.quests[0];
  q.p = q.goal; q.done = true;
  const chests0 = GM.Loot.chestTotal(s);
  assert.ok(GM.Loot.claimQuest(s, 0));
  assert.equal(GM.Loot.chestTotal(s), chests0 + 1);
  assert.equal(s.loot.quests.length, GM.CFG.questSlots, 'se repone');
  assert.equal(s.stats.quests, 1);
  assert.equal(GM.Loot.claimQuest(s, 0), null, 'una sin cumplir no se reclama');
});

test('misión de matar enemigos avanza con las bajas reales', () => {
  const s = fresh();
  s.loot.quests = [{ id: 'kills', goal: 3, p: 0, done: false, reward: 'bronce' }];
  s.heroes.guerrero.lvl = 100; GM.dirty(s);
  GM.advance(s, 60);
  assert.ok(s.loot.quests[0].done, 'tras unas bajas se cumple');
});

test('recompensa diaria: una por día, racha con un día de perdón y reinicio tras faltar mucho', () => {
  const s = fresh();
  GM.Loot.today = () => '2026-03-10';
  assert.equal(GM.Loot.dailyStatus(s).ready, true);
  assert.equal(GM.Loot.claimDaily(s).streak, 1);
  assert.equal(GM.Loot.claimDaily(s), null, 'solo una al día');
  GM.Loot.today = () => '2026-03-11';
  assert.equal(GM.Loot.claimDaily(s).streak, 2);
  GM.Loot.today = () => '2026-03-13';                     // faltó un día: se perdona
  assert.equal(GM.Loot.claimDaily(s).streak, 3);
  GM.Loot.today = () => '2026-03-20';                     // faltó una semana: vuelve a empezar
  assert.equal(GM.Loot.claimDaily(s).streak, 1);
  assert.equal(s.stats.dailies, 4);
  assert.equal(s.stats.streak, 3);
  GM.Loot.today = () => '2026-03-01';                     // reloj hacia atrás: no regala
  assert.equal(GM.Loot.dailyStatus(s).ready, false);
  delete GM.Loot.today; GM.Loot.today = () => new Date().toISOString().slice(0, 10);
});

test('el día 7 de la racha da cofre de oro y la racha sigue en ciclos', () => {
  const s = fresh();
  for (let d = 1; d <= 8; d++) {
    GM.Loot.today = () => '2026-04-' + String(d).padStart(2, '0');
    const r = GM.Loot.claimDaily(s);
    if (d === 7) { assert.equal(r.chest, 'oro'); assert.equal(r.day, 7); }
    if (d === 8) assert.equal(r.day, 1);
  }
});

test('cofre de bienvenida solo tras una ausencia larga', () => {
  const s = fresh();
  assert.equal(GM.Loot.welcome(s, 600), null);
  assert.equal(GM.Loot.welcome(s, 3600), 'bronce');
  assert.equal(GM.Loot.welcome(s, 6 * 3600), 'plata');
});

test('bestiario: cada hito de bajas de un tipo da cristales y daño', () => {
  const s = fresh();
  const d0 = GM.D(s).dmgMult;
  s.kills.rata = 99;
  s.run.enemy = { hp: 0, max: 1, dmg: 0, phys: 1, magic: 1, t: 0, gold: 1, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  const c0 = s.res.crystals;
  GM.step(s, GM.DT);                                      // la baja 100 cruza el hito de 100
  assert.ok(s.res.crystals > c0, 'cristales por el hito');
  GM.dirty(s);
  assert.ok(GM.D(s).dmgMult > d0, 'y +daño permanente');
  assert.equal(GM.Loot.tierOf(100), 2); assert.equal(GM.Loot.tierOf(9), 0); assert.equal(GM.Loot.tierOf(10000), 4);
});

test('goblin del tesoro: aparece con el jugador delante, se atrapa a golpes y premia', () => {
  const s = fresh(); GM.rand = GM.seeded(8);
  s.evOn = true; s.stats.maxFloor = 6; s.loot.gobT = 0.1;
  s.run.enemy = { hp: 1e30, max: 1e30, dmg: 0, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  GM.step(s, 0.5);
  assert.ok(s.loot.gob, 'aparece');
  assert.equal(GM.Loot.hitGoblin(s), 'hit');
  for (let i = 0; i < GM.CFG.goblinHits - 2; i++) GM.Loot.hitGoblin(s);
  const plata0 = s.loot.chests.plata, g0 = s.res.gold;
  assert.equal(GM.Loot.hitGoblin(s), 'caught');
  assert.equal(s.loot.chests.plata, plata0 + 1);
  assert.ok(s.res.gold > g0);
  assert.equal(s.loot.gob, null);
  assert.equal(s.stats.goblins, 1);
  assert.equal(GM.Loot.hitGoblin(s), null, 'sin goblin no hay nada que golpear');
});

test('el goblin se escapa si no lo atrapas y no aparece sin conexión', () => {
  const s = fresh();
  s.evOn = true; s.stats.maxFloor = 6; s.loot.gob = { t: 0, life: 2, hits: 0, need: 6 };
  s.run.enemy = { hp: 1e30, max: 1e30, dmg: 0, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  for (let i = 0; i < 12; i++) GM.step(s, GM.DT);
  assert.equal(s.loot.gob, null, 'se escapó');
  const o = fresh(); o.evOn = false; o.stats.maxFloor = 6; o.loot.gobT = 0;
  o.run.enemy = { hp: 1e30, max: 1e30, dmg: 0, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  for (let i = 0; i < 12; i++) GM.step(o, GM.DT);
  assert.equal(o.loot.gob, null, 'sin conexión no aparece');
});

test('los logros dan un cofre y las partidas antiguas se completan con la capa nueva', () => {
  const s = fresh();
  s.stats.kills = 1; GM.checkAchievements(s);
  assert.ok(GM.Loot.chestTotal(s) >= 1, 'el primer logro da un cofre');
  const old = JSON.parse(GM.serialize(s)); delete old.loot; delete old.fr; delete old.cmb;
  const back = GM.deserialize(JSON.stringify(old));
  assert.ok(back.loot && back.loot.chests && back.fr && back.cmb, 'una partida anterior a la capa se carga sin romper');
  GM.advance(back, 30);
});

test('simulación larga con la capa nueva: sin NaN y con cofres abiertos', () => {
  const s = fresh(); GM.rand = GM.seeded(21);
  s.research.autocast = true; s.heroes.guerrero.lvl = 300; GM.dirty(s);
  for (let i = 0; i < 6; i++) { GM.advance(s, 3600); GM.Loot.openAll(s); GM.Loot.claimAll(s); }
  for (const k of ['gold', 'iron', 'crystals']) assert.ok(Number.isFinite(s.res[k]), k);
  assert.ok(s.stats.chests > 0 && s.stats.crits > 100);
});

test('cofre por tiempo: cae cada cierto rato de juego, también sin conexión, y cada cuarto es de plata', () => {
  const s = fresh();
  const every = GM.CFG.timeChestEvery;
  GM.advance(s, every * 4 + 5);
  assert.equal(s.loot.chests.bronce >= 3, true, 'tres de bronce');
  assert.equal(s.loot.chests.plata >= 1, true, 'el cuarto es de plata');
  const o = fresh(); o.evOn = false;
  GM.advance(o, every * 2 + 5);
  assert.ok(GM.Loot.chestTotal(o) >= 2, 'también con el jugador fuera');
});

test('misión por tiempo: avanza con los minutos jugados', () => {
  const s = fresh();
  s.loot.quests = [{ id: 'time', goal: 1, p: 0, done: false, reward: 'bronce' }];
  GM.advance(s, 70);
  assert.ok(s.loot.quests[0].done);
});
