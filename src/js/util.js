/**
 * Utilidades: formato de números y tiempos, base64 y mezcla de objetos.
 * Funciona en el navegador y en Node.
 */
(function (root) {
  'use strict';
  const GM = root.GM || (root.GM = {});

  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qd', 'Qn', 'Sd'];

  /**
   * Formatea un número grande de forma legible (1.5K, 3.4M...).
   * @param {number} n Valor a mostrar.
   * @param {number} [dec] Decimales para valores menores de 1000 (por defecto 0 si es entero).
   * @returns {string}
   */
  GM.fmt = function (n, dec) {
    if (n === undefined || n === null || Number.isNaN(n)) return '0';
    if (!Number.isFinite(n)) return '∞';
    if (n < 0) return '-' + GM.fmt(-n, dec);
    if (n < 1000) {
      if (dec !== undefined) return n.toFixed(dec);
      if (n >= 100 || Number.isInteger(n)) return String(Math.floor(n));
      return n < 10 ? n.toFixed(2) : n.toFixed(1);
    }
    const exp = Math.floor(Math.log10(n) / 3);
    if (exp >= SUF.length) return n.toExponential(2).replace('e+', 'e');
    const v = n / Math.pow(1000, exp);
    return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUF[exp];
  };

  /**
   * Formatea una duración en segundos como "1h 05m", "4m 12s" o "35s".
   * @param {number} sec Segundos.
   * @returns {string}
   */
  GM.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  };

  /** Codifica texto UTF-8 en base64 (navegador y Node). */
  GM.toB64 = function (str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  };
  /** Decodifica base64 a texto UTF-8 (navegador y Node). */
  GM.fromB64 = function (b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b64)));
  };

  /**
   * Mezcla `src` dentro de `dst` en profundidad (solo objetos planos); los arrays se reemplazan.
   * Las claves de `dst` que no existan en `src` se conservan (valores por defecto).
   */
  GM.merge = function merge(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    for (const k of Object.keys(src)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  };

  /** Generador pseudoaleatorio con semilla (mulberry32), útil en tests y simulaciones. */
  GM.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
