/**
 * Arranque: carga/guarda la partida, bucle de juego, progreso sin conexión y PWA.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const KEY = 'gremio-mala-muerte-save-v1';
  const BAK = KEY + '-bak';
  let S = null;
  let storageOk = true;
  let lastBackup = 0;

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

  /** Guarda la partida (y una copia de seguridad cada 5 minutos). */
  function save(force) {
    if (!S) return;
    const json = GM.serialize(S);
    if (!store(KEY, json)) {
      if (storageOk) { storageOk = false; GM.UI.toast('⚠️ Este navegador no deja guardar. Usa <b>Más → Exportar</b> para no perder tu partida.', 'warn'); }
      return;
    }
    const now = Date.now();
    if (force || now - lastBackup > 5 * 60 * 1000) { store(BAK, json); lastBackup = now; }
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
    },
    replace(ns) {
      S = ns; S.evOn = true;
      GM.Audio.set(S.flags.muted, S.flags.vol);
      GM.UI.setState(S);
      save(true);
    },
  };

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

  function boot() {
    const loaded = load();
    S = loaded ? loaded.state : GM.newState();
    S.evOn = true;
    GM.Audio.set(S.flags.muted, S.flags.vol);
    GM.UI.init(S, host);
    root.GM.state = function () { return S; };

    if (loaded) {
      if (loaded.fromBackup) GM.UI.toast('Se recuperó la copia de seguridad de tu partida.', 'info');
      catchUp();
    } else {
      S.flags.story.z0 = true;
      GM.UI.story('Gremio de Mala Muerte', GM.STORY.start, { btn: '¡A la mazmorra!' });
    }

    let last = performance.now(), acc = 0, uiT = 0, saveT = 0, unlockT = 0;
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!GM.UI.paused) {
        acc += dt * S.flags.speed;
        let n = 0;
        while (acc >= GM.DT && n < 48) {
          GM.step(S, GM.DT); acc -= GM.DT; n++;
          if (S.research.contable) { S._buyT += GM.DT; if (S._buyT >= 20) { S._buyT = 0; GM.accountant(S); } }
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

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { S.t.saved = Date.now(); save(); } else { catchUp(); last = performance.now(); }
    });
    root.addEventListener('pagehide', () => { S.t.saved = Date.now(); save(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin PWA: no pasa nada */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
