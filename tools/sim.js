#!/usr/bin/env node
/**
 * Simulador de economía: un "jugador" automático juega la partida completa con el motor real
 * (src/js/core.js) y mide cuánto tarda en cada ascenso y en llegar al final.
 *
 * Uso:
 *   node tools/sim.js                      # parámetros actuales de data.js
 *   node tools/sim.js '{"enemyScale":1.3}' # sobreescribe parámetros de GM.CFG
 *   node tools/sim.js '{}' --hours 14 --verbose
 *
 * El bot juega con atención "buena pero no perfecta": lanza habilidades cada 2 s, toca 1 vez por
 * segundo y compra lo más rentable cada 2 s. Una persona real tarda algo más (un 15-30%).
 */
'use strict';
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'js');
require('./engine-files.js').forEach((f) => require(path.join(src, f)));
const GM = globalThis.GM;

const BASE_CFG = JSON.parse(JSON.stringify(GM.CFG));
const BASE_FLOOR_LN = GM.FLOOR_LN ? GM.FLOOR_LN.slice() : null;
let overrides = {}, verbose = false, maxHours = 16;

/** Fuerza efectiva del equipo, para decidir qué comprar. */
function power(s, zoneIdx) {
  const D = GM.D(s);
  const z = GM.ZONES[zoneIdx];
  let ap = 0, am = 0;
  z.enemies.forEach((id) => { ap += GM.ENEMIES[id].phys; am += GM.ENEMIES[id].magic; });
  ap /= z.enemies.length; am /= z.enemies.length;
  let dps = 0, hp = 0, hps = 0;
  for (const id of s.party) {
    if (!id || s.heroes[id].lvl <= 0) continue;
    const d = D.hero[id];
    dps += d.dps * D.aura * (GM.HERO_BY_ID[id].type === 'phys' ? ap : am);
    hp += d.hpMax; hps += d.hps;
  }
  return dps * Math.sqrt(hp + 8 * hps) * Math.sqrt(D.goldMult);
}

const TALENT_W = { fuerza: 3, oro: 2.5, vida: 1.5, veteranos: 2, herencia: 0.6, regateo: 1, ritmo: 0.6, hierro: 0.8, toque: 0.1, sueno: 0.1 };
const RESEARCH_ORDER = ['autocast', 'berserker', 'tap', 'contable', 'cofres', 'horas', 'turbo2', 'turbo3'];

function chooseParty(s) {
  const zi = GM.zoneIndex(s.run.floor);
  const z = GM.ZONES[zi];
  const hired = GM.HEROES.filter((h) => s.heroes[h.id].lvl > 0).map((h) => h.id);
  const score = (id) => {
    const h = GM.HERO_BY_ID[id], lvl = s.heroes[id].lvl;
    const base = h.baseDps * lvl * Math.pow(GM.CFG.msMult, GM.milestoneCount(lvl));
    let res = 0;
    z.enemies.forEach((e) => { res += GM.ENEMIES[e][h.type]; });
    res /= z.enemies.length;
    let v = base * res;
    if (id === 'bardo') v = base * 0.3 + GM.HERO_BY_ID.bardo.aura * lvl * 5 * 1e6 / 1e6 * base * 4;
    if (id === 'clerigo') v = base * 8 * (z.mech.poison > 0 ? 3 : 1);
    if (id === 'guerrero') v = base * 6;
    if (id === 'ladrona') v = base * res * 1.8;
    return v;
  };
  hired.sort((a, b) => score(b) - score(a));
  const want = hired.slice(0, s.slots);
  const cur = s.party.filter(Boolean).slice().sort().join();
  if (cur !== want.slice().sort().join()) {
    s.party = [null, null, null, null];
    want.forEach((id, i) => { s.party[i] = id; });
    GM.dirty(s);
  }
}

/** Elige en cada especialización disponible la opción que más sube la fuerza del equipo. */
function pickPerks(s, zi) {
  const l = GM.Loot.of(s);
  for (const a of GM.Loot.perkAvailable(s)) {
    let best = 0, bestP = -1;
    if (!l.perks[a.id]) l.perks[a.id] = [null, null, null];
    for (const idx of [0, 1]) {
      l.perks[a.id][a.node] = idx; GM.dirty(s);
      const p = power(s, zi);
      if (p > bestP) { bestP = p; best = idx; }
    }
    l.perks[a.id][a.node] = null; GM.dirty(s);
    GM.Loot.choosePerk(s, a.id, a.node, best);
  }
}

