/**
 * Capa de enganche: cofres, reliquias, misiones, recompensa diaria, especializaciones,
 * goblin del tesoro y bestiario. Sin DOM: se prueba y se simula en Node.
 * Se engancha al motor con GM.on(...) y GM.fxProviders (ver core.js). Diseño: design/engagement.md.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const CFG = GM.CFG;
  const L = GM.Loot = {};

  const RELIC_BY_ID = {};
  GM.RELICS.forEach((r) => { RELIC_BY_ID[r.id] = r; });
  const QUEST_BY_ID = {};
  GM.QUESTS.forEach((q) => { QUEST_BY_ID[q.id] = q; });
  L.RELIC_BY_ID = RELIC_BY_ID;
  L.QUEST_BY_ID = QUEST_BY_ID;

  const ev = (s, o) => { if (s.evOn) s.ev.push(o); };
  const rnd = () => GM.rand();
  const pickInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  /** Estado inicial de la capa (se guarda dentro de s.loot). */
  L.fresh = function () {
    return {
      relics: {},                              // id -> nivel
      chests: { bronce: 0, plata: 0, oro: 0 }, // cofres sin abrir
      quests: [],
      pity: 0,                                 // tiradas desde la última legendaria
      daily: { claimed: '', streak: 0 },
      perks: {},                               // héroe -> [opción|null, opción|null, opción|null]
      maxLvl: {},                              // héroe -> nivel máximo alcanzado alguna vez
      bossChest: {},                           // recorrido:piso -> ya dio cofre (evita repetir al farmear)
      gob: null, gobT: 90 + Math.floor(Math.random() * 120),
    };
  };
  /** Devuelve s.loot, creándolo si es una partida antigua. */
  function lt(s) {
    if (!s.loot || !s.loot.chests) s.loot = L.fresh();
    return s.loot;
  }
  L.of = lt;

  function addGold(s, g) { s.res.gold += g; s.run.goldEarned += g; s.stats.goldTotal += g; }
  /** Oro de referencia: lo que da una baja media ahora mismo (para escalar los premios). */
  function goldRef(s) { return CFG.gold0 * GM.goldScale(Math.max(1, s.run.floor)) * GM.D(s).goldMult; }

  /* ----------------------------------------------------------------- bestiario */

  /** Hitos de bajas conseguidos por un tipo de enemigo (0-4). */
  L.tierOf = function (kills) {
    let t = 0;
    for (const n of CFG.bestiaryTiers) if (kills >= n) t++;
    return t;
  };
  /** Suma de hitos del bestiario de todos los tipos. */
  L.bestiaryTotal = function (s) {
    let n = 0;
    for (const b of GM.BESTIARY) n += L.tierOf(s.kills[b.id] || 0);
    return n;
  };

  /* -------------------------------------------------------------- efectos (fx) */

  GM.fxProviders.push(function (s, X, H) {
    const l = lt(s);
    let distinct = 0;
    for (const r of GM.RELICS) {
      const lv = l.relics[r.id] || 0;
      if (!lv) continue;
      distinct++;
      for (const k of Object.keys(r.fx)) X[k] += r.fx[k] * lv;
    }
    const sets = Math.floor(distinct / CFG.setEvery);
    X.dmg += sets * CFG.setBonus; X.gold += sets * CFG.setBonus;
    X.dmg += L.bestiaryTotal(s) * CFG.bestiaryDmg;
    for (const id of Object.keys(l.perks)) {
      const nodes = GM.PERKS[id];
      if (!nodes || !H[id]) continue;
      l.perks[id].forEach((idx, n) => {
        if (idx !== 0 && idx !== 1) return;
        const fx = nodes[n][idx][1];
        for (const k of Object.keys(fx)) {
          if (k === 'pdmg' || k === 'gold') X[k] += fx[k]; else H[id][k] += fx[k];
        }
      });
    }
  });

  /* -------------------------------------------------------------------- cofres */

  /** Añade cofres al inventario. */
  L.addChest = function (s, tier, n, source) {
    n = n || 1;
    lt(s).chests[tier] += n;
    ev(s, { t: 'chestGet', tier: tier, n: n, source: source || '' });
  };
  /** Número total de cofres sin abrir. */
  L.chestTotal = function (s) {
    const c = lt(s).chests;
    return c.bronce + c.plata + c.oro;
  };

  function rollWeights(w) {
    const total = w.reduce((a, b) => a + b, 0);
    let x = rnd() * total;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
    return w.length - 1;
  }

  /** Entrega una reliquia (sube de nivel si ya la tenías). @returns {object} resultado para mostrar. */
  L.grantRelic = function (s, relic) {
    const l = lt(s);
    const lv = l.relics[relic.id] || 0, max = GM.RELIC_MAX[relic.rar];
    if (lv >= max) {            // al máximo: se convierte en cristales
      const c = 1 + relic.rar;
      s.res.crystals += c;
      return { id: relic.id, rar: relic.rar, converted: c, level: lv };
    }
    l.relics[relic.id] = lv + 1;
    s.stats.relics = GM.RELICS.filter((r) => l.relics[r.id]).length;
    s.stats.legendary = GM.RELICS.filter((r) => r.rar === 3 && l.relics[r.id]).length;
    if (lv + 1 === max) s.stats.relicsMaxed++;
    GM.dirty(s);
    return { id: relic.id, rar: relic.rar, isNew: lv === 0, level: lv + 1, max: max };
  };

  /**
   * Abre un cofre y aplica el premio.
   * @returns {object|null} {tier, gold, crystals, levels:{id,n}|null, relics:[...]} o null si no hay cofre.
   */
  L.open = function (s, tier) {
    const l = lt(s), C = GM.CHESTS[tier];
    if (!C || l.chests[tier] <= 0) return null;
    l.chests[tier]--;
    const out = { tier: tier, gold: 0, crystals: 0, levels: null, relics: [] };
    out.gold = goldRef(s) * C.gold * (0.8 + rnd() * 0.4);
    addGold(s, out.gold);
    if (rnd() < C.crystals[0]) { out.crystals = 1 + Math.floor(rnd() * C.crystals[1]); s.res.crystals += out.crystals; }
    // Niveles gratis para un héroe del equipo.
    const members = s.party.filter((id) => id && s.heroes[id].lvl > 0);
    if (members.length) {
      const id = members[Math.floor(rnd() * members.length)];
      const n = pickInt(C.levels[0], C.levels[1]);
      s.heroes[id].lvl += n;
      if (s.heroes[id].lvl > s.stats.topLevel) s.stats.topLevel = s.heroes[id].lvl;
      L.noteLevel(s, id);
      out.levels = { id: id, n: n };
    }
    for (let i = 0; i < C.rolls; i++) {
      l.pity++;
      let w = C.w.slice();
      if (i === 0 && C.guarantee) { w = [0, w[1] + w[0] * 0.6, w[2] + w[0] * 0.3, w[3] + w[0] * 0.1]; }   // el primero es al menos raro
      let rar = rollWeights(w);
      if (l.pity >= CFG.pityLegend) rar = 3;
      if (rar === 3) l.pity = 0;
      const pool = GM.RELICS.filter((r) => r.rar === rar);
      out.relics.push(L.grantRelic(s, pool[Math.floor(rnd() * pool.length)]));
    }
    s.stats.chests++;
    GM.dirty(s);
    GM.emit(s, 'chestOpen', out);
    return out;
  };

  /** Abre todos los cofres (de bronce a oro). @returns {object[]} resultados. */
  L.openAll = function (s) {
    const res = [];
    for (const tier of GM.CHEST_ORDER) {
      let r;
      while ((r = L.open(s, tier))) res.push(r);
    }
    return res;
  };

  /* ------------------------------------------------------------ especializaciones */

  /** Nivel máximo alcanzado por un héroe (las especializaciones se abren con él). */
  L.maxLvl = function (s, id) { return Math.max(lt(s).maxLvl[id] || 0, s.heroes[id].lvl); };
  /** Anota el nivel actual de un héroe como máximo si lo supera. */
  L.noteLevel = function (s, id) { const l = lt(s); if (s.heroes[id].lvl > (l.maxLvl[id] || 0)) l.maxLvl[id] = s.heroes[id].lvl; };

  /** Nodos de especialización de un héroe: [{lv, unlocked, chosen, opts:[[nombre, fx],[nombre, fx]]}]. */
  L.perkNodes = function (s, id) {
    const l = lt(s), ch = l.perks[id] || [null, null, null], max = L.maxLvl(s, id);
    return GM.PERKS[id].map((opts, n) => ({ lv: GM.PERK_LEVELS[n], unlocked: max >= GM.PERK_LEVELS[n], chosen: ch[n] === 0 || ch[n] === 1 ? ch[n] : null, opts: opts }));
  };
  /** Lista de especializaciones disponibles para elegir: [{id, node}]. */
  L.perkAvailable = function (s) {
    const out = [];
    for (const h of GM.HEROES) {
      if (s.heroes[h.id].lvl <= 0) continue;
      L.perkNodes(s, h.id).forEach((nd, n) => { if (nd.unlocked && nd.chosen === null) out.push({ id: h.id, node: n }); });
    }
    return out;
  };
  /** Elige una opción de un nodo. @returns {boolean} */
  L.choosePerk = function (s, id, node, idx) {
    const l = lt(s);
    if (!GM.PERKS[id] || !(node >= 0 && node < 3) || (idx !== 0 && idx !== 1)) return false;
    const nd = L.perkNodes(s, id)[node];
    if (!nd.unlocked || nd.chosen !== null) return false;
    if (!l.perks[id]) l.perks[id] = [null, null, null];
    l.perks[id][node] = idx;
    s.stats.perks = Object.keys(l.perks).reduce((a, k) => a + l.perks[k].filter((x) => x === 0 || x === 1).length, 0);
    GM.dirty(s);
    return true;
  };
  /** Reasigna las especializaciones de un héroe (cuesta cristales). @returns {boolean} */
  L.respec = function (s, id) {
    const l = lt(s);
    if (!l.perks[id] || s.res.crystals < CFG.perkRespec) return false;
    s.res.crystals -= CFG.perkRespec;
    l.perks[id] = [null, null, null];
    s.stats.perks = Object.keys(l.perks).reduce((a, k) => a + l.perks[k].filter((x) => x === 0 || x === 1).length, 0);
    GM.dirty(s);
    return true;
  };

  /* ------------------------------------------------------------------- misiones */

  function genQuest(s, avoid) {
    const mf = s.stats.maxFloor, tier = Math.floor(mf / 12);
    const pool = GM.QUESTS.filter((q) => mf >= q.unlock && avoid.indexOf(q.id) < 0);
    const q = pool[Math.floor(rnd() * pool.length)] || GM.QUESTS[0];
    const ramp = 1 + s.stats.quests * CFG.questRamp;      // cada misión cumplida hace más exigentes las siguientes
    const out = { id: q.id, goal: Math.max(1, Math.round(q.base * (1 + tier * q.grow) * ramp)), p: 0, done: false, reward: q.reward };
    if (q.amount) out.goal = Math.max(1, Math.round(goldRef(s) * q.base * (1 + tier * q.grow) * ramp));   // metas de oro: relativas a lo que ganas ahora
    if (q.id === 'killsType') {
      const zone = GM.ZONES[GM.zoneIndex(Math.max(1, s.run.floor))];
      out.type = zone.enemies[Math.floor(rnd() * zone.enemies.length)];
      out.name = GM.ENEMIES[out.type].name;
    }
    return out;
  }
  /** Completa hasta tener las misiones abiertas configuradas. */
  L.ensureQuests = function (s) {
    const l = lt(s);
    while (l.quests.length < CFG.questSlots) l.quests.push(genQuest(s, l.quests.map((x) => x.id)));
  };
  /** Texto de una misión. */
  L.questText = function (q) { return QUEST_BY_ID[q.id].text(q.goal, q.name); };

  /** Avanza las misiones que escuchan este evento. */
  function questEvent(s, name, amount, extra) {
    const l = lt(s);
    for (const q of l.quests) {
      const def = QUEST_BY_ID[q.id];
      if (!def || q.done || def.ev !== name) continue;
      if (q.id === 'killsType' && (!extra || extra.type !== q.type)) continue;
      q.p = def.max ? Math.max(q.p, amount) : q.p + amount;
      if (q.p >= q.goal) { q.p = q.goal; q.done = true; ev(s, { t: 'questDone', id: q.id }); }
    }
  }
  /** Reclama una misión cumplida: da el cofre y pone otra misión. @returns {string|null} cofre entregado. */
  L.claimQuest = function (s, idx) {
    const l = lt(s), q = l.quests[idx];
    if (!q || !q.done) return null;
    L.addChest(s, q.reward, 1, 'misión');
    s.stats.quests++;
    l.quests.splice(idx, 1);
    L.ensureQuests(s);
    return q.reward;
  };
  /** Reclama todas las misiones cumplidas. @returns {number} cuántas. */
  L.claimAll = function (s) {
    let n = 0;
    for (let i = lt(s).quests.length - 1; i >= 0; i--) if (L.claimQuest(s, i)) n++;
    return n;
  };

  /* -------------------------------------------------------------- recompensa diaria */

  /** Fecha local AAAA-MM-DD (sustituible en pruebas). */
  L.today = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const dayNum = (str) => { const p = str.split('-').map(Number); return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); };

  /**
   * Estado de la recompensa diaria.
   * @returns {{ready:boolean, streak:number, day:number, reward:object}} streak = racha que tendrías al reclamar.
   */
  L.dailyStatus = function (s) {
    const d = lt(s).daily, today = L.today();
    if (d.claimed === today) return { ready: false, streak: d.streak, day: ((d.streak - 1) % 7) + 1, reward: GM.DAILY[(d.streak - 1) % 7] };
    let streak = 1;
    if (d.claimed) {
      const gap = dayNum(today) - dayNum(d.claimed);
      if (gap < 0) return { ready: false, streak: d.streak, day: ((d.streak - 1) % 7) + 1, reward: GM.DAILY[(Math.max(1, d.streak) - 1) % 7] };
      streak = gap <= 2 ? d.streak + 1 : 1;      // un día sin entrar se perdona
    }
    return { ready: true, streak: streak, day: ((streak - 1) % 7) + 1, reward: GM.DAILY[(streak - 1) % 7] };
  };
  /** Reclama la recompensa de hoy. @returns {object|null} {streak, day, chest, crystals}. */
  L.claimDaily = function (s) {
    const st = L.dailyStatus(s);
    if (!st.ready) return null;
    const d = lt(s).daily;
    d.claimed = L.today(); d.streak = st.streak;
    s.stats.dailies++;
    if (st.streak > s.stats.streak) s.stats.streak = st.streak;
    L.addChest(s, st.reward.chest, 1, 'diaria');
    if (st.reward.crystals) s.res.crystals += st.reward.crystals;
    return { streak: st.streak, day: st.day, chest: st.reward.chest, crystals: st.reward.crystals || 0 };
  };

  /** Cofre de bienvenida tras una ausencia larga. @returns {string|null} cofre entregado. */
  L.welcome = function (s, awaySec) {
    if (!(awaySec >= CFG.welcomeAfterS)) return null;
    const tier = awaySec >= 4 * 3600 ? 'plata' : 'bronce';
    L.addChest(s, tier, 1, 'bienvenida');
    return tier;
  };

  /* --------------------------------------------------------------- goblin del tesoro */

  /** Golpea al goblin del tesoro. @returns {'hit'|'caught'|null} */
  L.hitGoblin = function (s) {
    const l = lt(s), g = l.gob;
    if (!g) return null;
    g.hits++;
    ev(s, { t: 'gobHit', hits: g.hits, need: g.need });
    if (g.hits < g.need) return 'hit';
    const gold = goldRef(s) * CFG.goblinGold;
    addGold(s, gold);
    L.addChest(s, 'plata', 1, 'goblin');
    s.stats.goblins++;
    ev(s, { t: 'gobCaught', gold: gold });
    l.gob = null; l.gobT = CFG.goblinMin + rnd() * (CFG.goblinMax - CFG.goblinMin);
    GM.emit(s, 'goblin', {});
    return 'caught';
  };

  /* ---------------------------------------------------------------- suscripciones */

  GM.on('tick', function (s, dt) {
    const l = lt(s);
    if (l.quests.length < CFG.questSlots) L.ensureQuests(s);
    questEvent(s, 'time', dt / 60);
    // Cofre por tiempo de juego (también sin conexión): un goteo de recompensas que no depende de avanzar de piso.
    l.timeT = (l.timeT || 0) + dt;
    if (l.timeT >= CFG.timeChestEvery) {
      l.timeT -= CFG.timeChestEvery; l.timeN = (l.timeN || 0) + 1;
      L.addChest(s, l.timeN % 4 === 0 ? 'plata' : 'bronce', 1, 'tiempo');
    }
    if (!s.evOn) return;      // el goblin solo aparece con el jugador delante
    if (l.gob) {
      l.gob.t += dt;
      if (l.gob.t >= l.gob.life) { ev(s, { t: 'gobEscape' }); l.gob = null; l.gobT = CFG.goblinMin + rnd() * (CFG.goblinMax - CFG.goblinMin); }
      return;
    }
    if (s.stats.maxFloor < 4 || !s.run.enemy) return;
    l.gobT -= dt;
    if (l.gobT <= 0) { l.gob = { t: 0, life: CFG.goblinLife, hits: 0, need: CFG.goblinHits }; ev(s, { t: 'gobSpawn' }); }
  });

  GM.on('kill', function (s, d) {
    const l = lt(s), e = d.e, find = GM.D(s).chestFind;
    if (e.boss === 1 && rnd() < CFG.chestMini * find) L.addChest(s, 'bronce', 1, 'minijefe');
    if (e.boss >= 2) {
      const key = s.stats.ascents + ':' + s.run.floor;
      if (!l.bossChest[key]) { l.bossChest[key] = true; L.addChest(s, 'oro', 1, 'jefe'); }
    }
    if (e.golden && rnd() < CFG.chestGolden * find) L.addChest(s, 'plata', 1, 'dorado');
    // Bestiario: premio de cristales al alcanzar un hito.
    const k = s.kills[e.type] || 0, ti = CFG.bestiaryTiers.indexOf(k);
    if (ti >= 0) {
      const c = CFG.bestiaryCrystals[ti];
      if (c) s.res.crystals += c;
      s.stats.bestiary = L.bestiaryTotal(s);
      GM.dirty(s);
      ev(s, { t: 'bestiary', type: e.type, tier: ti + 1, crystals: c });
    }
    questEvent(s, 'kill', 1);
    questEvent(s, 'killType', 1, { type: e.type });
    questEvent(s, 'gold', d.gold);
  });
  GM.on('boss', (s) => questEvent(s, 'boss', 1));
  GM.on('floorUp', (s) => questEvent(s, 'floorUp', 1));
  GM.on('cast', (s) => questEvent(s, 'cast', 1));
  GM.on('tap', (s) => questEvent(s, 'tap', 1));
  GM.on('crit', (s) => questEvent(s, 'crit', 1));
  GM.on('frenzy', (s) => questEvent(s, 'frenzy', 1));
  GM.on('chestOpen', (s) => questEvent(s, 'chestOpen', 1));
  GM.on('goblin', (s) => questEvent(s, 'goblin', 1));
  GM.on('combo', (s, n) => questEvent(s, 'combo', n));
  GM.on('gear', (s) => questEvent(s, 'gear', 1));
  GM.on('levels', function (s, d) { L.noteLevel(s, d.id); questEvent(s, 'levels', d.n); });
  GM.on('hire', (s, d) => L.noteLevel(s, d.id));
  GM.on('ach', (s, a) => L.addChest(s, a.reward || 'bronce', 1, 'logro'));
})(typeof globalThis !== 'undefined' ? globalThis : this);
