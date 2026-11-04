'use strict';
// La web debe funcionar servida desde una subcarpeta (como GitHub Pages) y sin conexión tras la primera carga.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'src');
const PREFIX = '/claud/';                    // como https://usuario.github.io/claud/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server, base, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (!p.startsWith(PREFIX)) { res.writeHead(404); return res.end(); }
    p = p.slice(PREFIX.length - 1); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  await new Promise((r) => server.listen(0, r));
  base = 'http://localhost:' + server.address().port + PREFIX;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });

test('funciona desde una subcarpeta: todos los archivos cargan y no hay errores', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const failed = [], errors = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  assert.deepEqual(failed, []);
  assert.deepEqual(errors, []);
  const manifest = await (await page.request.get(base + 'manifest.webmanifest')).json();
  for (const icon of manifest.icons) assert.equal((await page.request.get(base + icon.src)).status(), 200, icon.src);
  await ctx.close();
});

test('tras la primera visita se puede jugar sin conexión', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(async () => { await page.reload(); });
  await page.click('#modal-root .btn.primary');
  await page.evaluate(() => { const s = GM.state(); s.heroes.guerrero.lvl = 5; s.flags.story.z0 = true; GM.dirty(s); });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.GM && GM.state && GM.state(), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => GM.state().heroes.guerrero.lvl), 5, 'carga sin red y conserva la partida');
  await page.waitForFunction(() => GM.state().stats.kills >= 1, null, { timeout: 30000 });
  await ctx.close();
});
