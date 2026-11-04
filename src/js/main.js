/**
 * Arranque: carga/guarda la partida (navegador + nube), bucle de juego,
 * progreso sin conexión y PWA.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const Cloud = GM.Cloud;
  const KEY = 'gremio-mala-muerte-save-v1';
  const BAK = KEY + '-bak';
  let S = null;
  let storageOk = true;
  let lastBackup = 0;
  let booted = false;
  let loopResume = function () { /* se asigna al arrancar el bucle */ };

  function store(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function fetchStore(k) { try { return root.localStorage.getItem(k); } catch (e) { storageOk = false; return null; } }

  function load() {
    for (const k of [KEY, BAK]) {
      const t = fetchStore(k);
      if (!t) continue;
      try { return { state: GM.deserialize(t), fromBackup: k === BAK }; } catch (e) { console.warn('Guardado ilegible en', k, e); }
    }
    return null;
  }

  /** Guarda la partida en el navegador (y una copia cada 5 minutos) y la sube a la nube si toca. */
  function save(force) {
    if (!S) return;
    const json = GM.serialize(S);
    const local = store(KEY, json);
    if (local) {
      const now = Date.now();
      if (force || now - lastBackup > 5 * 60 * 1000) { store(BAK, json); lastBackup = now; }
    }
    Cloud.push(json, S, force === 'manual' ? 'manual' : !!force).then((ok) => { if (ok) GM.UI.refresh(false); });
    if (!local && !Cloud.available() && storageOk) {
      storageOk = false;
      GM.UI.toast('⚠️ Este navegador no deja guardar. Usa <b>Más → Exportar</b> para no perder tu partida.', 'warn');
    }
  }

  /** Simula el tiempo que el jugador estuvo fuera y, si es largo, muestra el informe. */
  function catchUp() {
    const away = (Date.now() - S.t.saved) / 1000;
    if (away > 60) {
      const rep = GM.offline(S, away);
      if (rep && (rep.gold > 0 || rep.kills > 0)) GM.UI.offlineReport(rep);
    } else if (away > 1) {
      S.evOn = false;
      GM.advance(S, Math.min(away, 60));
      S.evOn = true;
    }
    S.t.saved = Date.now();
  }

  /* ----------------------------------------------------------------- nube */

  function localInfo() { return { floor: S.stats.maxFloor, rank: S.run.rank, played: S.t.played, at: S.t.saved }; }

  /** Pregunta qué partida conservar cuando la nube tiene una más reciente. @returns {Promise<'cloud'|'local'>} */
  function askNewer(d, runtime) {
    const l = localInfo();
    return GM.UI.modal({
      title: '☁️ ' + (runtime ? 'Otro dispositivo ha guardado' : 'Partida distinta en la nube'), wide: true,
      html: `<p>${runtime ? 'Hay progreso nuevo guardado desde otro dispositivo.' : 'Tu cuenta tiene una partida que este dispositivo no conoce.'} ¿Con cuál sigues?</p>
        <div class="two"><div><b>☁️ En la nube</b><br>${Cloud.describe(d)}<br><small class="muted">${Cloud.ago(d.savedAt)}</small></div>
        <div><b>📱 En este dispositivo</b><br>${Cloud.describe(l)}<br><small class="muted">${Cloud.ago(l.at)}</small></div></div>
        <p class="muted"><small>La que no elijas se sobrescribe.</small></p>`,
      buttons: [{ label: 'Seguir con esta', value: 'local' }, { label: 'Cargar la de la nube', cls: 'primary', value: 'cloud' }],
    });
  }

  /** Sustituye la partida actual por la de la nube y calcula el progreso desde que se guardó. */
  function adopt(d) {
    let ns;
    try { ns = GM.deserialize(d.save); } catch (e) { GM.UI.toast('La partida de la nube está dañada; se mantiene la de este dispositivo.', 'warn'); return false; }
    S = ns; S.evOn = true;
    S.flags.cloudRev = d.savedAt;
    GM.Audio.set(S.flags.muted, S.flags.vol);
    GM.UI.setState(S);
    Cloud.lastSeenAt = d.savedAt;
    catchUp();
    save(true);
    return true;
  }

  async function onRemote(d) {
    if (Cloud.conflict) return;
    Cloud.conflict = true; Cloud.locked = true;
    const pick = await askNewer(d, true);
    if (pick === 'cloud') adopt(d); else Cloud.lastSeenAt = d.savedAt;
    Cloud.locked = false; Cloud.conflict = false;
    if (pick === 'local') save('manual');
    GM.UI.refresh(true);
  }

  /**
   * Concilia la partida local con la de la nube.
   * @param {number} localAt Marca de guardado de la partida local (0 si no había).
   * @param {boolean} hadLocal Si había partida local.
   * @returns {Promise<string>} off | error | uploaded | loaded | kept | synced
   */
  async function cloudBoot(localAt, hadLocal) {
    Cloud.locked = true;
    const ok = await Cloud.init();
    GM.UI.refresh(false);
    if (!ok) return Cloud.status === 'error' ? 'error' : 'off';
    let remote;
    try { remote = await Cloud.fetch(); } catch (e) { Cloud.status = 'error'; GM.UI.refresh(false); return 'error'; }
    let result = 'synced';
    if (!remote) {
      Cloud.lastSeenAt = 0; Cloud.locked = false;
      if (hadLocal || S.t.played > 5) { save('manual'); result = 'uploaded'; }
    } else if (!hadLocal) {
      adopt(remote); Cloud.locked = false;
      GM.UI.toast('☁️ Partida cargada desde tu cuenta.', 'good');
      result = 'loaded';
    } else if (S.flags.cloudRev === remote.savedAt || remote.dev === Cloud.device) {
      // La nube no ha cambiado desde la última sincronización de este dispositivo (o la escribió él): la local va por delante.
      Cloud.lastSeenAt = remote.savedAt; Cloud.locked = false; save(true);
    } else {
      // La nube cambió desde que este dispositivo se sincronizó (o nunca se sincronizó): que decida el jugador.
      const pick = await askNewer(remote, false);
      if (pick === 'cloud') { adopt(remote); result = 'loaded'; } else { Cloud.lastSeenAt = remote.savedAt; result = 'kept'; }
      Cloud.locked = false;
      if (pick === 'local') save('manual');
    }
    Cloud.watch(onRemote);
    GM.UI.refresh(true);
    return result;
  }

  const host = {
    save: save,
    reset() {
      try { root.localStorage.removeItem(KEY); root.localStorage.removeItem(BAK); } catch (e) { /* nada */ }
      S = GM.newState(); S.evOn = true;
      S.flags.story.z0 = true;
      GM.UI.setState(S);
      GM.UI.setTab('heroes');
      GM.UI.story('Gremio de Mala Muerte', GM.STORY.start, { btn: '¡A la mazmorra!' });
      if (Cloud.available()) { Cloud.lastPlayed = -1; save('manual'); }   // la nube también empieza de cero
    },
    replace(ns) {
      S = ns; S.evOn = true;
      GM.Audio.set(S.flags.muted, S.flags.vol);
      GM.UI.setState(S);
      save('manual');
    },
    /** Acciones del panel Más → Nube. */
    async cloud(kind) {
      if (kind === 'retry') {
        const r = await cloudBoot(S.t.saved, true);
        GM.UI.toast(r === 'error' ? '☁️ Sigue sin haber conexión con la nube.' : '☁️ Conectado.', r === 'error' ? 'warn' : 'good');
        return;
      }
      if (!Cloud.available()) return;
      if (kind === 'up') {
        const ok = await Cloud.push(GM.serialize(S), S, 'manual');
        GM.UI.toast(ok ? '☁️ Partida subida a tu cuenta.' : '☁️ No se pudo subir. Inténtalo de nuevo.', ok ? 'good' : 'warn');
        GM.UI.refresh(true);
      } else if (kind === 'down') {
        let d;
        try { d = await Cloud.fetch(); } catch (e) { GM.UI.toast('☁️ No se pudo leer la nube.', 'warn'); return; }
        if (!d) { GM.UI.toast('☁️ Todavía no hay ninguna partida en la nube.', 'info'); return; }
        const pick = await askNewer(d, false);
        if (pick === 'cloud') adopt(d);
        GM.UI.refresh(true);
      }
    },
  };

  /** Código de partida del enlace (#save=...), o null. Limpia la dirección. */
  function readLinkSave() {
    const m = /^#save=(.+)$/.exec(root.location.hash || '');
    if (!m) return null;
    try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* nada */ }
    let code = m[1];
    try { code = decodeURIComponent(code); } catch (e) { /* se usa tal cual */ }
    return code.length <= 400000 ? code : '';
  }

  /** Ofrece cargar la partida que trae el enlace. @returns {Promise<boolean>} true si se cargó. */
  async function offerLinkImport(code, hadLocal) {
    let ns;
    try { ns = GM.importSave(code); } catch (e) { GM.UI.toast('El enlace de partida no es válido.', 'warn'); return false; }
    const info = { floor: ns.stats.maxFloor, rank: ns.run.rank, played: ns.t.played };
    const ok = await GM.UI.modal({ title: '📨 Partida en el enlace', wide: true,
      html: `<p>Este enlace trae una partida: <b>${Cloud.describe(info)}</b>.</p>${hadLocal ? '<p><b>Sustituirá la partida de este navegador.</b></p>' : ''}`,
      buttons: [{ label: 'No, ignorar', value: false }, { label: 'Cargar esta partida', cls: 'primary', value: true }] });
    if (!ok) return false;
    S = ns; S.evOn = true;
    GM.Audio.set(S.flags.muted, S.flags.vol);
    GM.UI.setState(S);
    return true;
  }

  async function boot() {
    let loaded = load();
    S = loaded ? loaded.state : GM.newState();
    S.evOn = true;
    GM.Audio.set(S.flags.muted, S.flags.vol);
    GM.UI.init(S, host);
    root.GM.state = function () { return S; };

    // Partida compartida por enlace (#save=...): se ofrece antes de nada.
    let imported = false;
    const linkCode = readLinkSave();
    if (linkCode !== null) {
      imported = linkCode ? await offerLinkImport(linkCode, !!loaded) : false;
      if (linkCode === '') GM.UI.toast('El enlace de partida es demasiado grande.', 'warn');
      if (imported) { loaded = { state: S, fromBackup: false }; }
    }
    const localAt = loaded ? loaded.state.t.saved : 0;

    // Guardar al ocultar o cerrar la página: se registra ya, sin esperar a la nube.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { S.t.saved = Date.now(); save(true); } else if (booted) { catchUp(); loopResume(); }
    });
    root.addEventListener('pagehide', () => { S.t.saved = Date.now(); save(true); });

    // Primero la nube (si existe): así el progreso sin conexión se calcula sobre la partida correcta.
    // No se espera más de 4 s: si la nube tarda, se juega ya y la conciliación sigue en segundo plano.
    let cloudResult = 'off';
    const cb = cloudBoot(localAt, !!loaded).then((r) => { cloudResult = r; return r; }).catch(() => 'error');
    await Promise.race([cb, new Promise((r) => setTimeout(r, 4000))]);

    if (cloudResult === 'loaded') {
      /* adopt() ya calculó el progreso sin conexión */
    } else if (loaded) {
      if (loaded.fromBackup) GM.UI.toast('Se recuperó la copia de seguridad de tu partida.', 'info');
      catchUp();
    } else {
      S.flags.story.z0 = true;
      GM.UI.story('Gremio de Mala Muerte', GM.STORY.start, { btn: '¡A la mazmorra!' });
    }

    booted = true;
    let last = performance.now(), acc = 0, uiT = 0, saveT = 0, unlockT = 0;
    loopResume = function () { last = performance.now(); };
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!GM.UI.paused) {
        acc += dt * S.flags.speed;
        let n = 0;
        while (acc >= GM.DT && n < 48) {
          GM.step(S, GM.DT); acc -= GM.DT; n++;
          if (S.research.contable) { S._buyT += GM.DT; if (S._buyT >= GM.CFG.accountantEvery) { S._buyT = 0; GM.accountant(S); } }
        }
        if (n >= 48) acc = 0;
        S.t.played += dt;
      }
      GM.UI.handleEvents();
      GM.Scene.draw(S, now);
      uiT += dt;
      if (uiT > 0.25) { uiT = 0; GM.UI.refresh(false); }
      unlockT += dt;
      if (unlockT > 1) { unlockT = 0; GM.UI.checkUnlocks(); }
      saveT += dt;
      if (saveT > 10) { saveT = 0; save(); }
      root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(frame);

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin PWA: no pasa nada */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
