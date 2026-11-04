'use strict';
// Capa de enganche en un navegador real: cofres, especializaciones, misiones, diaria, frenesí, goblin, hitos.
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

/** Abre el juego ya pasada la historia inicial. */
async function play(opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, opts || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  await page.click('#modal-root .btn.primary');
  await page.waitForTimeout(150);
  return { ctx, page, errors };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const toLoot = async (page, sub) => { await page.click('#tabs [data-tab=loot]'); if (sub) await page.click(`[data-act=lootsub][data-id=${sub}]`); await page.waitForTimeout(250); };

test('la pestaña Botín muestra misiones y la recompensa diaria sin errores', async () => {
  const { ctx, page, errors } = await play();
  await toLoot(page);
  assert.match(await page.textContent('#tab-body'), /Recompensa diaria/);
  assert.equal(await page.locator('#tab-body .card .pbar').count() >= 3, true, 'tres misiones con barra de progreso');
  for (const sub of ['chests', 'relics', 'bestiary', 'ach']) { await page.click(`[data-act=lootsub][data-id=${sub}]`); await page.waitForTimeout(150); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('un cofre se abre con animación, da recompensas y baja el contador', async () => {
  const { ctx, page, errors } = await play();
  await ev(page, () => { const s = GM.state(); GM.Loot.addChest(s, 'oro', 2); s.res.gold = 1e6; });
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#r-chest'), true, 'aparece la ficha de cofres');
  assert.equal((await page.textContent('#r-chest')).trim().endsWith('2'), true);
  await toLoot(page, 'chests');
  await page.click('[data-act=open][data-id=oro]');
  await page.waitForSelector('#modal-root .reveal');
  await page.waitForTimeout(1900);
  const text = await page.textContent('#modal-root .modal');
  assert.match(text, /de oro/);
  assert.equal(await page.locator('#modal-root .rw').count() >= 3, true, 'oro, nivel gratis y reliquias');
  assert.equal(await ev(page, () => GM.state().loot.chests.oro), 1);
  await page.click('#modal-root .btn:has-text("Abrir otro")');
  await page.waitForTimeout(300);
  assert.equal(await ev(page, () => GM.state().loot.chests.oro), 0);
  await page.click('#modal-root .btn.primary');
  // Los logros pueden repartir cofres de bronce mientras tanto: la ficha refleja el total real.
  const total = await ev(page, () => GM.Loot.chestTotal(GM.state()));
  assert.equal(await page.isVisible('#r-chest'), total > 0);
  assert.ok((await ev(page, () => Object.keys(GM.state().loot.relics).length)) >= 3, 'las reliquias se guardaron');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Abrir todos abre todos los cofres y muestra un resumen', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); GM.Loot.addChest(s, 'bronce', 3); GM.Loot.addChest(s, 'plata', 2); });
  await toLoot(page, 'chests');
  await page.click('[data-act=openall]');
  await page.waitForSelector('#modal-root .reveal');
  assert.match(await page.textContent('#modal-root .modal'), /5 cofres abiertos/);
  await page.click('#modal-root .btn.primary');
  assert.equal(await ev(page, () => GM.state().loot.chests.plata), 0, 'no queda ninguno de plata');
  assert.ok((await ev(page, () => GM.state().stats.chests)) >= 5, 'se abrieron los 5');
  await ctx.close();
});

test('las misiones cumplidas se reclaman y se reponen', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); GM.Loot.ensureQuests(s); const q = s.loot.quests[0]; q.p = q.goal; q.done = true; });
  await toLoot(page, 'quests');
  await page.click('[data-act=qclaim]');
  await page.waitForTimeout(300);
  assert.equal(await ev(page, () => GM.Loot.chestTotal(GM.state()) >= 1), true);
  assert.equal(await ev(page, () => GM.state().loot.quests.length), 3, 'se repone la misión');
  assert.equal(await ev(page, () => GM.state().stats.quests), 1);
  await ctx.close();
});

test('especializaciones: aparece el botón al nivel 20, se elige y se ve en la tarjeta', async () => {
  const { ctx, page, errors } = await play();
  assert.equal(await page.locator('[data-act=perks]').count(), 0, 'no antes de tiempo');
  await ev(page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 25; GM.Loot.noteLevel(s, 'guerrero'); GM.dirty(s); });
  await page.waitForSelector('[data-act=perks][data-id=guerrero].perk');
  const dps0 = await ev(page, () => GM.D(GM.state()).hero.guerrero.dps);
  await page.click('[data-act=perks][data-id=guerrero]');
  await page.waitForSelector('[data-pick]');
  await page.click('[data-pick="1"]');                               // Espada Afilada: +50% daño
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#tab-body'), /Espada Afilada/);
  const dps1 = await ev(page, () => GM.D(GM.state()).hero.guerrero.dps);
  assert.ok(dps1 / dps0 > 1.49 && dps1 / dps0 < 1.6, `+50% de daño (con algún logro de por medio): ${dps1 / dps0}`);
  assert.equal(await ev(page, () => GM.state().stats.perks), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('frenesí: la barra llena se activa con un toque y dura unos segundos', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); s.stats.kills = 10; s.fr.m = 100; });
  await page.waitForSelector('#fr-row.ready');
  await page.click('#fr-row');
  await page.waitForTimeout(300);
  assert.equal(await ev(page, () => GM.state().fr.t > 0), true);
  assert.equal(await page.locator('#stage.frenzy').count(), 1);
  assert.equal(await ev(page, () => GM.state().stats.frenzies), 1);
  assert.equal(await ev(page, () => GM.state().stats.taps), 0, 'pulsar el botón no cuenta como toque al enemigo');
  await ctx.close();
});

