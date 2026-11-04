#!/usr/bin/env node
/**
 * Comprueba el paquete de un solo archivo: lo envuelve como lo hace la plataforma de publicación,
 * lo abre en móvil y escritorio, juega unos segundos y revisa errores y desbordes.
 *   node tools/check-bundle.js [carpeta-capturas]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'gremio-de-mala-muerte.html'), 'utf8');
const wrapped = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${bundle}</body></html>`;
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const [name, vp, mobile] of [['movil', { width: 390, height: 844 }, true], ['escritorio', { width: 1280, height: 800 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('http://game.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: wrapped }));
    await page.goto('http://game.test/');
    await page.waitForFunction(() => window.GM && GM.state && GM.state());
    await page.click('#modal-root .btn.primary');
    await page.waitForFunction(() => GM.state().stats.kills >= 1, null, { timeout: 30000 });
    await page.evaluate(() => { const s = GM.state(); s.res.gold = 1e4; });
    await page.waitForTimeout(500);
    await page.click('[data-act=lvl][data-id=guerrero]');
    await page.waitForTimeout(1500);
    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
    if (out) await page.screenshot({ path: path.join(out, `bundle-${name}.png`) });
    console.log(name, 'errores:', errors.length, 'scroll', dims.sw + 'x' + dims.sh, 'ventana', dims.iw + 'x' + dims.ih);
    if (errors.length || dims.sw > dims.iw || dims.sh > dims.ih + 1) { bad++; console.log(errors); }
    await ctx.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
