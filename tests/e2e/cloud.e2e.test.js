'use strict';
// Pruebas de la nube con una base de datos simulada (misma API que `claude.use("db")`).
// Cada contexto de navegador es "un dispositivo"; la Map `cloud` es la cuenta compartida.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'src');
require('../../tools/engine-files.js').forEach((f) => require(path.join(ROOT, 'js', f)));
const GM = globalThis.GM;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const DOC = 'data/users/u_test/save';
let server, base, browser, cloud;

test.before(async () => {
  server = http.createServer((req, res) => {
    let p = req.url.split('?')[0]; if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  await new Promise((r) => server.listen(0, r));
  base = 'http://localhost:' + server.address().port + '/';
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });
test.beforeEach(() => { cloud = new Map(); });

/** Script que instala un `window.claude` falso con db y user. */
const MOCK = `(() => {
  const snap = (id, v) => ({ id, exists: v !== null, data: () => (v === null ? undefined : v), metadata: { fromCache: false, hasPendingWrites: false } });
  const mkDoc = (path) => ({
    path, id: path.split('/').pop(),
    async get() { return snap(this.id, await window.__dbGet(path)); },
    async set(d) { await window.__dbSet(path, d); },
    onSnapshot(next) {
      let last; const id = this.id;
      const tick = async () => { const v = await window.__dbGet(path); const j = JSON.stringify(v); if (j !== last) { last = j; next(snap(id, v)); } };
      tick(); const t = setInterval(tick, 150); return () => clearInterval(t);
    },
  });
  const db = { doc: mkDoc, collection: (p) => ({ doc: (id) => mkDoc(p + '/' + id) }) };
  const user = { id: async () => 'u_test' };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) };
})();`;

/** Abre un "dispositivo" (contexto nuevo) con o sin nube. */
async function device(opts) {
  opts = opts || {};
  const ctx = opts.ctx || (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
  if (!opts.ctx) {
    await ctx.exposeFunction('__dbGet', (p) => (cloud.has(p) ? JSON.parse(cloud.get(p)) : null));
    await ctx.exposeFunction('__dbSet', (p, v) => { cloud.set(p, JSON.stringify(v)); });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.cloud !== false) await page.addInitScript({ content: MOCK });
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  return { ctx, page, errors };
}
const get = (page, fn, arg) => page.evaluate(fn, arg);
async function closeStory(page) { await page.click('#modal-root .btn.primary'); await page.waitForTimeout(150); }
const cloudDoc = () => JSON.parse(cloud.get(DOC));
/** Partida del motor con el guerrero a cierto nivel, guardada en una fecha dada. */
function saveWith(lvl, savedAt) {
  const s = GM.newState();
  s.heroes.guerrero.lvl = lvl; s.flags.story.z0 = true; s.stats.maxFloor = 12; s.run.floor = 12; s.run.maxFloor = 12;
  GM.dirty(s);
  const json = GM.serialize(s);
  const o = JSON.parse(json); o.t.saved = savedAt;
  return JSON.stringify(o);
}

test('un dispositivo sube su partida y otro dispositivo nuevo la carga solo', async () => {
  const a = await device();
  await closeStory(a.page);
  await get(a.page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 9; s.res.gold = 777; s.flags.story.z0 = true; GM.dirty(s); });
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await a.page.waitForTimeout(500);
  assert.ok(cloud.has(DOC), 'la partida debe estar en la nube');
  assert.ok(JSON.parse(cloudDoc().save).heroes.guerrero.lvl === 9);

  const b = await device();     // otro dispositivo, sin partida local
  assert.equal(await get(b.page, () => GM.state().heroes.guerrero.lvl), 9, 'el segundo dispositivo carga la nube');
  assert.equal(await b.page.locator('#modal-root .modal').count(), 0, 'no repite la historia inicial');
  assert.deepEqual(a.errors.concat(b.errors), []);
  await a.ctx.close(); await b.ctx.close();
});

test('si la nube tiene una partida que este dispositivo no conoce, pregunta y no la pisa mientras se decide', async () => {
  const first = await device({ cloud: false });
  await closeStory(first.page);
  await get(first.page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 3; s.flags.story.z0 = true; GM.dirty(s); });
  await first.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await first.page.close();
  const future = Date.now() + 3600 * 1000;
  cloud.set(DOC, JSON.stringify({ v: 1, save: saveWith(50, future), savedAt: future, dev: 'otro', played: 3000, floor: 12, rank: 0 }));

  const page = await first.ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: MOCK });
  await page.goto(base);
  await page.waitForSelector('#modal-root .modal');
  assert.match(await page.textContent('#modal-root .modal'), /Partida distinta en la nube/);
  // Con la decisión pendiente, un guardado forzado (cierre de la página) no debe sobrescribir la nube.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(400);
  assert.equal(cloudDoc().savedAt, future, 'la nube sigue intacta');
  assert.equal(cloudDoc().dev, 'otro', 'y sigue siendo la del otro dispositivo');
  await page.click('#modal-root .btn.primary');                    // Cargar la de la nube
  await page.waitForTimeout(300);
  assert.equal(await get(page, () => GM.state().heroes.guerrero.lvl), 50);
  assert.deepEqual(errors, []);
  await first.ctx.close();
});