test('el goblin del tesoro se atrapa tocándolo y da un cofre de plata', async () => {
  const { ctx, page, errors } = await play({ viewport: { width: 800, height: 900 }, isMobile: false });
  await ev(page, () => {
    const s = GM.state(); s.stats.maxFloor = 6;
    s.loot.gob = { t: 50000, life: 100000, hits: 0, need: 3 };      // a mitad del recorrido: en pantalla y casi quieto
    s.run.enemy = { hp: 1e30, max: 1e30, dmg: 0, phys: 1, magic: 1, t: 0, gold: 0, iron: 0, type: 'rata', name: 'x', sprite: 'rata', boss: 0, golden: false };
  });
  for (let i = 0; i < 3; i++) {
    const pt = await ev(page, () => {
      const s = GM.state(), b = GM.Scene.goblinBox(s), r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.left + ((b.x + b.w / 2) / GM.Scene.size.w) * r.width, y: r.top + ((b.y + b.h / 2) / GM.Scene.size.h) * r.height };
    });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(120);
  }
  assert.equal(await ev(page, () => GM.state().stats.goblins), 1);
  assert.equal(await ev(page, () => GM.state().loot.chests.plata >= 1), true);
  assert.equal(await ev(page, () => GM.state().stats.taps), 0, 'los toques al goblin no hieren al enemigo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('combo y siguiente meta se muestran en el combate', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); s.cmb.n = 12; s.cmb.t = 4; s.stats.kills = 10; });
  await page.waitForTimeout(500);
  assert.match(await page.textContent('#combo'), /COMBO ×12/);
  assert.equal(await page.isVisible('#goal'), true);
  assert.match(await page.textContent('#goal'), /\S/);
  await ctx.close();
});

test('subir un nivel con hito muestra el cartel ¡HITO! y el cambio de daño', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); s.heroes.guerrero.lvl = 9; s.res.gold = 1e6; GM.dirty(s); });
  await page.waitForTimeout(350);
  await page.click('[data-act=lvl][data-id=guerrero]');
  await page.waitForSelector('#banner:not([hidden])');
  assert.match(await page.textContent('#banner'), /HITO/);
  await page.waitForTimeout(200);
  assert.match(await page.textContent('#dps-delta'), /\+\d/);
  await ctx.close();
});

test('la recompensa diaria aparece tras un par de minutos de juego y se reclama', async () => {
  const { ctx, page, errors } = await play();
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'no interrumpe al empezar');
  await ev(page, () => { GM.state().t.played = 200; });
  await page.waitForSelector('#modal-root .modal', { timeout: 6000 });
  assert.match(await page.textContent('#modal-root .modal'), /Recompensa diaria/);
  await page.click('#modal-root .btn.primary');
  await page.waitForSelector('#modal-root .reveal');
  assert.equal(await ev(page, () => GM.state().stats.dailies), 1);
  await page.click('#modal-root .btn.primary');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('una partida guardada antes de la capa nueva se carga y se puede jugar', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Se genera una partida y se le quitan los campos nuevos, como en una versión antigua.
  await page.goto(base);
  await page.waitForFunction(() => window.GM && GM.state && GM.state());
  await page.evaluate(() => {
    const s = GM.state(); s.heroes.guerrero.lvl = 40; s.flags.story.z0 = true; s.stats.maxFloor = 6;
    const o = JSON.parse(GM.serialize(s)); delete o.loot; delete o.fr; delete o.cmb;
    ['crits', 'combo', 'frenzies', 'chests', 'relics', 'topLevel'].forEach((k) => delete o.stats[k]);
    localStorage.setItem('gremio-mala-muerte-save-v1', JSON.stringify(o));
  });
  await page.addInitScript(() => {});
  await page.evaluate(() => { window.onpagehide = null; });
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(base);
  await p2.waitForFunction(() => window.GM && GM.state && GM.state());
  await p2.waitForTimeout(800);
  assert.equal(await p2.evaluate(() => GM.state().heroes.guerrero.lvl >= 40), true);
  await p2.click('#tabs [data-tab=loot]');
  await p2.waitForSelector('[data-act=lootsub]');
  assert.match(await p2.textContent('#tab-body'), /Misiones del gremio/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('en un móvil de 390×844 el panel de pestañas conserva espacio útil', async () => {
  const { ctx, page } = await play();
  await ev(page, () => { const s = GM.state(); s.stats.kills = 10; s.fr.m = 100; s.cmb.n = 8; s.cmb.t = 4; GM.Loot.addChest(s, 'bronce', 1); });
  await page.waitForTimeout(600);
  const h = await page.evaluate(() => document.getElementById('panel').clientHeight);
  assert.ok(h >= 250, `el panel mide ${h}px: el combate ocupa demasiado`);
  await ctx.close();
});
