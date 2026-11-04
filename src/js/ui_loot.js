/**
 * Interfaz de la capa de enganche: pestaña Botín (misiones, cofres, reliquias, bestiario, logros),
 * revelado de cofres, especializaciones, recompensa diaria y efectos del combate (combo, frenesí,
 * goblin, hitos). Se carga después de ui.js.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const UI = GM.UI;
  const CFG = GM.CFG;
  const L = GM.Loot;
  const fmt = GM.fmt;
  const S = () => UI.get();
  const $ = (sel) => document.querySelector(sel);

  UI.lootTab = 'quests';

  const CHEST_NAME = { bronce: 'Cofre de bronce', plata: 'Cofre de plata', oro: 'Cofre de oro' };
  const CHEST_IMG = (t) => UI.portrait('cofre_' + t);
  const RAR = GM.RARITY;
  const rewardText = (r) => `${CHEST_NAME[r.chest]}${r.crystals ? ' + ' + r.crystals + ' 💎' : ''}`;

  /* ------------------------------------------------------------------- banner */

  /** Muestra un cartel grande sobre el escenario. @param {string} text @param {string} [cls] boss | gold */
  UI.banner = function (text, cls) {
    const b = $('#banner');
    if (!b) return;
    b.hidden = false; b.className = cls || ''; b.textContent = text;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.hidden = true; }, 1900);
  };
  /** Pequeño temblor del escenario (crítico, jefe). */
  UI.shake = function () {
    const st = $('#stage');
    if (!st || st._shaking) return;
    st._shaking = true; st.classList.add('shake');
    setTimeout(() => { st.classList.remove('shake'); st._shaking = false; }, 190);
  };

  /* -------------------------------------------------------------- siguiente meta */

  /** Elige la meta más cercana de cumplir para mostrarla bajo la barra del enemigo. */
  function nextGoal(s) {
    const c = [];
    const total = L.chestTotal(s);
    if (L.of(s).quests.some((q) => q.done)) c.push({ text: '✅ Misión lista para reclamar (Botín)', frac: 1, score: 2.1 });
    if (L.perkAvailable(s).length) { const a = L.perkAvailable(s)[0]; c.push({ text: `⭐ ${GM.HERO_BY_ID[a.id].name}: ¡nueva especialización!`, frac: 1, score: 2 }); }
    if (total > 0) c.push({ text: `🎁 Tienes ${total} cofre${total > 1 ? 's' : ''} por abrir`, frac: 1, score: 1.9 });
    if (L.dailyStatus(s).ready) c.push({ text: '☀️ Recompensa diaria disponible (Botín)', frac: 1, score: 1.8 });
    for (const id of s.party) {
      if (!id || s.heroes[id].lvl <= 0) continue;
      const lvl = s.heroes[id].lvl, ms = GM.nextMilestone(lvl);
      if (!ms) continue;
      let prev = 0;
      for (const m of CFG.milestones) { if (m <= lvl) prev = m; else break; }
      const frac = (lvl - prev) / (ms - prev), left = ms - lvl;
      c.push({ text: `⬆️ ${GM.HERO_BY_ID[id].name}: ${left} niv. para ×${CFG.msMult} de poder`, frac: frac, score: frac + (left <= 5 ? 0.6 : 0) });
    }
    for (const q of L.of(s).quests) {
      if (q.done) continue;
      const frac = q.p / q.goal;
      c.push({ text: `🎯 ${L.questText(q)} (${fmt(Math.floor(q.p))}/${fmt(q.goal)})`, frac: frac, score: frac * 0.95 });
    }
    if (s.run.floor % 5 === 0) c.push({ text: `⚔️ Jefe del piso ${s.run.floor}: ${CFG.killsPerFloor - s.run.kills} bajas`, frac: s.run.kills / CFG.killsPerFloor, score: 0.3 });
    if (!c.length) return null;
    c.sort((a, b) => b.score - a.score);
    return c[0];
  }

  /* ------------------------------------------------------------------ HUD vivo */

  const hud = { dps: 0, combo: 0, delta: 0 };

  /** Actualiza fichas y barras del combate (se llama desde UI.refresh). */
  UI.refreshHud = function () {
    const s = S(), D = GM.D(s);
    // Cofres.
    const total = L.chestTotal(s);
    const cb = $('#r-chest');
    cb.hidden = total === 0;
    $('#r-chest b').textContent = total;
    // Daño por segundo del equipo (con su cambio al comprar).
    let dps = 0;
    for (const id of s.party) if (id && s.heroes[id].lvl > 0) dps += D.hero[id].dps * D.aura;
    $('#r-dps b').textContent = fmt(dps);
    if (hud.dps > 0 && dps > hud.dps * 1.004) {
      const pct = (dps / hud.dps - 1) * 100;
      const el = $('#dps-delta');
      el.textContent = '+' + (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) + '%';
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    hud.dps = dps;
    // Combo.
    const cm = $('#combo'), n = s.cmb.n;
    if (n >= 3) {
      cm.hidden = false;
      cm.textContent = `COMBO ×${n}  +${Math.round(Math.min(CFG.comboMax, n) * CFG.comboGold * 100)}% oro`;
      cm.style.fontSize = Math.min(26, 14 + n / 5) + 'px';
      cm.classList.toggle('hot', n >= 25);
      if (n !== hud.combo) { cm.classList.remove('pop'); void cm.offsetWidth; cm.classList.add('pop'); }
    } else cm.hidden = true;
    hud.combo = n;
    // Frenesí.
    const fr = $('#fr-row'), active = s.fr.t > 0, ready = !active && s.fr.m >= CFG.frenzyNeed;
    fr.hidden = s.stats.kills < 3;
    fr.classList.toggle('ready', ready); fr.classList.toggle('active', active);
    $('#fr-row .fill').style.width = (active ? (s.fr.t / CFG.frenzyDur) : (s.fr.m / CFG.frenzyNeed)) * 100 + '%';
    $('#fr-row .txt').textContent = active ? `🔥 FRENESÍ ×${CFG.frenzyDmg} daño · ${Math.ceil(s.fr.t)} s` : ready ? '🔥 ¡FRENESÍ! (toca aquí)' : `🔥 Frenesí ${Math.floor(s.fr.m)}%`;
    $('#stage').classList.toggle('frenzy', active);
    // Siguiente meta.
    const g = nextGoal(s), ge = $('#goal');
    if (g) {
      ge.hidden = false;
      $('#goal .gtxt').textContent = g.text;
      $('#goal .gbar i').style.width = Math.min(100, Math.max(0, g.frac * 100)) + '%';
      ge.classList.toggle('near', g.frac >= 0.8);
    } else ge.hidden = true;
    // Música de la zona.
    if (s.flags.music !== false) { GM.Audio.musicOn = true; GM.Audio.music(GM.zoneIndex(s.run.floor)); } else GM.Audio.musicOn = false;
  };

  /** Punto rojo de la pestaña Botín. */
  UI.lootDot = function () {
    const s = S();
    return L.chestTotal(s) > 0 || L.of(s).quests.some((q) => q.done) || L.perkAvailable(s).length > 0 || L.dailyStatus(s).ready;
  };

  /** Conexiones que solo se hacen una vez. */
  UI.initLoot = function () {
    $('#fr-row').addEventListener('click', () => { GM.Audio.unlock(); if (GM.startFrenzy(S())) UI.refresh(true); });
    $('#r-chest').addEventListener('click', () => { UI.lootTab = 'chests'; UI.setTab('loot'); });
  };

  /* ------------------------------------------------------------------- eventos */

  /** Eventos del motor propios de la capa de enganche. */
  UI.lootEvent = function (e) {
    const s = S(), A = GM.Audio;
    switch (e.t) {
      case 'chestGet': {
        const n = e.n > 1 ? e.n + '× ' : '';
        UI.toast(`🎁 ${n}<b>${CHEST_NAME[e.tier]}</b>${e.source ? ' <small>(' + e.source + ')</small>' : ''}`, 'good', 'chest');
        A.play('unlock');
        break;
      }
      case 'questDone': {
        const q = L.of(s).quests.find((x) => x.id === e.id && x.done);
        UI.toast(`✅ <b>Misión cumplida</b>${q ? '<br><small>' + L.questText(q) + '</small>' : ''}`, 'good');
        A.play('quest');
        break;
      }
      case 'frenzy': UI.banner('🔥 ¡FRENESÍ!', 'gold'); A.play('frenzy'); UI.shake(); break;
      case 'frenzyReady': A.play('frenzyReady'); break;
      case 'gobSpawn': UI.toast('💰 <b>¡Goblin del Tesoro!</b> Tócalo antes de que huya', 'info'); A.play('gobSpawn'); break;
      case 'gobHit': A.play('gobHit'); break;
      case 'gobCaught': UI.banner('💰 ¡GOBLIN ATRAPADO!', 'gold'); A.play('gobCaught'); UI.shake(); break;
      case 'gobEscape': UI.toast('El goblin se escapó con su botín…', 'warn'); break;
      case 'bestiary': {
        const b = GM.BESTIARY.find((x) => x.id === e.type);
        UI.toast(`📚 Bestiario: <b>${b ? b.name : e.type}</b> · hito ${e.tier}${e.crystals ? ' · +' + e.crystals + ' 💎' : ''}`, 'info');
        A.play('unlock');
        break;
      }
      default:
    }
  };

  /** Efectos al subir niveles de un héroe: texto flotante, sonido y cartel si cruza un hito. */
  UI.levelFx = function (id, before, after) {
    if (after <= before) return;
    const s = S(), A = GM.Audio;
    const p = GM.Scene.heroAnchor(s, id);
    if (p) UI.float(p.x + 16, p.y - 10, 'Nv ' + after, 'lvl');
    if (GM.milestoneCount(after) > GM.milestoneCount(before)) {
      UI.banner(`¡HITO! ${GM.HERO_BY_ID[id].name} ×${CFG.msMult} poder`, 'gold');
      A.play('milestone'); UI.shake();
    } else A.play('levelup');
    if (L.perkAvailable(s).some((x) => x.id === id) && !s.flags.perkToast) {
      UI.toast(`⭐ ¡<b>${GM.HERO_BY_ID[id].name}</b> puede elegir una especialización!`, 'good');
    }
  };

  /* ------------------------------------------------------------------- goblin */

  /** Si el toque cae sobre el goblin del tesoro, lo golpea. @returns {boolean} true si lo golpeó. */
  UI.goblinTap = function (lx, ly) {
    const s = S();
    if (!L.of(s).gob) return false;
    const box = GM.Scene.goblinBox(s);
    if (!box || lx < box.x - 8 || lx > box.x + box.w + 8 || ly < box.y - 8 || ly > box.y + box.h + 8) return false;
    const r = L.hitGoblin(s);
    if (r) UI.float(lx, ly - 8, r === 'caught' ? '¡Atrapado!' : '¡Toma!', 'gold');
    return true;
  };

  /* ------------------------------------------------------------ especializaciones */

  /** Etiquetas de las especializaciones elegidas de un héroe (para su tarjeta). */
  UI.perkChips = function (id) {
    const s = S();
    const chosen = L.perkNodes(s, id).filter((n) => n.chosen !== null).map((n) => n.opts[n.chosen][0]);
    return chosen.length ? `<div class="perkchips">${chosen.map((n) => `<span>${UI.esc(n)}</span>`).join('')}</div>` : '';
  };
  /** Botón de especializar (pulsa si hay un nodo sin elegir). */
  UI.perkBtn = function (id) {
    const s = S();
    const nodes = L.perkNodes(s, id), pend = nodes.some((n) => n.unlocked && n.chosen === null);
    const anyChosen = nodes.some((n) => n.chosen !== null);
    if (!pend && !anyChosen) return '';
    return `<button class="btn small ${pend ? 'perk' : ''}" data-act="perks" data-id="${id}">${pend ? '⭐ Especializar' : 'Especialización'}</button>`;
  };

  function perkModal(id) {
    const s = S(), h = GM.HERO_BY_ID[id];
    const nodes = L.perkNodes(s, id);
    const next = nodes.findIndex((n) => n.unlocked && n.chosen === null);
    const list = nodes.map((n, i) => {
      const st = n.chosen !== null ? `✔ <b>${UI.esc(n.opts[n.chosen][0])}</b> <small class="muted">${GM.fxText(n.opts[n.chosen][1])}</small>` : n.unlocked ? (i === next ? '<b>👇 Elige ahora</b>' : '<b>Disponible después</b>') : `🔒 se abre en el nivel ${n.lv}`;
      return `<div class="rw" style="animation:none;opacity:1;transform:none"><div class="rt"><small>Nivel ${n.lv}</small>${st}</div></div>`;
    }).join('');
    let opts = '';
    if (next >= 0) {
      opts = `<p><b>Nueva especialización</b> (nivel ${nodes[next].lv}): elige una. Es permanente.</p>` + nodes[next].opts.map((o, i) =>
        `<button class="btn perkopt" data-pick="${i}"><b>${UI.esc(o[0])}</b><small>${GM.fxText(o[1])}</small></button>`).join('');
    }
    const anyChosen = nodes.some((n) => n.chosen !== null);
    const buttons = [{ label: 'Cerrar', value: false }];
    if (anyChosen) buttons.unshift({ label: `Reasignar (${CFG.perkRespec} 💎)`, value: 'respec' });
    UI.modal({ title: `<img class="px" style="width:34px;height:34px;vertical-align:middle" src="${UI.portrait(id)}"> ${h.name}: especializaciones`, wide: true,
      html: `<div class="rewards">${list}</div>${opts}`, buttons: buttons,
      onOpen: (m) => {
        UI.$$('[data-pick]', m).forEach((btn) => btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (L.choosePerk(S(), id, next, Number(btn.dataset.pick))) {
            GM.Audio.play('unlock');
            UI.closeModal('picked');
          }
        }));
      },
      onClose: (v) => {
        if (v === 'respec') {
          if (!L.respec(S(), id)) { UI.toast(`Hacen falta ${CFG.perkRespec} 💎 para reasignar.`, 'warn'); return false; }
          UI.toast('Especializaciones reasignadas.', 'info');
        }
        return true;
      } }).then((v) => {
      UI.refresh(true);
      // Si queda otro nodo disponible, se ofrece enseguida.
      if (v === 'picked' || v === 'respec') {
        if (L.perkNodes(S(), id).some((n) => n.unlocked && n.chosen === null)) perkModal(id);
      }
    });
  }

  /* ------------------------------------------------------------------- cofres */

  function timers() { return []; }
  const revealTimers = timers();

  /** Agrupa los resultados de varios cofres. */
  function aggregate(results) {
    const agg = { gold: 0, crystals: 0, levels: {}, relics: {} };
    for (const r of results) {
      agg.gold += r.gold; agg.crystals += r.crystals;
      if (r.levels) agg.levels[r.levels.id] = (agg.levels[r.levels.id] || 0) + r.levels.n;
      for (const x of r.relics) {
        const k = x.id;
        const a = agg.relics[k] || (agg.relics[k] = { id: k, rar: x.rar, count: 0, isNew: false, level: 0, converted: 0, max: x.max });
        a.count++; a.level = Math.max(a.level, x.level || 0); if (x.isNew) a.isNew = true; if (x.converted) { a.converted += x.converted; agg.crystals += x.converted; }
      }
    }
    return agg;
  }

  /**
   * Muestra la animación de apertura de uno o varios cofres.
   * @param {object[]} results Resultados de GM.Loot.open.
   * @param {string} [title]
   */
  UI.revealChests = function (results, title) {
    if (!results || !results.length) return Promise.resolve();
    const s = S(), A = GM.Audio;
    const single = results.length === 1, tier = results[0].tier;
    const agg = aggregate(results);
    const items = [];
    items.push({ ico: '🪙', title: `+${fmt(agg.gold)} de oro`, cls: '' });
    if (agg.crystals) items.push({ ico: '💎', title: `+${agg.crystals} cristales`, cls: '' });
    for (const id of Object.keys(agg.levels)) items.push({ ico: '⬆️', title: `+${agg.levels[id]} niveles para ${GM.HERO_BY_ID[id].name}`, cls: '' });
    const rel = Object.values(agg.relics).sort((a, b) => b.rar - a.rar);
    for (const x of rel) {
      const r = L.RELIC_BY_ID[x.id], rar = RAR[x.rar];
      const sub = x.converted && !x.level ? `ya al máximo: +${x.converted} 💎` : `${GM.fxText(r.fx)} por nivel · nivel ${x.level}${x.max ? '/' + x.max : ''}`;
      items.push({ ico: r.icon, title: `${x.count > 1 ? x.count + '× ' : ''}${UI.esc(r.name)}${x.isNew ? '<span class="new">¡NUEVA!</span>' : ''}`, sub: `<span style="color:${rar.color}">${rar.name}</span> · ${sub}`, rc: rar.color, legend: x.rar === 3, rar: x.rar });
    }
    const base = single ? 1.05 : 0.2;
    const html = items.map((it, i) => `<div class="rw ${it.legend ? 'legend' : ''}" style="--rc:${it.rc || 'var(--line)'};animation-delay:${(base + i * 0.4).toFixed(2)}s"><span class="ri">${it.ico}</span><div class="rt"><b>${it.title}</b>${it.sub ? '<small>' + it.sub + '</small>' : ''}</div></div>`).join('');
    const head = single
      ? `<img class="chestimg" id="chestimg" src="${CHEST_IMG(tier)}" alt="">`
      : `<div style="font-size:15px;margin-bottom:4px"><b>${results.length} cofres abiertos</b></div>`;
    let more = 0;
    for (const t of GM.CHEST_ORDER) if (s.loot.chests[t] > 0 && single && t === tier) more = s.loot.chests[t];
    const buttons = [{ label: '¡Genial!', cls: 'primary', value: true }];
    if (more > 0) buttons.unshift({ label: `Abrir otro (${more})`, value: 'again' });
    const timersLocal = [];
    const at = (ms, fn) => timersLocal.push(setTimeout(fn, ms));
    const p = UI.modal({ title: title || (single ? CHEST_NAME[tier] : 'Botín'), wide: true,
      html: `<div class="reveal">${head}<div class="rewards">${html}</div></div>`, buttons: buttons,
      onOpen: () => {
        if (single) {
          A.play('chestShake');
          at(900, () => { A.play('chestOpen'); const im = document.getElementById('chestimg'); if (im) im.classList.add('open'); });
          at(1250, () => { const im = document.getElementById('chestimg'); if (im) im.classList.add('gone'); });
        }
        items.forEach((it, i) => at((base + i * 0.4) * 1000, () => A.play(it.rar !== undefined ? 'reveal' + it.rar : 'coin')));
        if (items.some((it) => it.legend)) at((base + items.findIndex((it) => it.legend) * 0.4) * 1000, () => UI.shake());
      },
      onClose: () => { timersLocal.forEach(clearTimeout); return true; } });
    return p.then((v) => {
      UI.refresh(true);
      if (v === 'again') { const r = L.open(S(), tier); if (r) return UI.revealChests([r]); }
      return undefined;
    });
  };

  /* ----------------------------------------------------------- recompensa diaria */

  function stripHtml(st) {
    return GM.DAILY.map((d, i) => {
      const cur = st.day - 1;
      const cls = i === cur ? (st.ready ? 'today' : 'past') : i < cur ? 'past' : '';
      return `<div class="${cls}">Día ${i + 1}<br>${d.chest === 'oro' ? '🟡' : d.chest === 'plata' ? '⚪' : '🟤'}${d.crystals ? '<br>+' + d.crystals + '💎' : ''}</div>`;
    }).join('');
  }

  /** Reclama la recompensa diaria y abre su cofre con animación. */
  function claimDaily() {
    const s = S(), r = L.claimDaily(s);
    if (!r) return;
    GM.Audio.play('daily');
    if (r.crystals) UI.toast(`☀️ Día ${r.day}: +${r.crystals} 💎`, 'good');
    const res = L.open(s, r.chest);
    if (res) UI.revealChests([res], `☀️ Recompensa diaria · día ${r.day} (racha ${r.streak})`);
  }

  /** Ofrece la recompensa diaria al abrir el juego (una vez al día). */
  UI.dailyPrompt = function () {
    const s = S(), st = L.dailyStatus(s);
    if (!st.ready || s.t.played < 120) return;      // a un jugador nuevo no se le interrumpe al empezar
    const today = L.today();
    if (s.flags.dailyAsk === today) return;
    s.flags.dailyAsk = today;
    UI.modal({ title: '☀️ Recompensa diaria', wide: true,
      html: `<p>¡Hola de nuevo! Racha: <b>${st.streak} día${st.streak > 1 ? 's' : ''}</b>. Hoy te toca: <b>${rewardText(st.reward)}</b>.</p><div class="dailystrip">${stripHtml(st)}</div><p class="muted"><small>Si un día no entras, la racha se perdona una vez.</small></p>`,
      buttons: [{ label: 'Luego', value: false }, { label: 'Reclamar', cls: 'primary', value: true }] })
      .then((v) => { if (v) claimDaily(); });
  };

  /* ---------------------------------------------------------------- pestaña Botín */

  const SUBS = [['quests', '🎯 Misiones'], ['chests', '🎁 Cofres'], ['relics', '🏺 Reliquias'], ['bestiary', '📚 Bestiario'], ['ach', '🏆 Logros']];

  function questRows(s) {
    const rows = [];
    const st = L.dailyStatus(s);
    rows.push({ key: 'daily', cls: 'card daily' + (st.ready ? ' ready' : ''), html: `<div class="ico">☀️</div><div class="grow"><div class="title"><b>Recompensa diaria</b> <span class="lvl">Racha ${st.streak}</span></div>
      <div class="muted">${st.ready ? 'Hoy: ' + rewardText(st.reward) : 'Ya reclamada. Vuelve mañana: ' + rewardText(GM.DAILY[st.streak % 7])}</div><div class="dailystrip">${stripHtml(st)}</div></div>
      <div class="actions">${st.ready ? '<button class="btn buy can pulse" data-act="daily">Reclamar</button>' : '<span class="tag ok">✔ Hecha</span>'}</div>` });
    rows.push({ key: 'h-q', cls: 'sect', html: '🎯 <b>Misiones del gremio</b> <small>siempre hay 3 abiertas</small>' });
    L.of(s).quests.forEach((q, i) => {
      const pct = Math.min(100, (q.p / q.goal) * 100);
      rows.push({ key: 'q' + i + q.id, cls: 'card' + (q.done ? ' questdone' : ''), html: `<div class="ico chestrow"><img class="px" src="${CHEST_IMG(q.reward)}" alt=""></div><div class="grow"><div class="title"><b>${UI.esc(L.questText(q))}</b></div>
        <div class="muted">Premio: ${CHEST_NAME[q.reward]}</div><div class="pbar"><i style="width:${pct}%"></i></div><small class="muted">${fmt(Math.floor(q.p))} / ${fmt(q.goal)}</small></div>
        <div class="actions">${q.done ? `<button class="btn buy can pulse" data-act="qclaim" data-i="${i}">Reclamar</button>` : ''}</div>` });
    });
    rows.push({ key: 'qnote', cls: 'credits', html: `Misiones cumplidas: ${s.stats.quests}. Cada una hace más exigentes las siguientes.` });
    return rows;
  }

  function chestRows(s) {
    const rows = [], c = L.of(s).chests, total = L.chestTotal(s);
    GM.CHEST_ORDER.forEach((t) => {
      const C = GM.CHESTS[t];
      rows.push({ key: 'c-' + t, cls: 'card chestrow', html: `<div class="ico"><img class="px" src="${CHEST_IMG(t)}" alt=""></div><div class="grow"><div class="title"><b>${CHEST_NAME[t]}</b> <span class="lvl">×${c[t]}</span></div>
        <div class="muted">${C.rolls} tirada${C.rolls > 1 ? 's' : ''} de reliquia${C.guarantee ? ' (una al menos rara)' : ''} · oro · niveles gratis${C.crystals[0] >= 0.5 ? ' · cristales' : ''}</div></div>
        <div class="actions"><button class="btn buy ${c[t] ? 'can' : ''}" data-act="open" data-id="${t}" ${c[t] ? '' : 'disabled'}>Abrir</button></div>` });
    });
    rows.push({ key: 'openall', cls: 'seg', html: `<button class="btn primary" data-act="openall" ${total ? '' : 'disabled'}>Abrir todos (${total})</button>` });
    rows.push({ key: 'cnote', cls: 'credits', html: 'Caen de jefes, minijefes, enemigos dorados, goblins, misiones, logros, la recompensa diaria,<br>al volver de una ausencia larga y uno cada pocos minutos mientras juegas.' });
    return rows;
  }

  function relicRows(s) {
    const l = L.of(s);
    const distinct = GM.RELICS.filter((r) => l.relics[r.id]).length;
    const sets = Math.floor(distinct / CFG.setEvery);
    const rows = [{ key: 'rsum', cls: 'card', html: `<div class="ico">🏺</div><div class="grow"><div class="title"><b>Reliquias</b> <span class="lvl">${distinct}/${GM.RELICS.length}</span></div>
      <div class="muted">Cada una da un bonus permanente que sube de nivel con los repetidos. Cada ${CFG.setEvery} distintas: +${CFG.setBonus * 100}% de daño y oro (ahora +${Math.round(sets * CFG.setBonus * 100)}%).</div><div class="pbar"><i style="width:${(distinct / GM.RELICS.length) * 100}%"></i></div>
      <small class="muted">Tiradas desde la última legendaria: ${l.pity}/${CFG.pityLegend}</small></div>` }];
    const cards = GM.RELICS.slice().sort((a, b) => b.rar - a.rar).map((r) => {
      const lv = l.relics[r.id] || 0, rar = RAR[r.rar], max = GM.RELIC_MAX[r.rar];
      if (!lv) return `<div class="relic locked" style="--rc:${rar.color}"><div class="ri">${r.icon}</div><div class="rn">???</div><div class="rr">${rar.name}</div><div class="rf">Aún no la has encontrado</div></div>`;
      return `<div class="relic ${r.rar === 3 ? 'legend' : ''}" style="--rc:${rar.color}"><div class="rl">${lv}/${max}</div><div class="ri">${r.icon}</div><div class="rn">${UI.esc(r.name)}</div><div class="rr">${rar.name}</div><div class="rf">${GM.fxText(r.fx, lv)}</div></div>`;
    }).join('');
    rows.push({ key: 'relics', cls: 'relics', html: cards });
    return rows;
  }

  function bestiaryRows(s) {
    const tot = L.bestiaryTotal(s), maxT = GM.BESTIARY.length * CFG.bestiaryTiers.length;
    const rows = [{ key: 'bsum', cls: 'card', html: `<div class="ico">📚</div><div class="grow"><div class="title"><b>Bestiario</b> <span class="lvl">${tot}/${maxT}</span></div>
      <div class="muted">Cada hito de bajas (${CFG.bestiaryTiers.map(fmt).join(' / ')}) de cada enemigo da +${CFG.bestiaryDmg * 100}% de daño y cristales. Ahora: +${(tot * CFG.bestiaryDmg * 100).toFixed(1)}%.</div></div>` }];
    GM.BESTIARY.forEach((b) => {
      const k = s.kills[b.id] || 0, t = L.tierOf(k), next = CFG.bestiaryTiers[t];
      const prev = t > 0 ? CFG.bestiaryTiers[t - 1] : 0;
      const pips = CFG.bestiaryTiers.map((_, i) => `<i class="${i < t ? 'on' : ''}"></i>`).join('');
      rows.push({ key: 'b-' + b.id, cls: 'beast' + (k ? '' : ' unknown'), html: `<img class="px" src="${UI.portrait(b.sprite)}" alt=""><div class="grow"><b>${k ? UI.esc(b.name) : '???'}</b> <span class="muted">· ${fmt(k)} bajas</span>
        <div class="pips">${pips}</div>${next ? `<div class="pbar"><i style="width:${Math.min(100, ((k - prev) / (next - prev)) * 100)}%"></i></div><small class="muted">siguiente hito: ${fmt(next)}</small>` : '<small class="good">¡Todos los hitos!</small>'}</div>` });
    });
    return rows;
  }

  function achRows(s) {
    const n = Object.keys(s.ach).length;
    const rows = [{ key: 'asum', cls: 'sect', html: `🏆 <b>Logros</b> <small>${n}/${GM.ACHIEVEMENTS.length} · +${CFG.ach * 100}% daño y oro cada uno, y un cofre</small>` }];
    const list = GM.ACHIEVEMENTS.map((a) => {
      const v = GM.statValue(s, a.stat), done = !!s.ach[a.id];
      return { a: a, v: v, done: done, ratio: done ? 2 : Math.min(1, v / a.n) };
    }).sort((x, y) => (x.done - y.done) || (y.ratio - x.ratio));
    rows.push({ key: 'ach', cls: 'achgrid', html: list.map((x) => `<div class="ach ${x.done ? 'on done' : ''}">${x.done ? '🏆' : '🔒'} ${UI.esc(x.a.name)} <small class="muted">${x.done ? '' : fmt(Math.floor(x.v)) + '/' + fmt(x.a.n)}</small> ${x.a.reward === 'oro' ? '🟡' : x.a.reward === 'plata' ? '⚪' : '🟤'}</div>`).join('') });
    return rows;
  }

  /** Filas de la pestaña Botín. */
  UI.lootRows = function () {
    const s = S(), rows = [];
    L.ensureQuests(s);
    const claimable = L.of(s).quests.filter((q) => q.done).length + (L.dailyStatus(s).ready ? 1 : 0);
    const badge = { quests: claimable, chests: L.chestTotal(s), relics: 0, bestiary: 0, ach: 0 };
    rows.push({ key: 'subs', cls: 'subtabs', html: SUBS.map((x) => `<button class="chip ${UI.lootTab === x[0] ? 'on' : ''}" data-act="lootsub" data-id="${x[0]}">${x[1]}${badge[x[0]] ? `<span class="n">${badge[x[0]]}</span>` : ''}</button>`).join('') });
    const body = UI.lootTab === 'chests' ? chestRows(s) : UI.lootTab === 'relics' ? relicRows(s) : UI.lootTab === 'bestiary' ? bestiaryRows(s) : UI.lootTab === 'ach' ? achRows(s) : questRows(s);
    return rows.concat(body);
  };

  /** Acciones de la pestaña Botín. @returns {boolean} true si la acción era suya. */
  UI.lootAction = function (act, ds) {
    const s = S();
    switch (act) {
      case 'lootsub': UI.lootTab = ds.id; GM.Audio.play('click'); return true;
      case 'daily': claimDaily(); return true;
      case 'qclaim': {
        const t = L.claimQuest(s, Number(ds.i));
        if (t) { GM.Audio.play('quest'); UI.toast(`🎁 +1 <b>${CHEST_NAME[t]}</b> en tu inventario`, 'good'); }
        return true;
      }
      case 'open': { const r = L.open(s, ds.id); if (r) UI.revealChests([r]); else GM.Audio.play('deny'); return true; }
      case 'openall': { const rs = L.openAll(s); if (rs.length) UI.revealChests(rs, `Botín: ${rs.length} cofres`); else GM.Audio.play('deny'); return true; }
      case 'perks': perkModal(ds.id); GM.Audio.play('click'); return true;
      default: return false;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
