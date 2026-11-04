#!/usr/bin/env node
/**
 * Prueba de humo en navegador: abre el juego, recoge errores y hace capturas.
 *   node tools/shot.js <carpeta-salida> [url]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'shots');
const url = process.argv[3] || 'http://localhost:8123/';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, viewport, dsf, mobile) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(url);
  await sleep(1200);
  const shot = (n) => page.screenshot({ path: path.join(out, `${name}-${n}.png`) });
  await shot('01-inicio');
  // Cerrar la historia inicial.
  await page.click('#modal-root .btn.primary').catch(() => {});
  await sleep(300);
  // Ganar un poco de oro y dejar jugar.
  await page.evaluate(() => { const s = GM.state(); s.res.gold = 400; GM.dirty(s); });
  await sleep(3500);
  await shot('02-combate');
  await page.click('[data-act=lvl][data-id=guerrero]').catch((e) => errors.push('click lvl: ' + e.message));
  // Avance rápido de la partida para ver más contenido.
  await page.evaluate(() => {
    const s = GM.state();
    s.stats.maxFloor = 14; s.run.maxFloor = 14; s.run.floor = 14;
    ['maga', 'arquero', 'clerigo'].forEach((id) => { s.heroes[id].lvl = 40; });
    s.slots = 4; s.party = ['guerrero', 'maga', 'arquero', 'clerigo'];
    s.heroes.guerrero.lvl = 60; s.res.gold = 5e6; s.res.iron = 5e3; s.res.crystals = 12; GM.dirty(s);
    GM.checkAchievements(s);
  });
  await sleep(4000);
  await shot('03-equipo');
  for (const tab of ['city', 'ascend', 'more']) {
    await page.click(`#tabs [data-tab=${tab}]`);
    await sleep(500);
    await shot(`04-${tab}`);
  }
  await page.click('#tabs [data-tab=heroes]');
  // Zona del bosque y de la cripta.
  for (const [floor, tag] of [[23, 'bosque'], [43, 'cripta'], [63, 'volcan'], [85, 'torre']]) {
    await page.evaluate((f) => { const s = GM.state(); s.run.floor = f; s.run.maxFloor = f; s.stats.maxFloor = f; s.run.kills = 0; s.run.enemy = null; s.flags.story = { z0: true, z1: true, z2: true, z3: true, z4: true, b0: true, b1: true, b2: true, b3: true, b4: true }; }, floor);
    await sleep(2500);
    await shot('05-' + tag);
  }
  // Jefe final.
  await page.evaluate(() => { const s = GM.state(); s.run.floor = 100; s.run.maxFloor = 100; s.run.rank = 4; s.run.kills = 4; s.run.enemy = null; s.heroes.guerrero.lvl = 1; GM.dirty(s); });
  await sleep(2500);
  await shot('06-jefe');
  await browser.close();
  return errors;
}

(async () => {
  const all = [];
  all.push(...(await run('movil', { width: 390, height: 844 }, 2, true)).map((e) => '[movil] ' + e));
  all.push(...(await run('escritorio', { width: 1280, height: 800 }, 1, false)).map((e) => '[escritorio] ' + e));
  if (all.length) { console.log('ERRORES:\n' + all.join('\n')); process.exitCode = 1; } else console.log('Sin errores de consola. Capturas en', out);
})();