function act(s) {
  const r = s.run;
  // Botín: abrir cofres, reclamar misiones, elegir especializaciones y usar el frenesí.
  GM.Loot.openAll(s);
  GM.Loot.claimAll(s);
  GM.startFrenzy(s);
  pickPerks(s, GM.zoneIndex(r.floor));
  // Contratar y ampliar equipo.
  for (const h of GM.HEROES) {
    if (GM.canHire(s, h.id) && s.res.gold >= h.hireCost) GM.buyLevels(s, h.id, 1);
  }
  while (s.slots < 4 && s.res.gold >= GM.SLOTS[s.slots - 1].gold) GM.buySlot(s);
  chooseParty(s);
  const zi = GM.zoneIndex(r.floor);

  // Investigaciones.
  for (const id of RESEARCH_ORDER) if (!s.research[id]) GM.buyResearch(s, id);

  // Compras por rentabilidad.
  for (let guard = 0; guard < 80; guard++) {
    const base = power(s, zi);
    let best = null, bestRatio = 0;
    const consider = (cost, apply, revert, commit) => {
      if (cost > s.res.gold) return;
      apply(); GM.dirty(s);
      const gain = power(s, zi) / base - 1;
      revert(); GM.dirty(s);
      const ratio = gain / cost;
      if (gain > 0 && ratio > bestRatio) { bestRatio = ratio; best = commit; }
    };
    for (const id of s.party) {
      if (!id) continue;
      const lvl = s.heroes[id].lvl;
      const ms = GM.nextMilestone(lvl);
      const opts = new Set([1, 5]);
      if (ms && ms - lvl <= 30) opts.add(ms - lvl);
      for (const k of opts) {
        const cost = GM.levelCost(s, id, k);
        consider(cost, () => { s.heroes[id].lvl += k; }, () => { s.heroes[id].lvl -= k; }, () => GM.buyLevels(s, id, k));
      }
    }
    for (let line = 0; line < 3; line++) {
      const c = GM.gearCost(s, line);
      if (!c || c.iron > s.res.iron) continue;
      consider(c.gold, () => { s.gear[line]++; }, () => { s.gear[line]--; }, () => GM.buyGear(s, line));
    }
    for (const b of GM.BUILDINGS) {
      if (!GM.bldUnlocked(s, b.id)) continue;
      const c = GM.bldCost(s, b.id);
      if (c === null) continue;
      if (b.id === 'mercado') {
        consider(c, () => { s.bld.mercado++; }, () => { s.bld.mercado--; }, () => GM.buyBld(s, 'mercado'));
      } else if (b.id === 'mina') {
        const gc = GM.gearCost(s, 0);
        const needIron = gc && s.res.iron < gc.iron;
        if (needIron && c < s.res.gold * 0.3) { GM.buyBld(s, 'mina'); }
      } else if (b.id === 'santuario') {
        if (s.bld.santuario < 6 && c < s.res.gold * 0.1) GM.buyBld(s, 'santuario');
      }
    }
    if (!best) break;
    best();
  }
}

function spendStars(s) {
  for (let guard = 0; guard < 500; guard++) {
    let best = null, bv = 0;
    for (const t of GM.TALENTS) {
      const c = GM.talentCost(s, t.id);
      if (c === null || c > s.res.stars) continue;
      const v = (TALENT_W[t.id] || 0) / (c * (1 + (s.talents[t.id] || 0) * 0.35));
      if (v > bv) { bv = v; best = t.id; }
    }
    if (!best) break;
    GM.buyTalent(s, best);
  }
}

/**
 * Simula una partida completa.
 * @param {object} ov Parámetros de GM.CFG a sobreescribir.
 * @param {{hours?:number, verbose?:boolean}} [opt]
 */
