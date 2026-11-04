#!/usr/bin/env node
/** Genera una hoja con todos los sprites y fondos: node tools/spritesheet.js [salida.png] */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'spritesheet.png');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent('<body style="margin:0;background:#2b2b3a"><canvas id=c width=1100 height=900></canvas></body>');
  for (const f of ['data.js', 'floors.js', 'util.js', 'sprites.js']) await page.addScriptTag({ content: read(f) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const c = document.getElementById('c'), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false; ctx.font = '12px monospace'; ctx.fillStyle = '#fff';
    const names = GM.spriteNames();
    const S = 5, cell = 16 * S + 24;
    names.forEach((n, i) => {
      const col = i % 10, row = Math.floor(i / 10);
      const x = 10 + col * (cell + 6), y = 10 + row * (cell + 16);
      ctx.fillStyle = '#4b5a78'; ctx.fillRect(x, y, 16 * S, 16 * S);
      ctx.drawImage(GM.spriteCanvas(n), x, y, 16 * S, 16 * S);
      ctx.fillStyle = '#fff'; ctx.fillText(n, x, y + 16 * S + 12);
    });
    const bgs = ['sotano', 'bosque', 'cripta', 'volcan', 'torre'];
    bgs.forEach((b, i) => {
      const bg = GM.makeBackground(b, 256, 144);
      ctx.drawImage(bg, 10 + (i % 3) * 360, 400 + Math.floor(i / 3) * 250, 350, 197);
    });
    // Escena de prueba con héroes y enemigo sobre el fondo del sótano.
    const bg = GM.makeBackground('sotano', 256, 144), sc = document.createElement('canvas');
    sc.width = 256; sc.height = 144; const sx = sc.getContext('2d'); sx.imageSmoothingEnabled = false;
    sx.drawImage(bg, 0, 0);
    ['guerrero', 'maga', 'arquero', 'clerigo'].forEach((h, i) => sx.drawImage(GM.spriteCanvas(h), 14 + i * 30, 70 + (i % 2) * 6, 32, 32));
    sx.drawImage(GM.spriteCanvas('limo'), 180, 66, 32, 32);
    ctx.drawImage(sc, 740, 650, 340, 191);
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  await browser.close();
  if (errors.length) { console.error('ERRORES:', errors); process.exit(1); }
  console.log('Hoja guardada en', out);
})();
