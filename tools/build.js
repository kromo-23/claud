#!/usr/bin/env node
/**
 * Empaqueta el juego en un único archivo HTML (CSS y JS dentro) para publicarlo como página.
 * Genera dist/gremio-de-mala-muerte.html (solo el contenido: sin <html>/<head>/<body>).
 *   node tools/build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const body = html.match(/<body>([\s\S]*?)<script src=/)[1].trim();
const js = scripts.map((f) => `/* ${f} */\n${read(f)}`).join('\n');
if (js.includes('</script')) throw new Error('El JS contiene </script: hay que escaparlo');

const out = `<title>Gremio de Mala Muerte</title>
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
const file = path.join(__dirname, '..', 'dist', 'gremio-de-mala-muerte.html');
fs.writeFileSync(file, out);
console.log(`Generado ${file} (${(out.length / 1024).toFixed(0)} KB)`);
