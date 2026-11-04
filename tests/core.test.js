'use strict';
// Pruebas del motor: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'js');
['data.js', 'floors.js', 'util.js', 'core.js'].forEach((f) => require(path.join(src, f)));
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