function simulate(ov, opt) {
  overrides = ov || {}; opt = opt || {};
  verbose = !!opt.verbose; maxHours = opt.hours || 16;
  Object.keys(GM.CFG).forEach((k) => { GM.CFG[k] = JSON.parse(JSON.stringify(BASE_CFG[k])); });
  Object.assign(GM.CFG, overrides);
  GM.FLOOR_LN = overrides.floorLn || (BASE_FLOOR_LN ? BASE_FLOOR_LN.slice() : null);
  delete GM.CFG.floorLn;
  GM.rand = GM.seeded(12345);
  const s = GM.newState();
  s.evOn = false;
  s.flags.autoCast = true;
  const rankStart = [0];
  const durations = [];
  const log = [];
  const reached = {};
  const hired = {};
  let t = 0, steps = 0;
  const dt = GM.DT;
  const limit = maxHours * 3600;
  const fmtT = GM.fmtTime;

  let stop = false;
  while (t < limit && !s.flags.ending && !stop) {
    GM.step(s, dt);
    t += dt; s.t.played += dt; steps++;
    if (steps % 8 === 0) {
      act(s);
      for (const h of GM.HEROES) {
        if (!hired[h.id] && s.heroes[h.id].lvl > 0) { hired[h.id] = t; }
      }
      // Lanza habilidades y toca.
      for (const id of s.party) if (id) GM.cast(s, id);
    }
    if (steps % 4 === 0) GM.tap(s);
    const f = s.run.floor;
    if (!reached[f]) {
      reached[f] = t;
      if (verbose && f % 5 === 0) log.push(`  piso ${f} a las ${fmtT(t)} (rango ${s.run.rank}, wipes ${s.run.wipes})`);
    }
    if (opt.runCap && t - rankStart[rankStart.length - 1] > opt.runCap) break;
    if (s.run.canAscend && s.run.rank < 4) {
      const stars = GM.starGain(s);
      const rk = s.run.rank;
      const dur = t - rankStart[rk];
      durations.push(dur);
      if (opt.stopAt === rk) stop = true;
      log.push(`ASCENSO ${rk} -> ${rk + 1} a las ${fmtT(t)} (recorrido de ${fmtT(dur)}, +${stars} estrellas, wipes ${s.run.wipes}, oro total ${GM.fmt(s.run.goldEarned)}) | cofres ${s.stats.chests}, reliquias ${s.stats.relics}/24 (niveles ${Object.keys(s.loot.relics).reduce((a, k) => a + s.loot.relics[k], 0)}/286), espec. ${s.stats.perks}, logros ${Object.keys(s.ach).length}`);
      GM.ascend(s);
      spendStars(s);
      rankStart.push(t);
      GM.dirty(s);
    }
  }
  if (s.flags.ending) durations.push(t - rankStart[rankStart.length - 1]);
  const out = [];
  out.push(`Parámetros: ${JSON.stringify(overrides)}`);
  out.push(...log);
  const heroes = Object.keys(hired).map((k) => `${k}:${fmtT(hired[k])}`).join('  ');
  out.push(`Contrataciones: ${heroes}`);
  const levels = GM.HEROES.map((h) => `${h.id}:${s.heroes[h.id].lvl}`).join(' ');
  out.push(`Niveles finales: ${levels} | equipo: ${s.party.filter(Boolean).join(',')}`);
  out.push(`Equipo forja: ${s.gear.join('/')}  talentos: ${JSON.stringify(s.talents)}`);
  out.push(`Cristales: ${s.res.crystals}, investigaciones: ${Object.keys(s.research).join(',')}`);
  out.push(`Botín: ${s.stats.chests} cofres, ${s.stats.relics}/24 reliquias (${s.stats.legendary} legendarias), ${s.stats.quests} misiones, ${s.stats.perks} especializaciones, ${s.stats.crits} críticos, ${s.stats.frenzies} frenesíes, ${Object.keys(s.ach).length} logros`);
  out.push(s.flags.ending
    ? `FINAL alcanzado a las ${fmtT(t)} (${(t / 3600).toFixed(2)} h) — piso ${s.run.floor}, rango ${s.run.rank}`
    : `NO se llegó al final en ${maxHours} h — piso ${s.run.floor}, rango ${s.run.rank}, canAscend=${s.run.canAscend}`);
  return { text: out.join('\n'), ended: s.flags.ending, hours: t / 3600, durations: durations, floor: s.run.floor, rank: s.run.rank,
    reached: reached, rankStart: rankStart, endT: t };
}

module.exports = { simulate };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ov = args[0] && args[0][0] === '{' ? JSON.parse(args[0]) : {};
  const hi = args.indexOf('--hours');
  console.log(simulate(ov, { verbose: args.includes('--verbose'), hours: hi >= 0 ? Number(args[hi + 1]) : 16 }).text);
}