test('si el jugador elige seguir con la partida local, esta sustituye a la de la nube', async () => {
  const first = await device({ cloud: false });
  await closeStory(first.page);
  await get(first.page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 4; s.flags.story.z0 = true; GM.dirty(s); });
  await first.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await first.page.close();
  const future = Date.now() + 3600 * 1000;
  cloud.set(DOC, JSON.stringify({ v: 1, save: saveWith(50, future), savedAt: future, dev: 'otro', played: 3000, floor: 12, rank: 0 }));

  const page = await first.ctx.newPage();
  await page.addInitScript({ content: MOCK });
  await page.goto(base);
  await page.waitForSelector('#modal-root .modal');
  await page.click('#modal-root .btn:not(.primary)');              // Seguir con esta
  await page.waitForTimeout(600);
  assert.equal(await get(page, () => GM.state().heroes.guerrero.lvl), 4);
  assert.equal(JSON.parse(cloudDoc().save).heroes.guerrero.lvl, 4, 'la nube ahora tiene la local');
  await first.ctx.close();
});

test('conflicto en caliente: otro dispositivo guarda y este lo detecta', async () => {
  const a = await device();
  await closeStory(a.page);
  await a.page.waitForTimeout(300);
  const future = Date.now() + 7200 * 1000;
  cloud.set(DOC, JSON.stringify({ v: 1, save: saveWith(77, future), savedAt: future, dev: 'tablet', played: 5000, floor: 12, rank: 0 }));
  await a.page.waitForSelector('#modal-root .modal', { timeout: 8000 });
  assert.match(await a.page.textContent('#modal-root .modal'), /Otro dispositivo/);
  await a.page.click('#modal-root .btn.primary');
  await a.page.waitForTimeout(300);
  assert.equal(await get(a.page, () => GM.state().heroes.guerrero.lvl), 77);
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});

test('el botón Subir ahora de Más sube la partida y el estado se muestra', async () => {
  const a = await device();
  await closeStory(a.page);
  await a.page.click('#tabs [data-tab=more]');
  await a.page.waitForSelector('[data-act=cloud][data-id=up]');
  assert.match(await a.page.textContent('#tab-body'), /Guardada en tu cuenta/);
  await get(a.page, () => { GM.state().heroes.guerrero.lvl = 21; GM.dirty(GM.state()); });
  await a.page.click('[data-act=cloud][data-id=up]');
  await a.page.waitForTimeout(500);
  assert.equal(JSON.parse(cloudDoc().save).heroes.guerrero.lvl, 21);
  await a.ctx.close();
});

test('sin cuenta enlazada no hay nube ni errores, y se explica en Más', async () => {
  const a = await device({ cloud: false });
  await closeStory(a.page);
  await a.page.click('#tabs [data-tab=more]');
  await a.page.waitForTimeout(400);
  assert.match(await a.page.textContent('#tab-body'), /Solo en este dispositivo/);
  assert.equal(cloud.size, 0);
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});

test('si la nube falla al leer, no se sube nada y se puede reintentar', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.exposeFunction('__dbGet', () => { throw new Error('sin red'); });
  await ctx.exposeFunction('__dbSet', (p, v) => { cloud.set(p, JSON.stringify(v)); });
  const page = await ctx.newPage();
  await page.addInitScript({ content: MOCK });
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  await page.waitForTimeout(500);
  await page.click('#modal-root .btn.primary').catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(300);
  assert.equal(cloud.size, 0, 'sin poder leer la nube no se sobrescribe');
  await page.click('#tabs [data-tab=more]');
  await page.waitForSelector('[data-act=cloud][data-id=retry]');
  await ctx.close();
});

test('recargar en el mismo dispositivo no vuelve a preguntar', async () => {
  const a = await device();
  await closeStory(a.page);
  await get(a.page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 15; s.flags.story.z0 = true; GM.dirty(s); });
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await a.page.waitForTimeout(400);
  const page2 = await a.ctx.newPage();
  await page2.addInitScript({ content: MOCK });
  await page2.goto(base);
  await page2.waitForFunction(() => window.GM && GM.state && GM.state());
  await page2.waitForTimeout(800);
  assert.equal(await page2.locator('#modal-root .modal').count(), 0, 'sin preguntas al volver');
  assert.equal(await get(page2, () => GM.state().heroes.guerrero.lvl), 15);
  await a.ctx.close();
});

test('un dispositivo sincronizado detecta que la nube cambió mientras estaba cerrado', async () => {
  const a = await device();
  await closeStory(a.page);
  await get(a.page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 15; s.flags.story.z0 = true; GM.dirty(s); });
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await a.page.waitForTimeout(400);
  await a.page.close();
  // Mientras tanto, otro dispositivo avanza y guarda.
  const later = Date.now() + 60000;
  cloud.set(DOC, JSON.stringify({ v: 1, save: saveWith(60, later), savedAt: later, dev: 'tablet', played: 9000, floor: 12, rank: 0 }));
  const page2 = await a.ctx.newPage();
  await page2.addInitScript({ content: MOCK });
  await page2.goto(base);
  await page2.waitForSelector('#modal-root .modal');
  assert.match(await page2.textContent('#modal-root .modal'), /Partida distinta en la nube/);
  await page2.click('#modal-root .btn.primary');
  await page2.waitForTimeout(300);
  assert.equal(await get(page2, () => GM.state().heroes.guerrero.lvl), 60);
  await a.ctx.close();
});
