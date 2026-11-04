#!/usr/bin/env node
/** Genera icons/icon.svg (pixel art) y los PNG de 192 y 512 px: node tools/make-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const src = path.join(__dirname, '..', 'src');
['data.js', 'util.js', 'sprites.js'].forEach((f) => require(path.join(src, 'js', f)));
const GM = globalThis.GM;

const rows = GM.spriteRows('guerrero');
let rects = '';
rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') rects += `<rect x="${x + 4}" y="${y + 3}" width="1.02" height="1.02" fill="${GM.PAL[ch]}"/>`; }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a306b"/><stop offset="1" stop-color="#17132a"/></linearGradient></defs>
<rect width="24" height="24" fill="url(#g)"/><rect x="0.5" y="0.5" width="23" height="23" fill="none" stroke="#ffcd75" stroke-width="1"/>
<rect x="4" y="19" width="16" height="1" fill="#4a3f86"/>${rects}
<circle cx="19.5" cy="5.5" r="2" fill="#ffcd75"/><circle cx="19.5" cy="5.5" r="1.1" fill="none" stroke="#ef7d57" stroke-width=".5"/></svg>`;
fs.mkdirSync(path.join(src, 'icons'), { recursive: true });
fs.writeFileSync(path.join(src, 'icons', 'icon.svg'), svg);

(async () => {
  const browser = await chromium.launch();
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: path.join(src, 'icons', `icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('Iconos generados en src/icons');
})();
