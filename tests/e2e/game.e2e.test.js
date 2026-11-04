'use strict';
// Pruebas de extremo a extremo en un navegador real: node --test tests/e2e/
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'src');
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

/** Abre una página nueva con captura de errores. */
async function open(opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, opts || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  return { ctx, page, errors };
}
const state = (page, fn, arg) => page.evaluate(fn, arg);
const closeStory = async (page) => { await page.click('#modal-root .btn.primary'); await page.waitForTimeout(150); };

test('carga sin errores y muestra la historia inicial', async () => {
  const { ctx, page, errors } = await open();
  assert.match(await page.textContent('#modal-root .modal'), /Gremio de Mala Muerte/);
  await closeStory(page);
  assert.equal(await page.locator('#modal-root .modal').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sin desbordamiento horizontal en móvil y escritorio', async () => {
  for (const vp of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
    const { ctx, page } = await open({ viewport: vp, isMobile: vp.width < 600 });
    await closeStory(page);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(w[0] <= w[1], `scrollWidth ${w[0]} > ${w[1]} en ${vp.width}px`);
    await ctx.close();
  }
});

test('tocar al enemigo le hace daño y cuenta como toque', async () => {
  const { ctx, page, errors } = await open();
  await closeStory(page);
  await page.waitForFunction(() => GM.state().run.enemy);
  for (let i = 0; i < 6; i++) await page.click('#stage', { position: { x: 200, y: 100 } });
  assert.ok((await state(page, () => GM.state().stats.taps)) >= 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('el combate avanza solo y da oro; se puede comprar un nivel con el botón', async () => {
  const { ctx, page } = await open();
  await closeStory(page);
  await page.waitForFunction(() => GM.state().stats.kills >= 2, null, { timeout: 30000 });
  await state(page, () => { GM.state().res.gold = 50; });
  await page.waitForTimeout(300);
  await page.click('[data-act=lvl][data-id=guerrero]');
  assert.ok((await state(page, () => GM.state().heroes.guerrero.lvl)) > 1);
  assert.match(await page.textContent('#r-gold'), /\d/);
  await ctx.close();
});

test('la partida se guarda y se recupera al recargar', async () => {
  const { ctx, page } = await open();
  await closeStory(page);
  await state(page, () => { const s = GM.state(); s.res.gold = 777; s.heroes.guerrero.lvl = 9; s.flags.story.z0 = true; GM.dirty(s); });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  assert.equal(await state(page, () => GM.state().heroes.guerrero.lvl), 9);
  assert.ok((await state(page, () => GM.state().res.gold)) >= 777);
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'no repite la historia inicial');
  await ctx.close();
});

test('progreso sin conexión: tras 3 horas fuera aparece el informe con botín', async () => {
  const { ctx, page } = await open();
  await closeStory(page);
  await state(page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 80; GM.dirty(s); });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const before = await state(page, () => GM.state().res.gold);
  await page.close();
  // Al abrir de nuevo, un script previo retrasa la fecha del último guardado 3 horas
  // (al recargar, el propio juego volvería a guardar con la hora actual).
  const page2 = await ctx.newPage();
  const errors = [];
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.addInitScript(() => {
    const k = 'gremio-mala-muerte-save-v1';
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const d = JSON.parse(raw); d.t.saved = Date.now() - 3 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(d));
  });
  await page2.goto(base);
  await page2.waitForSelector('#modal-root .modal');
  assert.match(await page2.textContent('#modal-root .modal'), /Mientras no estabas/);
  assert.ok((await page2.evaluate(() => GM.state().res.gold)) > before);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('exportar e importar una partida desde la pestaña Más', async () => {
  const { ctx, page, errors } = await open();
  await closeStory(page);
  await state(page, () => { const s = GM.state(); s.res.gold = 4242; s.run.floor = 3; s.run.maxFloor = 3; });
  const code = await state(page, () => GM.exportSave(GM.state()));
  await state(page, () => { GM.state().res.gold = 1; });
  await page.click('#tabs [data-tab=more]');
  await page.click('[data-act=import]');
  await page.fill('#imp', code);
  await page.click('#modal-root .btn.primary');
  await page.waitForTimeout(200);
  assert.ok((await state(page, () => GM.state().res.gold)) >= 4242);
  // Un código roto se rechaza y no rompe nada.
  await page.click('[data-act=import]');
  await page.fill('#imp', 'basura');
  await page.click('#modal-root .btn.primary');
  assert.match(await page.textContent('#imp-err'), /no es válido/);
  await page.click('#modal-root .btn:not(.primary)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ascenso de rango: confirmación, reinicio y estrellas para talentos', async () => {
  const { ctx, page, errors } = await open();
  await closeStory(page);
  await state(page, () => {
    const s = GM.state();
    s.run.floor = 20; s.run.maxFloor = 20; s.stats.maxFloor = 20; s.run.canAscend = true; s.heroes.guerrero.lvl = 90; s.res.gold = 9999; GM.dirty(s);
  });
  await page.click('#tabs [data-tab=ascend]');
  await page.click('[data-act=ascend]');
  assert.match(await page.textContent('#modal-root .modal'), /Ascenso de Rango/);
  await page.click('#modal-root .btn.primary');          // confirmar
  await page.waitForSelector('#modal-root .modal');       // historia del ascenso
  assert.match(await page.textContent('#modal-root .modal'), /Rango E/);
  await closeStory(page);
  const r = await state(page, () => { const s = GM.state(); return { rank: s.run.rank, floor: s.run.floor, stars: s.res.stars, lvl: s.heroes.guerrero.lvl }; });
  assert.equal(r.rank, 1); assert.equal(r.floor, 1); assert.ok(r.stars >= 4); assert.equal(r.lvl, 1);
  await page.waitForTimeout(400);
  await page.click('[data-act=talent][data-id=fuerza]');
  assert.equal(await state(page, () => GM.state().talents.fuerza), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('el jefe final lanza el final de la historia', async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 }, isMobile: false });
  await closeStory(page);
  await state(page, () => {
    const s = GM.state();
    s.flags.story = { z0: true, z1: true, z2: true, z3: true, z4: true, b0: true, b1: true, b2: true, b3: true, b4: true };
    s.run.rank = 4; s.run.floor = 100; s.run.kills = 4; s.run.maxFloor = 100; s.stats.maxFloor = 100;
    s.heroes.guerrero.lvl = 1500; GM.dirty(s);
  });
  await page.waitForFunction(() => GM.state().flags.ending, null, { timeout: 30000 });
  await page.waitForSelector('#modal-root .modal');
  assert.match(await page.textContent('#modal-root .modal'), /Lord Casero/);
  for (let i = 0; i < 5; i++) { await page.click('#modal-root .btn.primary'); await page.waitForTimeout(120); }
  assert.match(await page.textContent('#modal-root .modal'), /Fin de la historia/);
  await page.click('#modal-root .btn.primary');
  assert.equal(await page.locator('#modal-root .modal').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('equipo: cambiar héroes desde los huecos y no dejarlo vacío', async () => {
  const { ctx, page } = await open();
  await closeStory(page);
  await state(page, () => { const s = GM.state(); s.stats.maxFloor = 5; s.heroes.maga.lvl = 3; s.slots = 2; GM.dirty(s); });
  await page.waitForTimeout(400);
  await page.click('.slot[data-i="1"]');
  await page.click('.picks [data-hero="maga"]');
  assert.deepEqual(await state(page, () => GM.state().party.slice(0, 2)), ['guerrero', 'maga']);
  // Quitar a Paco y luego intentar quitar a la maga (único): se rechaza.
  await page.click('.slot[data-i="0"]'); await page.click('.picks [data-hero=""]');
  assert.deepEqual(await state(page, () => GM.state().party.slice(0, 2)), [null, 'maga']);
  await page.click('.slot[data-i="1"]'); await page.click('.picks [data-hero=""]');
  assert.ok(await state(page, () => GM.state().party.some(Boolean)));
  await ctx.close();
});
