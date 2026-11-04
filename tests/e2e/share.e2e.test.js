'use strict';
// Jugar sin cuenta: partidas independientes por navegador, y llevarlas con archivo, código o enlace.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'src');
['data.js', 'floors.js', 'util.js', 'core.js'].forEach((f) => require(path.join(ROOT, 'js', f)));
const GM = globalThis.GM;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server, base, browser;

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

async function friend(url, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }, extra || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url || base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  return { ctx, page, errors };
}
const lvl = (page) => page.evaluate(() => GM.state().heroes.guerrero.lvl);
const closeStory = async (page) => { await page.click('#modal-root .btn.primary'); await page.waitForTimeout(150); };
/** Código de partida con el guerrero a cierto nivel. */
function codeWith(l) {
  const s = GM.newState(); s.heroes.guerrero.lvl = l; s.flags.story.z0 = true; s.stats.maxFloor = 9; s.run.floor = 9; s.run.maxFloor = 9; GM.dirty(s);
  return GM.exportSave(s);
}

test('cada amigo tiene su propia partida, sin cuenta ni nube', async () => {
  const a = await friend(), b = await friend();
  await closeStory(a.page); await closeStory(b.page);
  await a.page.evaluate(() => { const s = GM.state(); s.heroes.guerrero.lvl = 12; GM.dirty(s); });
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await lvl(a.page), 12);
  assert.equal(await lvl(b.page), 1, 'la partida de A no aparece en B');
  await a.page.reload(); await a.page.waitForFunction(() => window.GM && GM.state && GM.state());
  assert.equal(await lvl(a.page), 12, 'A conserva la suya al volver');
  assert.deepEqual(a.errors.concat(b.errors), []);
  await a.ctx.close(); await b.ctx.close();
});

test('Más muestra "Invitar" e "Instalar" en la web normal', async () => {
  const a = await friend();
  await closeStory(a.page);
  await a.page.click('#tabs [data-tab=more]');
  await a.page.waitForSelector('[data-act=share]');
  assert.match(await a.page.textContent('#tab-body'), /Instalar como app/);
  assert.match(await a.page.textContent('#tab-body'), /Solo en este dispositivo/);
  await a.ctx.close();
});

test('Invitar copia el enlace del juego cuando no hay menú de compartir', async () => {
  const a = await friend(base, { permissions: ['clipboard-read', 'clipboard-write'] });
  await a.page.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) { /* ya no existe */ } });
  await closeStory(a.page);
  await a.page.click('#tabs [data-tab=more]');
  await a.page.click('[data-act=share]');
  await a.page.waitForTimeout(300);
  const clip = await a.page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, base);
  await a.ctx.close();
});

test('exportar a archivo y importarlo en otro navegador', async () => {
  const a = await friend();
  await closeStory(a.page);
  await a.page.evaluate(() => { const s = GM.state(); s.heroes.guerrero.lvl = 31; s.flags.story.z0 = true; GM.dirty(s); });
  await a.page.click('#tabs [data-tab=more]');
  await a.page.click('[data-act=export]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#modal-root .btn:has-text("Descargar archivo")')]);
  assert.match(dl.suggestedFilename(), /^gremio-partida-\d{4}-\d{2}-\d{2}\.txt$/);
  const file = path.join(os.tmpdir(), 'gremio-test-' + Date.now() + '.txt');
  await dl.saveAs(file);
  assert.equal(GM.importSave(fs.readFileSync(file, 'utf8')).heroes.guerrero.lvl, 31, 'el archivo contiene la partida');

  const b = await friend();
  await closeStory(b.page);
  await b.page.click('#tabs [data-tab=more]');
  await b.page.click('[data-act=import]');
  await b.page.setInputFiles('#impfile', file);
  await b.page.waitForFunction(() => document.querySelector('#imp').value.length > 50);
  await b.page.click('#modal-root .btn.primary');
  await b.page.waitForTimeout(300);
  assert.equal(await lvl(b.page), 31);
  assert.deepEqual(a.errors.concat(b.errors), []);
  fs.unlinkSync(file);
  await a.ctx.close(); await b.ctx.close();
});

test('un enlace con #save= ofrece cargar la partida y deja la dirección limpia', async () => {
  const code = codeWith(44);
  const b = await friend(base + '#save=' + encodeURIComponent(code));
  await b.page.waitForSelector('#modal-root .modal');
  assert.match(await b.page.textContent('#modal-root .modal'), /Partida en el enlace/);
  assert.equal(await b.page.evaluate(() => location.hash), '', 'la dirección queda limpia');
  await b.page.click('#modal-root .btn.primary');
  await b.page.waitForTimeout(300);
  assert.equal(await lvl(b.page), 44);
  assert.equal(await b.page.locator('#modal-root .modal').count(), 0, 'no repite la historia inicial');
  assert.deepEqual(b.errors, []);
  await b.ctx.close();
});

test('rechazar el enlace conserva la partida propia, y un enlace roto no rompe nada', async () => {
  const a = await friend();
  await closeStory(a.page);
  await a.page.evaluate(() => { const s = GM.state(); s.heroes.guerrero.lvl = 7; s.flags.story.z0 = true; GM.dirty(s); });
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const page2 = await a.ctx.newPage();
  const errors = [];
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.goto(base + '#save=' + encodeURIComponent(codeWith(99)));
  await page2.waitForSelector('#modal-root .modal');
  assert.match(await page2.textContent('#modal-root .modal'), /Sustituirá la partida/);
  await page2.click('#modal-root .btn:not(.primary)');
  await page2.waitForTimeout(300);
  assert.equal(await lvl(page2), 7, 'sigue con la suya');

  const page3 = await a.ctx.newPage();
  page3.on('pageerror', (e) => errors.push(e.message));
  await page3.goto(base + '#save=esto-no-es-una-partida');
  await page3.waitForFunction(() => window.GM && GM.state && GM.state());
  await page3.waitForTimeout(400);
  assert.match(await page3.textContent('#toasts'), /no es válido/);
  assert.equal(await lvl(page3), 7);
  assert.deepEqual(errors, []);
  await a.ctx.close();
});

test('dentro de claude.ai no se ofrecen descargas, enlaces ni invitar', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript({ content: 'window.claude = { use: async () => null };' });
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  await closeStory(page);
  await page.click('#tabs [data-tab=more]');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-act=share]').count(), 0);
  await page.click('[data-act=export]');
  assert.equal(await page.locator('#modal-root .btn:has-text("Descargar archivo")').count(), 0);
  assert.equal(await page.locator('#modal-root .btn:has-text("Copiar enlace")').count(), 0);
  await ctx.close();
});
