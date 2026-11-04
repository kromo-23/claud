/**
 * Interfaz: barra de recursos, panel de batalla, pestañas (Héroes, Ciudad, Ascenso, Más),
 * ventanas emergentes e historia. Solo navegador.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const UI = GM.UI = { tab: 'heroes', paused: false };
  let S = null;                 // estado de la partida
  let host = null;              // callbacks del arranque (guardar, reiniciar...)
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const fmt = GM.fmt;

  const iconCache = {};
  function portrait(name) {
    return iconCache[name] || (iconCache[name] = GM.spriteCanvas(name).toDataURL());
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------ sincronizar filas */

  /** Actualiza una lista de filas {key, html, cls} sin recrear las que no cambian. */
  function sync(container, rows) {
    const old = new Map();
    Array.from(container.children).forEach((ch) => old.set(ch.dataset.key, ch));
    let prev = null;
    rows.forEach((r) => {
      let el = old.get(r.key);
      if (!el) {
        el = document.createElement('div');
        el.dataset.key = r.key;
      } else old.delete(r.key);
      const wantPrev = prev ? prev.nextSibling : container.firstChild;
      if (el !== wantPrev) container.insertBefore(el, wantPrev);
      if (el._h !== r.html) { el.innerHTML = r.html; el._h = r.html; }
      const cn = r.cls || '';
      if (el.className !== cn) el.className = cn;
      prev = el;
    });
    old.forEach((el) => el.remove());
  }

  /* ---------------------------------------------------------------------- toasts */

  /** Muestra un aviso breve. */
  const toastByKey = {};
  UI.toast = function (html, cls, key) {
    const box = $('#toasts');
    if (!box) return;
    // Un aviso con la misma clave se renueva en vez de apilarse.
    let t = key ? toastByKey[key] : null;
    if (t && t.isConnected) {
      clearTimeout(t._t1); clearTimeout(t._t2);
      t.classList.remove('out'); t.innerHTML = html;
    } else {
      t = document.createElement('div');
      t.className = 'toast ' + (cls || '');
      t.innerHTML = html;
      box.appendChild(t);
      if (key) toastByKey[key] = t;
    }
    while (box.children.length > 3) box.firstChild.remove();
    t._t1 = setTimeout(() => t.classList.add('out'), 3200);
    t._t2 = setTimeout(() => { t.remove(); if (key && toastByKey[key] === t) delete toastByKey[key]; }, 3700);
  };

  /** Texto flotante sobre el escenario (coordenadas lógicas de la escena). */
  UI.float = function (x, y, text, cls) {
    const fx = $('#fx');
    if (!fx || fx.children.length > 26) return;
    const p = GM.Scene.pct(x, y);
    const d = document.createElement('div');
    d.className = 'float ' + (cls || '');
    d.style.left = p.x + '%'; d.style.top = p.y + '%';
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  };

  /* ---------------------------------------------------------------------- modales */

  const modalQueue = [];
  let modalOpen = null;

  /**
   * Abre una ventana emergente (se encolan si hay otra abierta).
   * @param {{title:string, html:string, buttons?:Array<{label:string, cls?:string, value?:any}>, wide?:boolean, onOpen?:Function}} o
   * @returns {Promise<any>} se resuelve con el `value` del botón pulsado.
   */
  UI.modal = function (o) {
    return new Promise((resolve) => {
      modalQueue.push({ o: o, resolve: resolve });
      if (!modalOpen) nextModal();
    });
  };

  function nextModal() {
    const item = modalQueue.shift();
    if (!item) { modalOpen = null; UI.paused = false; $('#modal-root').innerHTML = ''; return; }
    modalOpen = item; UI.paused = true;
    const o = item.o;
    const btns = (o.buttons || [{ label: 'Vale', cls: 'primary', value: true }]).map((b, i) =>
      `<button class="btn ${b.cls || ''}" data-mi="${i}">${b.label}</button>`).join('');
    $('#modal-root').innerHTML = `<div class="overlay"><div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      ${o.title ? `<h2>${o.title}</h2>` : ''}<div class="mbody">${o.html}</div><div class="mbtns">${btns}</div></div></div>`;
    const m = $('#modal-root .modal');
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mi]');
      if (!b) return;
      const val = (o.buttons || [{ value: true }])[Number(b.dataset.mi)].value;
      if (o.onClose && o.onClose(val, m) === false) return;
      item.resolve(val);
      nextModal();
    });
    if (o.onOpen) o.onOpen(m);
    GM.Audio.play('click');
  }

  /** Muestra una página de historia. */
  UI.story = function (title, text, opts) {
    return UI.modal({ title: `<span class="story-t">${title}</span>`, html: `<p class="story">${text}</p>`,
      buttons: [{ label: (opts && opts.btn) || 'Continuar', cls: 'primary', value: true }] });
  };

  /* ------------------------------------------------------------------- construcción */

  /**
   * Arranca la interfaz.
   * @param {object} state Estado de la partida.
   * @param {{save:Function, reset:Function, replace:Function}} hostApi Funciones del arranque.
   */
  UI.init = function (state, hostApi) {
    S = state; host = hostApi;
    GM.Scene.init($('#cv'));
    GM.Scene.onFloat = UI.float;

    // Pestañas.
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) UI.setTab(b.dataset.tab);
    });
    // Acciones del panel (delegación).
    $('#tab-body').addEventListener('click', onPanelClick);
    $('#abilities').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cast]');
      if (b) { GM.Audio.unlock(); if (!GM.cast(S, b.dataset.cast)) GM.Audio.play('deny'); }
    });
    $('#controls').addEventListener('click', onControlClick);
    // Toques en el escenario.
    $('#stage').addEventListener('pointerdown', (e) => {
      GM.Audio.unlock();
      if (UI.paused) return;
      const dmg = GM.tap(S);
      if (dmg > 0) {
        GM.Audio.play('tap');
        const r = $('#stage').getBoundingClientRect();
        const lx = ((e.clientX - r.left) / r.width) * GM.Scene.size.w, ly = ((e.clientY - r.top) / r.height) * GM.Scene.size.h;
        UI.float(lx, ly - 6, fmt(dmg), 'tap');
      }
    });
    document.addEventListener('pointerdown', () => GM.Audio.unlock(), { once: true });
    root.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installPrompt = e; });
    root.addEventListener('appinstalled', () => { UI.installPrompt = null; UI.toast('📲 ¡App instalada!', 'good'); });
    UI.setTab(UI.tab);
    UI.refresh(true);
  };

  /** Sustituye el estado (al importar una partida o reiniciar). */
  UI.setState = function (state) { S = state; UI.refresh(true); };

  UI.setTab = function (tab) {
    UI.tab = tab;
    $$('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#tab-body');
    body.innerHTML = '';
    body.dataset.tab = tab;
    $('#panel').scrollTop = 0;
    UI.refresh(true);
  };

  /* -------------------------------------------------------------------- acciones */

  function onControlClick(e) {
    const b = e.target.closest('[data-ctl]');
    if (!b) return;
    GM.Audio.unlock();
    const r = S.run;
    switch (b.dataset.ctl) {
      case 'down':
        if (GM.setFloor(S, r.floor - 1)) UI.toast('Avance automático <b>desactivado</b>: farmeas este piso.', 'info');
        break;
      case 'up':
        if (r.floor < r.maxFloor) GM.setFloor(S, r.floor + 1);
        break;
      case 'auto':
        S.flags.auto = !S.flags.auto;
        if (S.flags.auto && r.floor < Math.min(r.maxFloor, GM.floorCap(S))) { /* sigue avanzando desde donde está */ }
        r.mode = 'push'; r.farmLeft = 0; r.wipePower = 0;
        break;
      case 'speed': {
        const opts = [1];
        if (S.research.turbo2) opts.push(2);
        if (S.research.turbo3) opts.push(3);
        const i = opts.indexOf(S.flags.speed);
        S.flags.speed = opts[(i + 1) % opts.length];
        break;
      }
      case 'autocast':
        S.flags.autoCast = !S.flags.autoCast;
        break;
      default:
    }
    UI.refresh(true);
  }

  function onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    GM.Audio.unlock();
    const act = b.dataset.act, id = b.dataset.id, i = Number(b.dataset.i);
    let ok = true, sound = 'buy';
    switch (act) {
      case 'buyn': S.flags.buyN = b.dataset.n === 'max' ? 'max' : Number(b.dataset.n); sound = 'click'; break;
      case 'lvl': ok = GM.buyLevels(S, id, S.flags.buyN) > 0; break;
      case 'hire': ok = GM.buyLevels(S, id, 1) > 0; if (ok) { sound = 'unlock'; UI.toast(`<b>${GM.HERO_BY_ID[id].name}</b> se une al gremio. ${GM.HERO_BY_ID[id].quote}`, 'good'); } break;
      case 'party': pickSlot(id); sound = 'click'; break;
      case 'slot': pickHeroForSlot(i); sound = 'click'; break;
      case 'gear': ok = GM.buyGear(S, i); break;
      case 'bld': ok = GM.buyBld(S, id); break;
      case 'slotbuy': ok = GM.buySlot(S); break;
      case 'research': ok = GM.buyResearch(S, id); if (ok) sound = 'unlock'; break;
      case 'talent': ok = GM.buyTalent(S, id); break;
      case 'ascend': confirmAscend(); sound = 'click'; break;
      case 'mute': S.flags.muted = !S.flags.muted; GM.Audio.set(S.flags.muted, S.flags.vol); sound = 'click'; break;
      case 'export': exportSave(); sound = 'click'; break;
      case 'import': importSave(); sound = 'click'; break;
      case 'savenow': host.save(true); UI.toast('Partida guardada.', 'good'); sound = 'click'; break;
      case 'wipe': resetGame(); sound = 'click'; break;
      case 'cloud': host.cloud(id); sound = 'click'; break;
      case 'share': shareGame(); sound = 'click'; break;
      case 'install': installApp(); sound = 'click'; break;
      default: sound = 'click';
    }
    GM.Audio.play(ok ? sound : 'deny');
    if (act === 'lvl' && ok) S.flags.hintDone = true;
    GM.checkAchievements(S);
    UI.refresh(true);
  }

  function pickSlot(id) {
    const free = S.party.findIndex((x, i) => !x && i < S.slots);
    if (S.party.indexOf(id) >= 0) { if (!GM.setParty(S, S.party.indexOf(id), null)) UI.toast('El equipo no puede quedarse vacío.', 'warn'); return; }
    if (free >= 0) { GM.setParty(S, free, id); return; }
    // Equipo completo: elegir a quién sustituir.
    const slots = S.party.slice(0, S.slots).map((pid, i) =>
      `<button class="btn pick" data-mi="${i}"><img class="px" src="${portrait(pid)}"> ${GM.HERO_BY_ID[pid].name}</button>`).join('');
    UI.modal({ title: '¿A quién sustituyes?', html: `<div class="picks">${slots}</div>`,
      buttons: [{ label: 'Cancelar', value: -1 }] });
    // Los botones del cuerpo reutilizan data-mi: los gestionamos aparte.
    const m = $('#modal-root .modal');
    if (!m) return;
    $$('.picks [data-mi]', m).forEach((btn) => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      GM.setParty(S, Number(btn.dataset.mi), id);
      modalOpen.resolve(true); nextModal(); UI.refresh(true);
    }));
  }

  function pickHeroForSlot(i) {
    if (i >= S.slots) { UI.toast('Amplía el equipo en la Ciudad → Barracones.', 'info'); return; }
    const opts = GM.HEROES.filter((h) => S.heroes[h.id].lvl > 0 && S.party.indexOf(h.id) !== i)
      .map((h) => `<button class="btn pick" data-hero="${h.id}"><img class="px" src="${portrait(h.id)}"> ${h.name} <small>${h.role}</small></button>`);
    if (S.party[i]) opts.push('<button class="btn pick" data-hero="">✖ Quitar del equipo</button>');
    UI.modal({ title: 'Hueco ' + (i + 1), html: `<div class="picks">${opts.join('') || '<p class="muted">No tienes más héroes contratados.</p>'}</div>`,
      buttons: [{ label: 'Cerrar', value: -1 }] });
    const m = $('#modal-root .modal');
    if (!m) return;
    $$('.picks [data-hero]', m).forEach((btn) => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const hid = btn.dataset.hero || null;
      if (!GM.setParty(S, i, hid)) UI.toast('El equipo no puede quedarse vacío.', 'warn');
      modalOpen.resolve(true); nextModal(); UI.refresh(true);
    }));
  }

  function confirmAscend() {
    const gain = GM.starGain(S);
    const next = GM.RANKS[Math.min(5, S.run.rank + 1)];
    UI.modal({ title: '⭐ Ascenso de Rango', wide: true,
      html: `<p>El gremio sube a <b>${next.name}</b> (rango ${next.id}) y abre ${S.run.rank < 4 ? '20 pisos más' : 'la Torre Infinita'}.</p>
        <p class="good">Ganas <b>${gain} ⭐</b> para talentos permanentes.</p>
        <div class="two"><div><b>Se reinicia</b><ul><li>Oro y hierro</li><li>Niveles de los héroes</li><li>Herrería y edificios</li><li>El recorrido vuelve al piso 1</li></ul></div>
        <div><b>Se conserva</b><ul><li>Estrellas y talentos</li><li>Héroes contratados</li><li>Huecos del equipo</li><li>Investigaciones y 💎</li><li>Logros y estadísticas</li></ul></div></div>`,
      buttons: [{ label: 'Todavía no', value: false }, { label: 'Ascender', cls: 'primary', value: true }] })
      .then((v) => {
        if (!v) return;
        GM.ascend(S);
        host.save(true);
        UI.setTab('ascend');
      });
  }

  /** Estamos dentro de una página de claude.ai (allí no hay descargas ni enlaces propios). */
  const inClaude = () => !!(root.claude && typeof root.claude.use === 'function');
  /** Página web normal (https/http) fuera de claude.ai: se pueden descargar archivos y compartir el enlace. */
  const onWeb = () => !inClaude() && /^https?:$/.test(root.location.protocol);

  /** Copia texto al portapapeles (con alternativa para navegadores que lo impiden). @returns {Promise<boolean>} */
  function copyText(text, fallbackEl) {
    const fallback = () => {
      try {
        if (fallbackEl) fallbackEl.select();
        return document.execCommand('copy');
      } catch (e) { return false; }
    };
    try {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    } catch (e) { return Promise.resolve(fallback()); }
  }

  /** Descarga un texto como archivo. */
  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Enlace que abre el juego con esta partida (solo en la web normal). */
  UI.saveLink = function (code) {
    return root.location.origin + root.location.pathname + root.location.search + '#save=' + encodeURIComponent(code);
  };

  function exportSave() {
    const code = GM.exportSave(S);
    const web = onWeb();
    const buttons = [{ label: 'Copiar código', cls: 'primary', value: 'copy' }];
    if (!inClaude()) buttons.push({ label: 'Descargar archivo', value: 'file' });
    if (web) buttons.push({ label: 'Copiar enlace', value: 'link' });
    buttons.push({ label: 'Cerrar', value: false });
    UI.modal({ title: 'Exportar partida', wide: true,
      html: `<p>Lleva tu partida a otro dispositivo (o guárdala como copia de seguridad):</p>
        <ul class="tight"><li><b>Código</b>: cópialo y pégalo en <i>Más → Importar</i>.</li>
        ${inClaude() ? '' : '<li><b>Archivo</b>: se descarga un .txt que puedes importar luego.</li>'}
        ${web ? '<li><b>Enlace</b>: ábrelo en el otro dispositivo y se carga tu partida. Quien tenga el enlace puede cargarla, así que no lo publiques.</li>' : ''}</ul>
        <textarea id="exp" readonly rows="4">${code}</textarea>`,
      buttons: buttons,
      onClose: (v, m) => {
        if (v === 'copy') {
          copyText(code, $('#exp', m)).then((ok) => UI.toast(ok ? 'Código copiado.' : 'Selecciona el texto y cópialo a mano.', ok ? 'good' : 'warn'));
          return false;
        }
        if (v === 'file') {
          const d = new Date();
          downloadText(`gremio-partida-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`, code);
          UI.toast('Archivo descargado.', 'good');
          return false;
        }
        if (v === 'link') {
          copyText(UI.saveLink(code)).then((ok) => UI.toast(ok ? 'Enlace copiado.' : 'No se pudo copiar el enlace.', ok ? 'good' : 'warn'));
          return false;
        }
        return true;
      } });
  }

  function importSave() {
    UI.modal({ title: 'Importar partida', wide: true,
      html: `<p>Pega aquí tu código o elige un archivo. <b>Sustituirá la partida actual.</b></p>
        <textarea id="imp" rows="5" placeholder="Pega el código..."></textarea>
        ${inClaude() ? '' : '<p><button class="btn small" id="impbtn" type="button">Elegir archivo…</button><input type="file" id="impfile" accept=".txt,.json,text/plain,application/json" hidden></p>'}
        <p id="imp-err" class="bad"></p>`,
      buttons: [{ label: 'Cancelar', value: false }, { label: 'Importar', cls: 'primary', value: 'ok' }],
      onOpen: (m) => {
        const btn = $('#impbtn', m), file = $('#impfile', m);
        if (!btn || !file) return;
        btn.addEventListener('click', () => file.click());
        file.addEventListener('change', () => {
          const f = file.files && file.files[0];
          if (!f) return;
          if (f.size > 400000) { $('#imp-err', m).textContent = 'Ese archivo es demasiado grande.'; return; }
          const rd = new FileReader();
          rd.onload = () => { $('#imp', m).value = String(rd.result || '').trim(); $('#imp-err', m).textContent = ''; };
          rd.readAsText(f);
        });
      },
      onClose: (v, m) => {
        if (v !== 'ok') return true;
        try {
          const ns = GM.importSave($('#imp', m).value);
          host.replace(ns);
          UI.toast('Partida importada.', 'good');
          return true;
        } catch (e) {
          $('#imp-err', m).textContent = 'Ese código no es válido.';
          return false;
        }
      } });
  }

  /** Invita a un amigo: abre el menú de compartir del móvil o copia el enlace del juego. */
  function shareGame() {
    const url = root.location.origin + root.location.pathname;
    const data = { title: 'Gremio de Mala Muerte', text: 'Juega gratis a este incremental de rol con humor. Cada persona tiene su propia partida:', url: url };
    if (navigator.share) {
      navigator.share(data).catch(() => { /* el jugador canceló */ });
    } else {
      copyText(url).then((ok) => UI.toast(ok ? '📣 Enlace copiado. ¡Pásaselo a tus amigos!' : 'Copia la dirección de la barra del navegador.', ok ? 'good' : 'warn'));
    }
  }

  function resetGame() {
    UI.modal({ title: '⚠️ Borrar partida', html: '<p>Se perderá <b>todo</b> el progreso. Esto no se puede deshacer.<br>Si no estás seguro, exporta antes tu partida.</p>',
      buttons: [{ label: 'Cancelar', value: false }, { label: 'Borrar todo', cls: 'danger', value: true }] })
      .then((v) => { if (v) host.reset(); });
  }

  /* ------------------------------------------------------------------- pestañas */

  function btn(act, attrs, label, can, extra) {
    return `<button class="btn buy ${can ? 'can' : ''} ${extra || ''}" data-act="${act}" ${attrs || ''}>${label}</button>`;
  }
  const costLabel = (g, iron) => `<small>🪙 ${fmt(g)}${iron !== undefined ? ' · ⛏️ ' + fmt(iron) : ''}</small>`;

  function heroRows() {
    const rows = [];
    const D = GM.D(S);
    const n = S.flags.buyN;
    rows.push({ key: 'buyn', cls: 'seg', html: '<span class="seglabel">Subir</span>' + [1, 10, 100, 'max'].map((v) =>
      `<button class="chip ${n === v ? 'on' : ''}" data-act="buyn" data-n="${v}">${v === 'max' ? 'Máx' : '×' + v}</button>`).join('') });
    // Equipo.
    let slots = '';
    for (let i = 0; i < 4; i++) {
      const id = S.party[i];
      if (i >= S.slots) slots += `<button class="slot locked" data-act="slot" data-i="${i}"><span>🔒</span><small>Barracones</small></button>`;
      else if (id) slots += `<button class="slot full" data-act="slot" data-i="${i}"><img class="px" src="${portrait(id)}"><small>${GM.HERO_BY_ID[id].name}</small></button>`;
      else slots += `<button class="slot" data-act="slot" data-i="${i}"><span>＋</span><small>Libre</small></button>`;
    }
    const tank = GM.tankId(S);
    const cap = tank ? `🛡️ Recibe los golpes: <b>${GM.HERO_BY_ID[tank].name}</b> (el de más aggro). El veneno daña a todos.` : '';
    rows.push({ key: 'party', cls: 'party', html: `<div class="slots">${slots}</div>${cap ? `<div class="tankcap">${cap}</div>` : ''}` });
    if (!S.flags.hintDone) {
      rows.push({ key: 'hint', cls: 'hint', html: '👆 <b>Toca al enemigo</b> para golpearlo y <b>sube de nivel</b> a tus héroes con el oro. ¡Los héroes pelean solos!' });
    }
    GM.HEROES.forEach((h) => {
      const hs = S.heroes[h.id];
      const img = `<img class="px" src="${portrait(h.id)}" alt="">`;
      if (hs.lvl === 0) {
        if (!GM.canHire(S, h.id)) {
          rows.push({ key: 'h-' + h.id, cls: 'card hero locked', html: `${img}<div class="grow"><div class="title"><b>${h.name}</b> <span class="tag">${h.cls}</span></div><div class="muted">🔒 Aparece en la Taberna al llegar al piso ${h.hireFloor}</div></div>` });
        } else {
          const can = S.res.gold >= h.hireCost;
          rows.push({ key: 'h-' + h.id, cls: 'card hero', html: `${img}<div class="grow"><div class="title"><b>${h.name}</b> <span class="tag">${h.cls} · ${h.role}</span></div>
            <div class="muted">${h.quote}</div><div class="ability">✨ <b>${h.ability.name}</b>: ${h.ability.desc}</div></div>
            <div class="actions">${btn('hire', `data-id="${h.id}"`, 'Contratar<br>' + costLabel(h.hireCost), can)}</div>` });
        }
        return;
      }
      const d = D.hero[h.id];
      const inP = S.party.indexOf(h.id) >= 0;
      let k = n === 'max' ? GM.maxLevels(S, h.id) : n;
      const label = n === 'max' ? (k > 0 ? 'Subir ×' + k : 'Subir') : 'Subir ×' + n;
      const c = GM.levelCost(S, h.id, Math.max(1, k));
      const can = n === 'max' ? k > 0 : S.res.gold >= c;
      const ms = GM.nextMilestone(hs.lvl);
      const type = h.type === 'phys' ? '⚔️ físico' : '✨ mágico';
      rows.push({ key: 'h-' + h.id, cls: 'card hero' + (inP ? ' inparty' : ''), html: `${img}<div class="grow">
        <div class="title"><b>${h.name}</b> <span class="tag">${h.cls} · ${h.role}</span> <span class="lvl">Nv ${hs.lvl}</span></div>
        <div class="stats"><span>${type}</span><span>💥 ${fmt(d.dps * D.aura)}/s</span><span>❤️ ${fmt(d.hpMax)}</span>${h.heal ? `<span>💚 ${fmt(d.hps)}/s</span>` : ''}</div>
        <div class="ability">✨ <b>${h.ability.name}</b>: ${h.ability.desc}</div>
        <div class="mile">${ms ? `Hito en nivel ${ms}: ×${GM.CFG.msMult} poder` : 'Todos los hitos conseguidos'}</div></div>
        <div class="actions">${btn('lvl', `data-id="${h.id}"`, label + '<br>' + costLabel(c), can)}
        <button class="btn small" data-act="party" data-id="${h.id}">${inP ? 'Quitar' : 'Equipar'}</button></div>` });
    });
    return rows;
  }

  function cityRows() {
    const rows = [];
    // Herrería.
    rows.push({ key: 'h-forge', cls: 'sect', html: '🔨 <b>Herrería</b> <small>Mejoras para todo el equipo</small>' });
    GM.GEAR.forEach((g, line) => {
      const t = S.gear[line], c = GM.gearCost(S, line);
      const name = (i) => `${g.base} ${GM.GEAR_MATERIALS[Math.min(i, GM.GEAR_MATERIALS.length - 1)]}`;
      const m = GM.CFG.gearMult[line];
      const can = c && S.res.gold >= c.gold && S.res.iron >= c.iron;
      rows.push({ key: 'g' + line, cls: 'card', html: `<div class="ico">${g.icon}</div><div class="grow"><div class="title"><b>${name(t)}</b> <span class="lvl">Nv ${t}</span></div>
        <div class="stats"><span>${g.stat}: ×${fmt(Math.pow(m, t), 2)}</span>${c ? `<span>siguiente: ${name(t + 1)} (×${fmt(Math.pow(m, t + 1), 2)})</span>` : ''}</div></div>
        <div class="actions">${c ? btn('gear', `data-i="${line}"`, 'Forjar<br>' + costLabel(c.gold, c.iron), can) : '<span class="tag">Máximo</span>'}</div>` });
    });
    // Barracones.
    if (S.slots < 4) {
      const c = GM.SLOTS[S.slots - 1];
      rows.push({ key: 'h-bar', cls: 'sect', html: '⛺ <b>Barracones</b>' });
      rows.push({ key: 'slot', cls: 'card', html: `<div class="ico">👥</div><div class="grow"><div class="title"><b>${c.name} del equipo</b></div><div class="stats"><span>Luchan ${S.slots + 1} héroes a la vez (se conserva al ascender)</span></div></div>
        <div class="actions">${btn('slotbuy', '', 'Ampliar<br>' + costLabel(c.gold), S.res.gold >= c.gold)}</div>` });
    }
    // Edificios.
    rows.push({ key: 'h-bld', cls: 'sect', html: '🏘️ <b>Edificios</b>' });
    GM.BUILDINGS.forEach((b) => {
      const l = S.bld[b.id];
      if (!GM.bldUnlocked(S, b.id)) {
        rows.push({ key: 'b-' + b.id, cls: 'card locked', html: `<div class="ico">${b.icon}</div><div class="grow"><b>${b.name}</b><div class="muted">🔒 Se desbloquea al llegar al piso ${b.unlock}</div></div>` });
        return;
      }
      const c = GM.bldCost(S, b.id);
      rows.push({ key: 'b-' + b.id, cls: 'card', html: `<div class="ico">${b.icon}</div><div class="grow"><div class="title"><b>${b.name}</b> <span class="lvl">Nv ${l}</span></div>
        <div class="muted">${b.desc}</div><div class="stats"><span>Ahora: ${l ? b.effect(l) : '—'}</span>${c !== null ? `<span>Siguiente: ${b.effect(l + 1)}</span>` : ''}</div></div>
        <div class="actions">${c !== null ? btn('bld', `data-id="${b.id}"`, 'Mejorar<br>' + costLabel(c), S.res.gold >= c) : '<span class="tag">Máximo</span>'}</div>` });
    });
    // Biblioteca.
    rows.push({ key: 'h-lib', cls: 'sect', html: '📚 <b>Biblioteca</b> <small>Investigaciones permanentes (💎)</small>' });
    GM.RESEARCH.forEach((r) => {
      const done = S.research[r.id];
      const locked = S.stats.maxFloor < r.unlock;
      if (locked) rows.push({ key: 'r-' + r.id, cls: 'card locked', html: `<div class="ico">${r.icon}</div><div class="grow"><b>${r.name}</b><div class="muted">🔒 Piso ${r.unlock}</div></div>` });
      else rows.push({ key: 'r-' + r.id, cls: 'card' + (done ? ' done' : ''), html: `<div class="ico">${r.icon}</div><div class="grow"><div class="title"><b>${r.name}</b></div><div class="muted">${r.desc}</div></div>
        <div class="actions">${done ? '<span class="tag ok">✔ Hecho</span>' : btn('research', `data-id="${r.id}"`, 'Investigar<br><small>💎 ' + r.cost + '</small>', S.res.crystals >= r.cost)}</div>` });
    });
    return rows;
  }

  function ascendRows() {
    const rows = [];
    const r = S.run, rank = GM.RANKS[r.rank];
    const cap = GM.floorCap(S);
    const boss = GM.BOSSES[Math.min(4, Math.ceil(Math.min(cap, 100) / 20) - 1)];
    const can = GM.canAscend(S);
    const capTxt = cap === Infinity ? '∞' : cap;
    rows.push({ key: 'rank', cls: 'card rank', html: `<div class="ico big">🏰</div><div class="grow"><div class="title"><b>Rango ${rank.id}: ${rank.name}</b></div>
      <div class="muted">Pisos disponibles: 1 – ${capTxt}. ${can ? '¡Has derrotado al jefe de esta zona!' : r.rank < 4 || !S.flags.ending ? `Derrota a <b>${boss.name}</b> en el piso ${cap === Infinity ? 100 : cap} para ascender.` : ''}</div>
      <div class="stats"><span>Ascensos: ${S.stats.ascents}</span><span>Ganarías ⭐ ${GM.starGain(S)}</span></div></div>
      <div class="actions">${btn('ascend', '', can ? 'Ascender<br><small>¡Listo!</small>' : 'Ascender<br><small>Bloqueado</small>', can, can ? 'pulse' : 'off')}</div>` });
    rows.push({ key: 'stars', cls: 'sect', html: `⭐ <b>Talentos</b> <small>Tienes <b>${S.res.stars}</b> ⭐ — son permanentes</small>` });
    let group = '';
    GM.TALENTS.forEach((t) => {
      if (t.group !== group) { group = t.group; rows.push({ key: 'tg-' + group, cls: 'subsect', html: group }); }
      const l = S.talents[t.id] || 0, c = GM.talentCost(S, t.id);
      rows.push({ key: 't-' + t.id, cls: 'card', html: `<div class="ico">${t.icon}</div><div class="grow"><div class="title"><b>${t.name}</b> <span class="lvl">${l}/${t.max}</span></div><div class="muted">${t.desc}</div></div>
        <div class="actions">${c !== null ? btn('talent', `data-id="${t.id}"`, '+1<br><small>⭐ ' + c + '</small>', S.res.stars >= c) : '<span class="tag">Máx.</span>'}</div>` });
    });
    rows.push({ key: 'zones', cls: 'sect', html: '🗺️ <b>Zonas de la mazmorra</b>' });
    GM.ZONES.forEach((z) => {
      const zi = z.id, cur = GM.zoneIndex(r.floor) === zi;
      const seen = S.stats.maxFloor > zi * 20;
      rows.push({ key: 'z' + zi, cls: 'card' + (cur ? ' cur' : '') + (seen ? '' : ' locked'), html: `<div class="ico">${['🕳️', '🌲', '⚰️', '🌋', '🗼'][zi]}</div><div class="grow"><div class="title"><b>${z.name}</b> <span class="tag">pisos ${zi * 20 + 1}-${zi * 20 + 20}</span></div>
        <div class="muted">${seen ? z.tip : '???'}</div></div>` });
    });
    return rows;
  }

  /** Instalación como app: botón si el navegador la ofrece, instrucciones si no. */
  function installRow() {
    const can = !!UI.installPrompt;
    const text = can ? 'Añádelo a tu pantalla de inicio y juega como una app, también sin conexión.'
      : 'En el móvil: menú del navegador → «Añadir a pantalla de inicio». En el PC: icono de instalar en la barra de direcciones.';
    return { key: 'install', cls: 'card', html: `<div class="ico">📲</div><div class="grow"><b>Instalar como app</b><div class="muted">${text}</div></div>${can ? '<div class="actions"><button class="btn small" data-act="install">Instalar</button></div>' : ''}` };
  }
  function installApp() {
    const ev = UI.installPrompt;
    if (!ev) return;
    UI.installPrompt = null;
    try { ev.prompt(); } catch (e) { /* nada */ }
  }

  /** Fila de estado de la nube (Más → Partida en la nube). */
  function cloudRow() {
    const C = GM.Cloud;
    let text, buttons = '';
    if (C.status === 'on') {
      text = `Guardada en tu cuenta de claude.ai${C.lastPushAt ? ' · ' + C.ago(C.lastPushAt) : ''}. Abre el mismo enlace en otro dispositivo para seguir donde lo dejaste.`;
      buttons = '<button class="btn small" data-act="cloud" data-id="up">Subir ahora</button><button class="btn small" data-act="cloud" data-id="down">Cargar</button>';
    } else if (C.status === 'connecting') {
      text = 'Conectando con tu cuenta...';
    } else if (C.status === 'error') {
      text = 'No se pudo conectar con la nube. Tu partida sigue guardada en este dispositivo.';
      buttons = '<button class="btn small" data-act="cloud" data-id="retry">Reintentar</button>';
    } else {
      text = 'Solo en este dispositivo. Para llevar tu partida a cualquier sitio, abre el juego desde su enlace de claude.ai con tu sesión iniciada, o usa Exportar/Importar.';
    }
    const ico = C.status === 'on' ? '☁️' : C.status === 'error' ? '⚠️' : '📴';
    return { key: 'cloud', cls: 'card', html: `<div class="ico">${ico}</div><div class="grow"><b>Partida en la nube</b><div class="muted">${text}</div></div>${buttons ? `<div class="actions">${buttons}</div>` : ''}` };
  }

  function moreRows() {
    const rows = [];
    const st = S.stats;
    rows.push({ key: 'h-set', cls: 'sect', html: '⚙️ <b>Ajustes</b>' });
    rows.push({ key: 'sound', cls: 'card', html: `<div class="ico">${S.flags.muted ? '🔇' : '🔊'}</div><div class="grow"><b>Sonido</b><div class="vol"><input type="range" min="0" max="100" value="${Math.round(S.flags.vol * 100)}" id="vol" aria-label="Volumen"></div></div>
      <div class="actions"><button class="btn small" data-act="mute">${S.flags.muted ? 'Activar' : 'Silenciar'}</button></div>` });
    rows.push({ key: 'save', cls: 'card', html: `<div class="ico">💾</div><div class="grow"><b>Partida</b><div class="muted">Se guarda sola cada pocos segundos en este navegador.</div></div>
      <div class="actions"><button class="btn small" data-act="savenow">Guardar</button><button class="btn small" data-act="export">Exportar</button><button class="btn small" data-act="import">Importar</button></div>` });
    rows.push(cloudRow());
    if (onWeb()) {
      rows.push({ key: 'share', cls: 'card', html: `<div class="ico">📣</div><div class="grow"><b>Invitar a un amigo</b><div class="muted">Es gratis y sin cuenta. Cada persona juega su propia partida, que se guarda en su navegador.</div></div><div class="actions"><button class="btn small" data-act="share">Compartir</button></div>` });
      rows.push(installRow());
    }
    rows.push({ key: 'h-stat', cls: 'sect', html: '📊 <b>Estadísticas</b>' });
    const lines = [
      ['Tiempo jugado', GM.fmtTime(S.t.played)], ['Piso máximo', st.maxFloor], ['Ascensos', st.ascents], ['Enemigos derrotados', fmt(st.kills)],
      ['Jefes derrotados', fmt(st.bossKills)], ['Enemigos dorados', fmt(st.golden)], ['Toques', fmt(st.taps)], ['Habilidades lanzadas', fmt(st.casts)],
      ['Derrotas del equipo', fmt(st.wipes)], ['Oro total', fmt(st.goldTotal)],
    ];
    rows.push({ key: 'stats', cls: 'statgrid', html: lines.map((l) => `<div><span>${l[0]}</span><b>${l[1]}</b></div>`).join('') });
    const n = Object.keys(S.ach).length;
    rows.push({ key: 'h-ach', cls: 'sect', html: `🏆 <b>Logros</b> <small>${n}/${GM.ACHIEVEMENTS.length} — cada uno da +2% de daño y oro</small>` });
    rows.push({ key: 'ach', cls: 'achgrid', html: GM.ACHIEVEMENTS.map((a) => `<div class="ach ${S.ach[a.id] ? 'on' : ''}">${S.ach[a.id] ? '🏆' : '🔒'} ${a.name}</div>`).join('') });
    rows.push({ key: 'h-danger', cls: 'sect', html: '☠️ <b>Zona peligrosa</b>' });
    rows.push({ key: 'wipe', cls: 'card', html: '<div class="grow"><b>Empezar de cero</b><div class="muted">Borra la partida guardada.</div></div><div class="actions"><button class="btn small danger" data-act="wipe">Borrar</button></div>' });
    rows.push({ key: 'credits', cls: 'credits', html: 'Gremio de Mala Muerte · hecho con Claude Code<br>Pixel art generado por código · sin anuncios ni compras' });
    return rows;
  }

  /* -------------------------------------------------------------------- refresco */

  let dotT = 0;
  function dots() {
    const g = S.res.gold;
    let heroes = false;
    for (const h of GM.HEROES) {
      const hs = S.heroes[h.id];
      if (hs.lvl === 0) { if (GM.canHire(S, h.id) && g >= h.hireCost) heroes = true; } else if (S.party.indexOf(h.id) >= 0 && g >= GM.levelCost(S, h.id, 1)) heroes = true;
    }
    let city = false;
    for (let l = 0; l < 3; l++) { const c = GM.gearCost(S, l); if (c && g >= c.gold && S.res.iron >= c.iron) city = true; }
    for (const b of GM.BUILDINGS) { const c = GM.bldCost(S, b.id); if (c !== null && GM.bldUnlocked(S, b.id) && g >= c) city = true; }
    if (S.slots < 4 && g >= GM.SLOTS[S.slots - 1].gold) city = true;
    for (const r of GM.RESEARCH) if (!S.research[r.id] && S.stats.maxFloor >= r.unlock && S.res.crystals >= r.cost) city = true;
    let asc = GM.canAscend(S);
    for (const t of GM.TALENTS) { const c = GM.talentCost(S, t.id); if (c !== null && S.res.stars >= c) asc = true; }
    return { heroes: heroes, city: city, ascend: asc };
  }

  /**
   * Refresca la interfaz con el estado actual.
   * @param {boolean} [force] Actualiza también el panel aunque no toque.
   */
  UI.refresh = function (force) {
    if (!S) return;
    const r = S.run, D = GM.D(S);
    // Recursos.
    $('#r-gold b').textContent = fmt(S.res.gold);
    $('#r-iron b').textContent = fmt(S.res.iron);
    $('#r-gem b').textContent = fmt(S.res.crystals);
    $('#r-star b').textContent = fmt(S.res.stars);
    $('#r-iron').hidden = S.stats.maxFloor < 3 && S.res.iron < 1;
    $('#r-gem').hidden = S.res.crystals < 1 && !Object.keys(S.research).length && S.stats.maxFloor < 12;
    $('#r-star').hidden = S.res.starsTotal < 1;
    // Información del combate.
    const zone = GM.ZONES[GM.zoneIndex(r.floor)];
    const cap = GM.floorCap(S);
    $('#zone-name').textContent = zone.name;
    $('#floor-label').textContent = `Piso ${r.floor}${cap === Infinity ? '' : ' / ' + cap}`;
    $('#rank-label').textContent = 'Rango ' + GM.RANKS[r.rank].id;
    const e = r.enemy;
    const fill = $('#enemy-bar .fill');
    fill.style.width = e ? Math.max(0, (e.hp / e.max) * 100) + '%' : '0%';
    fill.className = 'fill' + (e && e.boss ? ' boss' : e && e.golden ? ' gold' : '');
    $('#enemy-bar .txt').textContent = e ? `${e.name}  ${fmt(Math.max(0, e.hp))}` : (r.mode === 'farm' && r.wipePower ? 'Reforzando el equipo...' : 'Buscando enemigo...');
    let dotsHtml = '';
    for (let i = 0; i < GM.CFG.killsPerFloor; i++) {
      const boss = r.floor % 5 === 0 && i === GM.CFG.killsPerFloor - 1;
      dotsHtml += `<i class="${i < r.kills ? 'on' : ''}${boss ? ' bossdot' : ''}"></i>`;
    }
    $('#kill-dots').innerHTML = dotsHtml;
    $('#zone-tip').textContent = (r.mode === 'farm' && r.wipePower ? '🛡️ Derrota: farmeando para reforzarte. ' : '') + zone.tip;
    // Controles.
    $('[data-ctl=auto]').classList.toggle('on', S.flags.auto);
    $('[data-ctl=auto]').textContent = S.flags.auto ? '⏩ Auto' : '⏸ Quieto';
    $('[data-ctl=speed]').textContent = '×' + S.flags.speed;
    $('[data-ctl=speed]').hidden = !S.research.turbo2;
    $('[data-ctl=autocast]').hidden = !S.research.autocast;
    $('[data-ctl=autocast]').classList.toggle('on', S.flags.autoCast);
    $('[data-ctl=down]').disabled = r.floor <= 1;
    $('[data-ctl=up]').disabled = r.floor >= r.maxFloor;
    // Habilidades.
    const ab = $('#abilities');
    let abHtml = '';
    S.party.forEach((id, i) => {
      if (!id || S.heroes[id].lvl <= 0) return;
      const h = GM.HERO_BY_ID[id], hs = S.heroes[id];
      const total = h.ability.cd * D.cdMult;
      const rdy = hs.cd <= 0 && !hs.down;
      const pct = rdy ? 0 : Math.min(100, (Math.max(0, hs.cd) / total) * 100);
      abHtml += `<button class="ab ${rdy ? 'ready' : ''} ${hs.down ? 'down' : ''}" data-cast="${id}" title="${esc(h.ability.name)}">
        <img class="px" src="${portrait(id)}" alt=""><span class="abn">${h.ability.short}</span><span class="cd" style="height:${pct}%"></span>${!rdy && !hs.down ? `<span class="cdt">${Math.ceil(hs.cd)}s</span>` : ''}</button>`;
    });
    if (ab._h !== abHtml) { ab.innerHTML = abHtml; ab._h = abHtml; }
    // Pestañas y puntos.
    if (force || (dotT = (dotT + 1) % 2) === 0) {
      const d = dots();
      $$('#tabs [data-tab]').forEach((b) => { b.classList.toggle('dot', !!d[b.dataset.tab] && b.dataset.tab !== UI.tab); });
    }
    // Panel activo.
    const body = $('#tab-body');
    const rows = UI.tab === 'heroes' ? heroRows() : UI.tab === 'city' ? cityRows() : UI.tab === 'ascend' ? ascendRows() : moreRows();
    sync(body, rows);
    const vol = $('#vol');
    if (vol && !vol._b) { vol._b = true; vol.addEventListener('input', () => { S.flags.vol = vol.value / 100; GM.Audio.set(S.flags.muted, S.flags.vol); }); }
  };

  /* -------------------------------------------------------------------- eventos */

  /** Atiende los eventos acumulados por el motor (sonido, efectos, historia). */
  UI.handleEvents = function () {
    if (!S.ev.length) return;
    const evs = S.ev.splice(0, S.ev.length);
    for (const e of evs) {
      GM.Scene.event(S, e);
      switch (e.t) {
        case 'hit': GM.Audio.play(e.big ? 'cast' : 'hit'); break;
        case 'kill': GM.Audio.play(e.boss ? 'boss' : 'coin'); break;
        case 'cast': GM.Audio.play('cast'); break;
        case 'down': GM.Audio.play('down'); break;
        case 'wipe': GM.Audio.play('wipe'); UI.toast('💀 El equipo ha caído y retrocede un piso para reforzarse.', 'warn', 'wipe'); break;
        case 'ach': {
          const a = GM.ACHIEVEMENTS.find((x) => x.id === e.id);
          GM.Audio.play('ach');
          UI.toast(`🏆 <b>${a.name}</b><br><small>+2% de daño y oro</small>`, 'good');
          break;
        }
        case 'spawn': onSpawn(e.enemy); break;
        case 'bossDown': onBossDown(e); break;
        case 'ascend': onAscend(e); break;
        case 'ending': onEnding(); break;
        default:
      }
    }
  };

  function onSpawn(en) {
    const zi = GM.zoneIndex(S.run.floor);
    const fl = S.flags.story;
    if (!fl['z' + zi]) {
      fl['z' + zi] = true;
      UI.story(GM.ZONES[zi].name, GM.ZONES[zi].intro, { btn: zi === 0 ? '¡A la mazmorra!' : 'Adelante' });
    }
    if (en.boss >= 2 && !fl['b' + zi]) {
      fl['b' + zi] = true;
      GM.Audio.play('boss');
      const t = GM.STORY.boss[zi];
      UI.story(t[0], t[1], { btn: '¡A por él!' });
    }
  }
  function onBossDown(e) {
    if (e.floor % 20 === 0 && e.floor < 100) UI.toast('⭐ ¡Jefe derrotado! Ya puedes <b>ascender de rango</b> en la pestaña Ascenso.', 'good');
  }
  function onAscend(e) {
    GM.Audio.play('ascend');
    const t = GM.STORY.ascend[Math.min(3, e.oldRank)];
    if (t) UI.story(t[0], t[1] + `<br><br><b class="good">+${e.stars} ⭐</b> — gástalas en talentos.`);
  }
  function onEnding() {
    GM.Audio.play('ending');
    const lines = GM.STORY.ending;
    let p = Promise.resolve();
    lines.forEach((l, i) => { p = p.then(() => UI.story(i === 0 ? '👑 ¡Lord Casero ha caído!' : '', l, { btn: i === lines.length - 1 ? 'Ver resumen' : 'Continuar' })); });
    p.then(() => UI.modal({ title: '🏆 Fin de la historia', wide: true,
      html: `<p>Has derrotado a Lord Casero en <b>${GM.fmtTime(S.t.played)}</b> de juego.</p>
        <div class="statgrid"><div><span>Enemigos derrotados</span><b>${fmt(S.stats.kills)}</b></div><div><span>Ascensos</span><b>${S.stats.ascents}</b></div>
        <div><span>Jefes derrotados</span><b>${fmt(S.stats.bossKills)}</b></div><div><span>Logros</span><b>${Object.keys(S.ach).length}/${GM.ACHIEVEMENTS.length}</b></div></div>
        <p>La <b>Torre Infinita</b> está abierta: sigue subiendo más allá del piso 100 y asciende cuando quieras para ganar más ⭐.</p>`,
      buttons: [{ label: 'Seguir jugando', cls: 'primary', value: true }] }));
  }

  /** Informe de lo ocurrido mientras el jugador estaba fuera. */
  UI.offlineReport = function (rep) {
    return UI.modal({ title: '🌙 Mientras no estabas...', wide: true,
      html: `<p>Estuviste fuera <b>${GM.fmtTime(rep.away)}</b>${rep.capped ? ' (el tope de progreso es ' + GM.fmtTime(GM.D(S).offCapS) + ')' : ''}. Tu equipo siguió luchando a un ${Math.round(rep.eff * 100)}% de eficiencia:</p>
        <div class="statgrid"><div><span>🪙 Oro</span><b>+${fmt(rep.gold)}</b></div><div><span>⛏️ Hierro</span><b>+${fmt(rep.iron)}</b></div>
        <div><span>💎 Cristales</span><b>+${fmt(rep.crystals)}</b></div><div><span>⚔️ Enemigos</span><b>${fmt(rep.kills)}</b></div>
        ${rep.floors > 0 ? `<div><span>🏔️ Pisos nuevos</span><b>+${rep.floors}</b></div>` : ''}</div>`,
      buttons: [{ label: '¡Genial!', cls: 'primary', value: true }] });
  };

  /** Anuncia desbloqueos nuevos (héroes, edificios, investigaciones). */
  UI.checkUnlocks = function () {
    const seen = S.flags.seen || (S.flags.seen = {});
    const mf = S.stats.maxFloor;
    GM.HEROES.forEach((h) => { if (h.hireFloor > 1 && mf >= h.hireFloor && !seen['h' + h.id]) { seen['h' + h.id] = true; GM.Audio.play('unlock'); UI.toast(`🍺 <b>${h.name}</b> (${h.cls}) está en la Taberna.`, 'info'); } });
    GM.BUILDINGS.forEach((b) => { if (b.unlock > 1 && mf >= b.unlock && !seen['b' + b.id]) { seen['b' + b.id] = true; GM.Audio.play('unlock'); UI.toast(`🏗️ Nuevo edificio: <b>${b.name}</b>.`, 'info'); } });
    if (mf >= 3 && !seen.saveHint && !GM.Cloud.available() && GM.Cloud.status !== 'connecting') {
      seen.saveHint = true;
      UI.toast('💾 Tu partida se guarda sola en este navegador. Para jugar en otro dispositivo, usa <b>Más → Exportar</b>.', 'info');
    }
    if (mf >= 12 && !seen.lib) { seen.lib = true; GM.Audio.play('unlock'); UI.toast('📚 La <b>Biblioteca</b> ya está abierta (Ciudad).', 'info'); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
