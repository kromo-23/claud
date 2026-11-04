/**
 * Guardado en la nube: sincroniza la partida con la cuenta de claude.ai del jugador para
 * poder seguir en cualquier dispositivo. Usa la capacidad `db` de las páginas publicadas
 * (un documento privado por persona: data/users/<id>/save).
 *
 * Solo funciona cuando el juego está publicado como página de claude.ai y el jugador tiene
 * la sesión iniciada. En cualquier otro sitio (GitHub Pages, archivo local) queda desactivado
 * y el juego usa solo el guardado del navegador y Exportar/Importar.
 */
(function (root) {
  'use strict';
  const GM = root.GM;
  const TIMEOUT_MS = 10000;
  const PUSH_EVERY_MS = 90000;

  /** Identificador de este dispositivo: persistente si el navegador deja guardarlo. */
  function deviceId() {
    const k = 'gremio-mala-muerte-device';
    try {
      let v = root.localStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2, 12); root.localStorage.setItem(k, v); }
      return v;
    } catch (e) { return Math.random().toString(36).slice(2, 12); }
  }

  /** Estado de la sincronización. status: off | connecting | on | error */
  const Cloud = GM.Cloud = {
    status: 'off',
    doc: null,
    device: deviceId(),      // identifica este dispositivo (se conserva entre visitas) frente a los demás
    locked: true,            // mientras haya una decisión pendiente no se sube nada (no pisar partidas)
    lastSeenAt: 0,           // última marca de guardado vista en la nube
    lastPushAt: 0,           // cuándo se subió por última vez (reloj local)
    lastPlayed: -1,
    inflight: false,
    watching: false,
  };

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((resolve, reject) => setTimeout(() => reject({ code: 'timeout' }), ms))]);
  }

  /** ¿Hay una cuenta enlazada para guardar en la nube? */
  Cloud.available = function () { return !!Cloud.doc; };

  /**
   * Conecta con la cuenta. @returns {Promise<boolean>} true si la nube está disponible.
   */
  Cloud.init = async function () {
    Cloud.status = 'connecting';
    try {
      if (!root.claude || typeof root.claude.use !== 'function') { Cloud.status = 'off'; return false; }
      const [db, user] = await Promise.all([root.claude.use('db'), root.claude.use('user')]);
      if (!db || !user) { Cloud.status = 'off'; return false; }
      const id = await user.id();
      if (!id) { Cloud.status = 'off'; return false; }
      Cloud.doc = db.collection('data/users/' + id).doc('save');
      Cloud.status = 'on';
      return true;
    } catch (e) {
      Cloud.status = 'error';
      return false;
    }
  };

  /** Valida un documento leído de la nube. @returns {object|null} */
  function valid(d) {
    if (!d || typeof d.save !== 'string' || !Number.isFinite(d.savedAt)) return null;
    return d;
  }

  /**
   * Lee la partida de la nube.
   * @returns {Promise<object|null>} {save, savedAt, dev, played, floor, rank} o null si no hay.
   * @throws si no se pudo leer (hay que reintentar, no asumir que está vacía).
   */
  Cloud.fetch = async function () {
    const snap = await withTimeout(Cloud.doc.get(), TIMEOUT_MS);
    if (!snap.exists) return null;
    return valid(snap.data());
  };

  /**
   * Sube la partida.
   * @param {string} json Partida serializada (GM.serialize).
   * @param {object} s Estado (para el resumen).
   * @param {boolean|'manual'} force false = respeta el intervalo y no sube si no hay cambios;
   *   true = ignora el intervalo; 'manual' = sube siempre.
   * @returns {Promise<boolean>} true si se subió.
   */
  Cloud.push = async function (json, s, force) {
    if (!Cloud.doc || Cloud.locked || Cloud.inflight) return false;
    const now = Date.now();
    const played = Math.floor(s.t.played);
    if (force !== 'manual') {
      if (force !== true && now - Cloud.lastPushAt < PUSH_EVERY_MS) return false;
      if (played === Cloud.lastPlayed) return false;
    }
    Cloud.inflight = true;
    try {
      await withTimeout(Cloud.doc.set({
        v: 1, save: json, savedAt: s.t.saved, dev: Cloud.device, played: played,
        floor: s.stats.maxFloor, rank: s.run.rank, ascents: s.stats.ascents,
      }), TIMEOUT_MS);
      Cloud.lastPushAt = now; Cloud.lastSeenAt = s.t.saved; Cloud.lastPlayed = played;
      s.flags.cloudRev = s.t.saved;        // versión de la nube con la que esta partida está sincronizada
      Cloud.status = 'on';
      return true;
    } catch (e) {
      Cloud.status = 'error';
      return false;
    } finally {
      Cloud.inflight = false;
    }
  };

  /**
   * Avisa cuando otro dispositivo guarda una partida más reciente que la vista aquí.
   * Se suscribe una sola vez.
   * @param {(d:object)=>void} onRemote
   */
  Cloud.watch = function (onRemote) {
    if (!Cloud.doc || Cloud.watching) return;
    Cloud.watching = true;
    Cloud.doc.onSnapshot((snap) => {
      if (!snap.exists || (snap.metadata && snap.metadata.fromCache)) return;
      const d = valid(snap.data());
      if (!d || d.dev === Cloud.device) return;
      if (d.savedAt > Cloud.lastSeenAt) onRemote(d);
    }, () => { Cloud.status = 'error'; });
  };

  /** Texto "hace 5 min" para una marca de tiempo. */
  Cloud.ago = function (ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' d';
  };

  /** Resumen legible de una partida (de la nube o del estado actual). */
  Cloud.describe = function (o) {
    const rank = GM.RANKS[Math.max(0, Math.min(5, o.rank | 0))].id;
    return `Piso ${o.floor} · Rango ${rank} · ${GM.fmtTime(o.played)} jugadas`;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
