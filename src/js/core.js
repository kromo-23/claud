/**
 * Motor del juego: estado, combate automático, compras, ascensos, progreso sin conexión
 * y guardado. No toca el DOM, así que se prueba y se simula en Node.
 *
 * Dependencias: data.js y util.js (espacio global GM).
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const CFG = GM.CFG;

  /** Función aleatoria (se puede sustituir por una con semilla en tests). */
  GM.rand = Math.random;

  const HERO_BY_ID = {};
  GM.HEROES.forEach((h) => { HERO_BY_ID[h.id] = h; });
  const TALENT_BY_ID = {};
  GM.TALENTS.forEach((t) => { TALENT_BY_ID[t.id] = t; });
  const BLD_BY_ID = {};
  GM.BUILDINGS.forEach((b) => { BLD_BY_ID[b.id] = b; });
  GM.HERO_BY_ID = HERO_BY_ID;
  GM.TALENT_BY_ID = TALENT_BY_ID;
  GM.BLD_BY_ID = BLD_BY_ID;

  const DT = 0.25;            // paso fijo de simulación (s)
  const MAX_LEVEL = 1500;
  GM.DT = DT;

  /* ------------------------------------------------------------------ estado */

  function newRun(rank) {
    return {
      rank: rank, floor: 1, kills: 0, mode: 'push', farmLeft: 0, enemy: null,
      spawnT: CFG.spawnDelay, time: 0, goldEarned: 0, maxFloor: 1, wipes: 0, canAscend: false,
      wipePower: 0, waits: 0,
    };
  }

  /**
   * Crea una partida nueva.
   * @returns {object} Estado completo del juego.
   */
  GM.newState = function () {
    const heroes = {};
    GM.HEROES.forEach((h) => { heroes[h.id] = { lvl: 0, hpf: 1, down: false, cd: 0, buffT: 0, buffV: 1, atkT: 0, acc: 0 }; });
    heroes.guerrero.lvl = 1;
    const now = Date.now();
    const s = {
      v: 1,
      res: { gold: CFG.startGold, iron: 0, crystals: 0, stars: 0, starsTotal: 0 },
      heroes: heroes,
      party: ['guerrero', null, null, null],
      slots: 1,
      gear: [0, 0, 0],
      bld: { mercado: 0, mina: 0, santuario: 0 },
      talents: {},
      research: {},
      ach: {},
      run: newRun(0),
      fx: { shieldT: 0, shieldV: 0, partyT: 0, partyV: 1 },
      stats: { kills: 0, bossKills: 0, taps: 0, casts: 0, golden: 0, ascents: 0, maxFloor: 1, gearTiers: 0, goldTotal: 0, heroesHired: 1, wipes: 0 },
      kills: {},               // derrotas por tipo de enemigo (bestiario)
      flags: { autoCast: true, auto: true, speed: 1, ending: false, endless: false, story: {}, zoneBoss: {}, muted: false, vol: 0.5, buyN: 1 },
      t: { played: 0, saved: now, created: now },
      ev: [],
      evOn: false,
      _d: null,
      _achT: 0,
      _buyT: 0,
    };
    return s;
  };

  /** Invalida los valores derivados; llamar tras cualquier cambio que afecte a las estadísticas. */
  GM.dirty = function (s) { s._d = null; };

  function ev(s, o) { if (s.evOn) s.ev.push(o); }

  /* --------------------------------------------------------------- derivados */

  /** Número de hitos de poder que ha superado un héroe de nivel `lvl`. */
  GM.milestoneCount = function (lvl) {
    let n = 0;
    for (const m of CFG.milestones) { if (lvl >= m) n++; else break; }
    return n;
  };
  /** Siguiente nivel de hito (o null). */
  GM.nextMilestone = function (lvl) {
    for (const m of CFG.milestones) { if (lvl < m) return m; }
    return null;
  };

  function achCount(s) { return Object.keys(s.ach).length; }
  function bestiaryCount(s) {
    let n = 0;
    for (const k of Object.keys(s.kills)) if (s.kills[k] >= 100) n++;
    return n;
  }
  function tl(s, id) { return s.talents[id] || 0; }

  /**
   * Devuelve (y cachea) las estadísticas derivadas del estado actual.
   * @param {object} s Estado.
   */
  GM.D = function (s) {
    if (s._d) return s._d;
    const T = (id) => tl(s, id);
    const achN = achCount(s);
    const weapon = Math.pow(CFG.gearMult[0], s.gear[0]);
    const armor = Math.pow(CFG.gearMult[1], s.gear[1]);
    const amulet = Math.pow(CFG.gearMult[2], s.gear[2]);
    const best = s.research.bestiario ? 1 + 0.01 * bestiaryCount(s) : 1;
    const tp = (id) => TALENT_BY_ID[id].per;
    const dmgMult = (1 + tp('fuerza') * T('fuerza')) * (1 + CFG.ach * achN) * weapon * best;
    let goldMult = (1 + tp('oro') * T('oro')) * (1 + BLD_BY_ID.mercado.per * s.bld.mercado) * amulet * (1 + CFG.ach * achN);
    const hpMult = (1 + tp('vida') * T('vida')) * armor;
    // Aura del bardo y bonus de oro de la ladrona (solo si están en el equipo).
    let aura = 1;
    const inParty = (id) => s.party.indexOf(id) >= 0 && s.heroes[id].lvl > 0;
    if (inParty('bardo')) aura += HERO_BY_ID.bardo.aura * s.heroes.bardo.lvl;
    if (inParty('ladrona')) goldMult *= 1 + HERO_BY_ID.ladrona.goldPerLevel * s.heroes.ladrona.lvl;
    const hero = {};
    for (const h of GM.HEROES) {
      const lvl = s.heroes[h.id].lvl;
      if (lvl <= 0) continue;
      const m = Math.pow(CFG.msMult, GM.milestoneCount(lvl));
      hero[h.id] = {
        lvl: lvl,
        dps: h.baseDps * lvl * m * dmgMult,
        hpMax: h.baseHp * lvl * m * hpMult,
        hps: h.heal * lvl * m * hpMult,
      };
    }
    const mina = s.bld.mina;
    s._d = {
      dmgMult: dmgMult, goldMult: goldMult, hpMult: hpMult, aura: aura,
      ironMult: 1 + tp('hierro') * T('hierro'),
      cdMult: Math.max(CFG.cdMin, 1 - tp('ritmo') * T('ritmo')),
      tapMult: (1 + tp('toque') * T('toque')) * (s.research.tap ? 3 : 1),
      costMult: Math.max(CFG.costMin, 1 - tp('regateo') * T('regateo')),
      offEff: Math.min(CFG.offEffMax, CFG.offlineBaseEff + tp('sueno') * T('sueno')),
      offCapS: (CFG.offlineBaseCapH + (s.research.horas ? 4 : 0)) * 3600,
      goldenChance: CFG.goldenChance * (s.research.cofres ? 2 : 1),
      miningRate: mina > 0 ? BLD_BY_ID.mina.rate * mina * Math.pow(BLD_BY_ID.mina.growth, mina) : 0,
      killHeal: CFG.killHeal + BLD_BY_ID.santuario.heal * s.bld.santuario,
      reviveHp: CFG.reviveHp + BLD_BY_ID.santuario.revive * s.bld.santuario,
      hero: hero,
    };
    return s._d;
  };

  /* ------------------------------------------------------------------ pisos */

  /** Índice de zona (0-4) de un piso. */
  GM.zoneIndex = function (f) { return Math.min(4, Math.floor((f - 1) / CFG.floorsPerRank)); };
  /** Escala de dificultad de un piso. */
  GM.floorScale = function (f) {
    const t = GM.FLOOR_LN;   // tabla calibrada (ln de la escala por piso), ver tools/calibrate.js
    if (t && t.length) {
      if (f <= t.length) return Math.exp(t[f - 1]);
      return Math.exp(t[t.length - 1] + (f - t.length) * Math.log(CFG.enemyScale));
    }
    return Math.pow(CFG.enemyScale, f - 1);
  };
  /** Escala del oro de un piso (crece más despacio que la vida: goldExp < 1 crea muros). */
  GM.goldScale = function (f) { return Math.pow(GM.floorScale(f), CFG.goldExp); };
  /** Piso máximo accesible con el rango actual. */
  GM.floorCap = function (s) {
    if (s.flags.endless || s.run.rank >= 5) return Infinity;
    return (s.run.rank + 1) * CFG.floorsPerRank;
  };

  /**
   * Cambia de piso a mano (solo hasta el piso más alto alcanzado en este recorrido).
   * Desactiva el avance automático para que el equipo se quede farmeando ahí.
   * @returns {boolean} true si se cambió.
   */
  GM.setFloor = function (s, f) {
    const r = s.run;
    f = Math.floor(f);
    if (!(f >= 1) || f > r.maxFloor || f === r.floor) return false;
    r.floor = f; r.kills = 0; r.enemy = null; r.spawnT = CFG.spawnDelay;
    r.mode = 'push'; r.farmLeft = 0; r.wipePower = 0; r.waits = 0;
    s.flags.auto = false;
    return true;
  };

  /* ---------------------------------------------------------------- enemigos */

  function makeEnemy(s) {
    const r = s.run, f = r.floor, k = r.kills;
    const zi = GM.zoneIndex(f);
    const zone = GM.ZONES[zi];
    const bossFloor = (f % 5 === 0);
    const isBoss = bossFloor && k === CFG.killsPerFloor - 1;
    const scale = GM.floorScale(f);
    let boss = 0, name, sprite, typeId, T, bossCfg = { hp: 1, dmg: 1, gold: 1 };
    let phys, magic;
    if (isBoss) {
      if (f % CFG.floorsPerRank === 0) {
        const B = GM.BOSSES[Math.min(4, f / CFG.floorsPerRank - 1)];
        boss = f >= CFG.finalFloor && f % CFG.finalFloor === 0 ? 3 : 2;
        bossCfg = boss === 3 ? CFG.bossFinal : CFG.bossZone;
        name = B.name; sprite = B.sprite; phys = B.phys; magic = B.magic;
        T = { hp: 1, dmg: 1, gold: 1 };
        typeId = 'boss' + zi;
      } else {
        boss = 1; bossCfg = CFG.bossMini;
        typeId = zone.enemies[(f / 5) % zone.enemies.length | 0];
        T = GM.ENEMIES[typeId];
        name = T.name + ' Alfa'; sprite = T.sprite; phys = T.phys; magic = T.magic;
      }
    } else {
      typeId = zone.enemies[(f * 7 + k * 3) % zone.enemies.length];
      T = GM.ENEMIES[typeId];
      name = T.name; sprite = T.sprite; phys = T.phys; magic = T.magic;
    }
    const D = GM.D(s);
    const golden = !isBoss && GM.rand() < D.goldenChance;
    const hp = CFG.enemyHp0 * scale * T.hp * bossCfg.hp * (golden ? CFG.goldenHp : 1);
    return {
      type: typeId, name: golden ? 'Dorado: ' + name : name, sprite: sprite, boss: boss, golden: golden,
      hp: hp, max: hp,
      dmg: CFG.enemyDmg0 * Math.pow(scale, CFG.dmgExp) * T.dmg * bossCfg.dmg,
      gold: CFG.gold0 * GM.goldScale(f) * T.gold * bossCfg.gold * (golden ? CFG.goldenGold : 1),
      iron: (CFG.ironBase + CFG.ironPerFloor * f) * (isBoss ? CFG.ironBoss : 1) * (golden ? CFG.goldenIron : 1),
      phys: phys, magic: magic, t: 0,
    };
  }

  /* ----------------------------------------------------------------- equipo */

  /** Héroes del equipo que están vivos. */
  GM.aliveParty = function (s) {
    const out = [];
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      if (hs.lvl > 0 && !hs.down) out.push(id);
    }
    return out;
  };

  function heroMult(s, id) {
    const hs = s.heroes[id];
    return (hs.buffT > 0 ? hs.buffV : 1) * (s.fx.partyT > 0 ? s.fx.partyV : 1) * GM.D(s).aura;
  }

  /**
   * Héroe que recibe los golpes directos del enemigo: el que sigue en pie y tiene más aggro
   * (si hay empate, el primero del equipo). Es el "tanque". null si todo el equipo ha caído.
   * @param {object} s Estado.
   * @returns {string|null}
   */
  GM.tankId = function (s) {
    let best = null, top = -1;
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      if (hs.lvl <= 0 || hs.down) continue;
      const a = HERO_BY_ID[id].aggro;
      if (a > top) { top = a; best = id; }
    }
    return best;
  };

  /**
   * Daño por segundo del equipo contra un enemigo con las resistencias dadas.
   * @param {object} s Estado.
   * @param {number} [phys=1] Multiplicador de daño físico recibido.
   * @param {number} [magic=1] Multiplicador de daño mágico recibido.
   */
  GM.partyDps = function (s, phys, magic) {
    phys = phys === undefined ? 1 : phys;
    magic = magic === undefined ? 1 : magic;
    const D = GM.D(s);
    let dps = 0;
    for (const id of GM.aliveParty(s)) {
      const d = D.hero[id].dps * heroMult(s, id);
      dps += d * (HERO_BY_ID[id].type === 'phys' ? phys : magic);
    }
    return dps;
  };

  /* ---------------------------------------------------------------- recompensa */

  /** Puntuación de poder del equipo (daño × aguante), para decidir cuándo reintentar tras caer. */
  GM.powerScore = function (s) {
    const D = GM.D(s);
    let dps = 0, hp = 0;
    for (const id of s.party) {
      if (!id || s.heroes[id].lvl <= 0) continue;
      const d = D.hero[id];
      dps += d.dps * D.aura; hp += d.hpMax + 6 * d.hps;
    }
    return dps * hp;
  };

  function addGold(s, g) {
    s.res.gold += g;
    s.run.goldEarned += g;
    s.stats.goldTotal += g;
  }

  function onKill(s) {
    const r = s.run, e = r.enemy, D = GM.D(s);
    r.enemy = null;
    r.spawnT = CFG.spawnDelay;
    const gm = D.goldMult * (s.fx.partyT > 0 ? s.fx.partyV : 1);
    const gold = e.gold * gm;
    addGold(s, gold);
    const iron = e.iron * D.ironMult;
    s.res.iron += iron;
    s.stats.kills++;
    s.kills[e.type] = (s.kills[e.type] || 0) + 1;
    if (e.boss) s.stats.bossKills++;
    let crystals = 0;
    if (e.golden) { s.stats.golden++; if (GM.rand() < CFG.crystalGolden) crystals += 1; }
    if (e.boss === 1 && GM.rand() < CFG.crystalMini) crystals += 1;
    if (e.boss >= 2) {
      const zi = GM.zoneIndex(r.floor);
      if (!s.flags.zoneBoss[zi]) { s.flags.zoneBoss[zi] = true; crystals += CFG.crystalZoneBoss; }
    }
    if (crystals) s.res.crystals += crystals;
    ev(s, { t: 'kill', gold: gold, iron: iron, crystals: crystals, boss: e.boss, golden: e.golden });
    // Curación y revivir.
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      if (hs.lvl <= 0) continue;
      if (hs.down) { hs.down = false; hs.hpf = D.reviveHp; } else hs.hpf = Math.min(1, hs.hpf + D.killHeal);
    }
    // Avance de piso.
    r.kills++;
    if (r.mode === 'farm') {
      r.farmLeft--;
      if (r.farmLeft <= 0 && s.flags.auto) {
        // Tras una derrota, no reintenta hasta ser algo más fuerte (o tras unos cuantos intentos de espera).
        if (r.wipePower && GM.powerScore(s) < r.wipePower * CFG.retryGain && r.waits < CFG.retryMaxWaits) {
          r.farmLeft = CFG.retryWaitKills; r.waits++;
        } else {
          r.mode = 'push'; r.wipePower = 0; r.waits = 0;
        }
      }
    }
    if (r.kills >= CFG.killsPerFloor) floorCleared(s, e);
  }

  function floorCleared(s, e) {
    const r = s.run;
    r.kills = 0;
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      if (hs.lvl > 0 && !hs.down) hs.hpf = 1;
    }
    if (e.boss >= 2) bossDefeated(s, e);
    ev(s, { t: 'floor', floor: r.floor });
    const cap = GM.floorCap(s);
    if (r.mode === 'push' && s.flags.auto && r.floor < cap) {
      r.floor++;
      if (r.floor > r.maxFloor) r.maxFloor = r.floor;
      if (r.floor > s.stats.maxFloor) s.stats.maxFloor = r.floor;
    }
  }

  function bossDefeated(s, e) {
    const r = s.run;
    const zi = GM.zoneIndex(r.floor);
    ev(s, { t: 'bossDown', zone: zi, floor: r.floor });
    if (r.floor === CFG.finalFloor && !s.flags.ending) {
      s.flags.ending = true;
      s.flags.endless = true;
      r.canAscend = true;
      ev(s, { t: 'ending' });
    } else if (r.floor === GM.floorCap(s) && r.rank < 5 && !s.flags.endless) {
      r.canAscend = true;
    }
    if (r.floor >= CFG.finalFloor && s.flags.endless) r.canAscend = true;
  }

  function wipe(s) {
    const r = s.run;
    r.wipes++;
    s.stats.wipes++;
    r.enemy = null;
    r.spawnT = CFG.wipeDelay;
    r.kills = 0;
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      hs.down = false; hs.hpf = 1;
    }
    s.fx.shieldT = 0;
    if (s.flags.auto && r.floor > 1) {
      r.floor--;
      r.mode = 'farm';
      r.farmLeft = CFG.wipeFarmKills;
      r.wipePower = GM.powerScore(s);
      r.waits = 0;
    }
    ev(s, { t: 'wipe' });
  }

  /* ------------------------------------------------------------- habilidades */

  /**
   * Intenta lanzar la habilidad de un héroe.
   * @param {object} s Estado.
   * @param {string} id Id del héroe.
   * @returns {boolean} true si se lanzó.
   */
  GM.cast = function (s, id) {
    const h = HERO_BY_ID[id], hs = s.heroes[id];
    if (!h || hs.lvl <= 0 || hs.down || hs.cd > 0 || s.party.indexOf(id) < 0) return false;
    const a = h.ability, D = GM.D(s), r = s.run, e = r.enemy;
    const needEnemy = a.kind === 'burst' || a.kind === 'goldBurst';
    if (needEnemy && !e) return false;
    switch (a.kind) {
      case 'shield':
        s.fx.shieldT = a.dur; s.fx.shieldV = a.value; break;
      case 'burst': {
        const dmg = D.hero[id].dps * heroMult(s, id) * a.value * (h.type === 'phys' ? e.phys : e.magic);
        e.hp -= dmg; ev(s, { t: 'hit', id: id, v: dmg, big: true }); break;
      }
      case 'selfBuff':
        hs.buffT = a.dur; hs.buffV = a.value; break;
      case 'heal':
        for (const pid of s.party) {
          if (!pid) continue;
          const p = s.heroes[pid];
          if (p.lvl <= 0) continue;
          if (p.down) { p.down = false; p.hpf = a.revive; } else p.hpf = Math.min(1, p.hpf + a.value);
        }
        break;
      case 'goldBurst': {
        const dmg = D.hero[id].dps * heroMult(s, id) * a.dpsSecs * (h.type === 'phys' ? e.phys : e.magic);
        e.hp -= dmg;
        const g = CFG.gold0 * GM.goldScale(r.floor) * a.value * D.goldMult * (s.fx.partyT > 0 ? s.fx.partyV : 1);
        addGold(s, g); ev(s, { t: 'hit', id: id, v: dmg, big: true }); ev(s, { t: 'gold', v: g });
        break;
      }
      case 'partyBuff':
        s.fx.partyT = a.dur; s.fx.partyV = 1 + a.value; break;
    }
    hs.cd = a.cd * D.cdMult;
    s.stats.casts++;
    ev(s, { t: 'cast', id: id });
    return true;
  };

  function autoCastOk(s, id) {
    const kind = HERO_BY_ID[id].ability.kind;
    if (kind === 'heal') {
      for (const pid of s.party) {
        if (!pid) continue;
        const p = s.heroes[pid];
        if (p.lvl > 0 && (p.down || p.hpf < CFG.autoHealBelow)) return true;
      }
      return false;
    }
    return !!s.run.enemy;
  }

  /* ------------------------------------------------------------------- paso */

  /**
   * Avanza el combate `dt` segundos.
   * @param {object} s Estado.
   * @param {number} dt Segundos (normalmente GM.DT).
   */
  GM.step = function (s, dt) {
    const r = s.run, D = GM.D(s);
    r.time += dt;
    // Temporizadores.
    const fx = s.fx;
    if (fx.shieldT > 0) fx.shieldT -= dt;
    if (fx.partyT > 0) fx.partyT -= dt;
    const autoOn = s.research.autocast && s.flags.autoCast;
    for (const id of s.party) {
      if (!id) continue;
      const hs = s.heroes[id];
      if (hs.lvl <= 0) continue;
      if (hs.buffT > 0) hs.buffT -= dt;
      if (hs.cd > 0) hs.cd -= dt;
      else if (autoOn && !hs.down && autoCastOk(s, id)) GM.cast(s, id);
    }
    if (D.miningRate > 0) s.res.iron += D.miningRate * D.ironMult * dt;

    if (!r.enemy) {
      r.spawnT -= dt;
      if (r.spawnT > 0) return;
      r.enemy = makeEnemy(s);
      ev(s, { t: 'spawn', enemy: r.enemy });
    }
    const e = r.enemy;
    e.t += dt;
    const alive = GM.aliveParty(s);
    if (!alive.length) { wipe(s); return; }

    // Daño del equipo al enemigo.
    let dealt = 0;
    for (const id of alive) {
      const d = D.hero[id].dps * heroMult(s, id) * (HERO_BY_ID[id].type === 'phys' ? e.phys : e.magic) * dt;
      dealt += d;
      const hs = s.heroes[id];
      hs.acc += d; hs.atkT += dt;
      if (s.evOn && hs.atkT >= (HERO_BY_ID[id].atk || 1)) {
        ev(s, { t: 'hit', id: id, v: hs.acc });
        hs.atkT = 0; hs.acc = 0;
      }
    }
    e.hp -= dealt;

    // Daño del enemigo al equipo.
    const zone = GM.ZONES[GM.zoneIndex(r.floor)];
    const edps = e.dmg * (1 + zone.mech.enrage * e.t);
    const poison = edps * zone.mech.poison;
    const direct = (edps - poison) * (fx.shieldT > 0 ? 1 - fx.shieldV : 1);
    // Los golpes directos los recibe solo el tanque (el vivo con más aggro); el veneno afecta a todos por igual.
    const tank = GM.tankId(s);
    for (const id of alive) {
      const hs = s.heroes[id], hd = D.hero[id];
      const dmg = (id === tank ? direct : 0) + poison / alive.length;
      hs.hpf -= (dmg * dt) / hd.hpMax;
    }
    // Curación (el clérigo cura al más herido).
    let healing = 0;
    for (const id of alive) healing += D.hero[id].hps * dt;
    if (healing > 0) {
      let target = null, low = 2;
      for (const id of alive) { const hs = s.heroes[id]; if (hs.hpf > 0 && hs.hpf < low) { low = hs.hpf; target = id; } }
      if (target && low < 1) { const hs = s.heroes[target]; hs.hpf = Math.min(1, hs.hpf + healing / D.hero[target].hpMax); }
    }
    for (const id of alive) {
      const hs = s.heroes[id];
      if (hs.hpf <= 0) { hs.hpf = 0; hs.down = true; ev(s, { t: 'down', id: id }); }
    }
    if (e.hp <= 0) onKill(s);
    else if (GM.aliveParty(s).length === 0) wipe(s);

    // Logros y automatización periódica.
    s._achT += dt;
    if (s._achT >= 2) { s._achT = 0; GM.checkAchievements(s); }
  };

  /**
   * Avanza `seconds` segundos de juego en pasos fijos.
   * @param {object} s Estado.
   * @param {number} seconds Duración.
   * @param {boolean} [auto] Si es true, el Contable Goblin compra niveles (progreso sin conexión).
   * @returns {number} Segundos realmente simulados (múltiplo de GM.DT).
   */
  GM.advance = function (s, seconds, auto) {
    const n = Math.floor(seconds / DT + 1e-9);
    for (let i = 0; i < n; i++) {
      GM.step(s, DT);
      if (auto && s.research.contable) {
        s._buyT += DT;
        if (s._buyT >= CFG.accountantEvery) { s._buyT = 0; GM.accountant(s); }
      }
    }
    return n * DT;
  };

  /** Toque sobre el enemigo: hace daño extra. @returns {number} daño hecho. */
  GM.tap = function (s) {
    const e = s.run.enemy;
    if (!e || e.hp <= 0) return 0;
    const D = GM.D(s);
    const dmg = Math.max(1, GM.partyDps(s, e.phys, e.magic) * CFG.tapFrac * D.tapMult);
    e.hp -= dmg;
    s.stats.taps++;
    ev(s, { t: 'tap', v: dmg });
    return dmg;
  };

  /* ----------------------------------------------------------------- compras */

  /**
   * Coste de subir `n` niveles a un héroe ya contratado (o de contratarlo si n es 1 y nivel 0).
   * @returns {number} oro necesario.
   */
  GM.levelCost = function (s, id, n) {
    const h = HERO_BY_ID[id], lvl = s.heroes[id].lvl, g = CFG.levelGrowth;
    if (lvl === 0) return h.hireCost;
    return h.costBase * Math.pow(g, lvl - 1) * (Math.pow(g, n) - 1) / (g - 1) * GM.D(s).costMult;
  };
  /** Cuántos niveles se pueden comprar con el oro actual. */
  GM.maxLevels = function (s, id) {
    const h = HERO_BY_ID[id], lvl = s.heroes[id].lvl, g = CFG.levelGrowth;
    if (lvl === 0) return s.res.gold >= h.hireCost ? 1 : 0;
    const first = h.costBase * Math.pow(g, lvl - 1) * GM.D(s).costMult;
    if (s.res.gold < first) return 0;
    let n = Math.floor(Math.log(1 + (s.res.gold * (g - 1)) / first) / Math.log(g) + 1e-9);
    n = Math.min(n, MAX_LEVEL - lvl);
    while (n > 0 && GM.levelCost(s, id, n) > s.res.gold) n--;
    return Math.max(0, n);
  };
  /**
   * Compra niveles de un héroe (o lo contrata). @param {number|'max'} n
   * @returns {number} niveles comprados.
   */
  GM.buyLevels = function (s, id, n) {
    const hs = s.heroes[id];
    if (hs.lvl === 0) {
      const h = HERO_BY_ID[id];
      if (s.stats.maxFloor < h.hireFloor) return 0;
      if (s.res.gold < h.hireCost) return 0;
      s.res.gold -= h.hireCost;
      hs.lvl = 1 + TALENT_BY_ID.veteranos.per * tl(s, 'veteranos');
      hs.hpf = 1; hs.down = false;
      s.stats.heroesHired = GM.HEROES.filter((x) => s.heroes[x.id].lvl > 0).length;
      // Si hay hueco libre en el equipo, entra directamente.
      const free = s.party.indexOf(null);
      if (free >= 0 && free < s.slots && s.party.indexOf(id) < 0) s.party[free] = id;
      GM.dirty(s);
      return 1;
    }
    const max = GM.maxLevels(s, id);
    const k = n === 'max' ? max : Math.min(n, max);
    if (k <= 0) return 0;
    s.res.gold -= GM.levelCost(s, id, k);
    hs.lvl += k;
    GM.dirty(s);
    return k;
  };

  /** ¿Puede contratarse ya este héroe (piso alcanzado)? */
  GM.canHire = function (s, id) { return s.heroes[id].lvl === 0 && s.stats.maxFloor >= HERO_BY_ID[id].hireFloor; };

  /** Coste de la siguiente mejora de una línea de la Herrería. @returns {{gold:number, iron:number}|null} */
  GM.gearCost = function (s, line) {
    const t = s.gear[line];
    if (t >= CFG.maxGearTier) return null;
    return { gold: CFG.gearGold0[line] * Math.pow(CFG.gearGoldG, t), iron: CFG.gearIron0[line] * Math.pow(CFG.gearIronG, t) };
  };
  /** Compra la siguiente mejora de equipo. @returns {boolean} */
  GM.buyGear = function (s, line) {
    const c = GM.gearCost(s, line);
    if (!c || s.res.gold < c.gold || s.res.iron < c.iron) return false;
    s.res.gold -= c.gold; s.res.iron -= c.iron;
    s.gear[line]++;
    s.stats.gearTiers++;
    GM.dirty(s);
    return true;
  };

  /** Coste de subir un edificio. @returns {number|null} */
  GM.bldCost = function (s, id) {
    const b = BLD_BY_ID[id], l = s.bld[id];
    if (l >= b.max) return null;
    return b.gold0 * Math.pow(b.goldG, l);
  };
  /** ¿Está desbloqueado el edificio? */
  GM.bldUnlocked = function (s, id) { return s.stats.maxFloor >= BLD_BY_ID[id].unlock; };
  /** Sube un edificio un nivel. @returns {boolean} */
  GM.buyBld = function (s, id) {
    const c = GM.bldCost(s, id);
    if (c === null || !GM.bldUnlocked(s, id) || s.res.gold < c) return false;
    s.res.gold -= c;
    s.bld[id]++;
    GM.dirty(s);
    return true;
  };

  /** Compra el siguiente hueco del equipo. @returns {boolean} */
  GM.buySlot = function (s) {
    if (s.slots >= 4) return false;
    const c = GM.SLOTS[s.slots - 1];
    if (s.res.gold < c.gold) return false;
    s.res.gold -= c.gold;
    s.slots++;
    // Mete al primer héroe contratado que no esté en el equipo.
    for (const h of GM.HEROES) {
      if (s.heroes[h.id].lvl > 0 && s.party.indexOf(h.id) < 0) { s.party[s.slots - 1] = h.id; break; }
    }
    GM.dirty(s);
    return true;
  };

  /**
   * Coloca un héroe en un hueco del equipo (o lo quita con id=null).
   * Si el héroe ya está en otro hueco, se intercambian.
   */
  GM.setParty = function (s, slot, id) {
    if (slot < 0 || slot >= s.slots) return false;
    if (id) {
      if (!s.heroes[id] || s.heroes[id].lvl <= 0) return false;
      const other = s.party.indexOf(id);
      if (other >= 0) s.party[other] = s.party[slot];
    } else if (!s.party.some((x, i) => i !== slot && x)) {
      return false;     // el equipo no puede quedarse vacío
    }
    s.party[slot] = id;
    GM.dirty(s);
    return true;
  };

  /** Compra una investigación de la Biblioteca. @returns {boolean} */
  GM.buyResearch = function (s, id) {
    const rs = GM.RESEARCH.find((x) => x.id === id);
    if (!rs || s.research[id] || s.res.crystals < rs.cost || s.stats.maxFloor < rs.unlock) return false;
    s.res.crystals -= rs.cost;
    s.research[id] = true;
    GM.dirty(s);
    return true;
  };

  /** Coste en estrellas del siguiente nivel de un talento (null si está al máximo). */
  GM.talentCost = function (s, id) {
    const t = TALENT_BY_ID[id], l = tl(s, id);
    if (l >= t.max) return null;
    return 1 + Math.floor(l / 2);
  };
  /** Compra un nivel de talento. @returns {boolean} */
  GM.buyTalent = function (s, id) {
    const c = GM.talentCost(s, id);
    if (c === null || s.res.stars < c) return false;
    s.res.stars -= c;
    s.talents[id] = tl(s, id) + 1;
    GM.dirty(s);
    return true;
  };

  /** Contable Goblin: gasta hasta la mitad del oro en subir niveles de los héroes del equipo. */
  GM.accountant = function (s) {
    let budget = s.res.gold * CFG.accountantShare;
    for (let guard = 0; guard < 40; guard++) {
      let best = null, bestCost = Infinity;
      for (const id of s.party) {
        if (!id || s.heroes[id].lvl <= 0) continue;
        const c = GM.levelCost(s, id, 1);
        if (c < bestCost) { bestCost = c; best = id; }
      }
      if (!best || bestCost > budget) break;
      budget -= bestCost;
      GM.buyLevels(s, best, 1);
    }
  };

  /* ------------------------------------------------------------------ ascenso */

  /** Estrellas que daría ascender ahora. */
  GM.starGain = function (s) {
    const r = s.run;
    const cap = GM.floorCap(s);
    const f = Math.min(r.maxFloor, cap === Infinity ? r.maxFloor : cap);
    return Math.max(1, Math.floor(Math.pow(f, CFG.starExp) / CFG.starBase));
  };
  /** ¿Se puede ascender de rango? */
  GM.canAscend = function (s) { return !!s.run.canAscend; };

  /**
   * Ejecuta el Ascenso de Rango: reinicia el recorrido y concede estrellas.
   * @returns {number} estrellas ganadas (0 si no se pudo).
   */
  GM.ascend = function (s) {
    if (!GM.canAscend(s)) return 0;
    const gain = GM.starGain(s);
    s.res.stars += gain; s.res.starsTotal += gain;
    s.stats.ascents++;
    const rank = Math.min(5, s.run.rank + 1);
    const oldRank = s.run.rank;
    s.run = newRun(rank);
    s.res.gold = CFG.startGold * Math.pow(CFG.herenciaGrowth, tl(s, 'herencia'));
    s.res.iron = 0;
    s.gear = [0, 0, 0];
    s.bld = { mercado: 0, mina: 0, santuario: 0 };
    for (const h of GM.HEROES) {
      const hs = s.heroes[h.id];
      hs.hpf = 1; hs.down = false; hs.cd = 0; hs.buffT = 0; hs.acc = 0;
      if (hs.lvl > 0) hs.lvl = 1 + TALENT_BY_ID.veteranos.per * tl(s, 'veteranos');
    }
    s.fx = { shieldT: 0, shieldV: 0, partyT: 0, partyV: 1 };
    GM.dirty(s);
    ev(s, { t: 'ascend', rank: rank, oldRank: oldRank, stars: gain });
    return gain;
  };

  /* -------------------------------------------------------------------- logros */

  function statValue(s, key) {
    switch (key) {
      case 'hours': return s.t.played / 3600;
      case 'talentLevels': { let n = 0; for (const k of Object.keys(s.talents)) n += s.talents[k]; return n; }
      case 'heroesHired': return GM.HEROES.filter((h) => s.heroes[h.id].lvl > 0).length;
      default: return s.stats[key] || 0;
    }
  }
  /** Comprueba los logros y concede los nuevos. @returns {string[]} ids nuevos. */
  GM.checkAchievements = function (s) {
    const got = [];
    for (const a of GM.ACHIEVEMENTS) {
      if (s.ach[a.id]) continue;
      if (statValue(s, a.stat) >= a.n) { s.ach[a.id] = true; got.push(a.id); ev(s, { t: 'ach', id: a.id }); }
    }
    if (got.length) GM.dirty(s);
    return got;
  };

  /* -------------------------------------------------------------- sin conexión */

  /**
   * Simula el tiempo que el jugador estuvo fuera.
   * @param {object} s Estado.
   * @param {number} away Segundos transcurridos desde el último guardado.
   * @returns {object|null} Informe, o null si fue muy poco tiempo.
   */
  GM.offline = function (s, away) {
    if (!(away > 60)) return null;
    const D = GM.D(s);
    const before = { gold: s.res.gold, iron: s.res.iron, crystals: s.res.crystals, floor: s.run.floor, kills: s.stats.kills, maxFloor: s.stats.maxFloor };
    const sim = Math.min(away, D.offCapS) * D.offEff;
    const wasEv = s.evOn;
    s.evOn = false;
    GM.advance(s, sim, true);
    s.evOn = wasEv;
    GM.checkAchievements(s);
    return {
      away: away, capped: away > D.offCapS, simulated: sim,
      gold: s.res.gold - before.gold, iron: s.res.iron - before.iron, crystals: s.res.crystals - before.crystals,
      kills: s.stats.kills - before.kills, floors: s.stats.maxFloor - before.maxFloor, floor: s.run.floor,
      eff: D.offEff,
    };
  };

  /* ------------------------------------------------------------------ guardado */

  /** Convierte el estado a JSON (sin cachés ni el enemigo en curso). */
  GM.serialize = function (s) {
    s.t.saved = Date.now();
    const copy = Object.assign({}, s);
    delete copy._d; delete copy.ev; delete copy.evOn; delete copy._achT; delete copy._buyT;
    copy.run = Object.assign({}, s.run, { enemy: null });
    return JSON.stringify(copy);
  };

  /**
   * Reconstruye un estado desde JSON, rellenando con valores por defecto lo que falte.
   * @throws {Error} si el texto no es un guardado válido.
   */
  GM.deserialize = function (json) {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || !data.res || !data.run || !data.heroes) throw new Error('Guardado inválido');
    const s = GM.merge(GM.newState(), data);
    const fix = (o, k, d) => { if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) o[k] = d; };
    ['gold', 'iron', 'crystals', 'stars', 'starsTotal'].forEach((k) => fix(s.res, k, 0));
    s.run.enemy = null;
    s.run.spawnT = CFG.spawnDelay;
    fix(s.run, 'floor', 1);
    s.run.floor = Math.max(1, Math.floor(s.run.floor));
    if (!Array.isArray(s.party) || s.party.length !== 4) s.party = ['guerrero', null, null, null];
    s.party = s.party.map((id) => (id && s.heroes[id] && s.heroes[id].lvl > 0 ? id : null));
    if (s.party.every((x) => !x)) s.party[0] = 'guerrero';
    s.ev = []; s.evOn = false; s._d = null;
    return s;
  };

  /** Exporta el guardado como texto base64 para copiar/pegar. */
  GM.exportSave = function (s) { return GM.toB64(GM.serialize(s)); };
  /** Importa un guardado en base64 (o JSON). @throws {Error} si no es válido. */
  GM.importSave = function (text) {
    text = String(text || '').trim();
    if (!text) throw new Error('Texto vacío');
    const json = text[0] === '{' ? text : GM.fromB64(text);
    return GM.deserialize(json);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
