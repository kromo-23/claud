#!/usr/bin/env node
/**
 * Calibra la dificultad por piso (GM.FLOOR_LN) zona a zona con búsqueda binaria, para que el bot
 * del simulador tarde lo deseado en cada recorrido (rango). Escribe src/js/floors.js con --write.
 *
 *   node tools/calibrate.js [--targets 50,75,100,125,150] [--write]
 *
 * Los objetivos son minutos del bot por recorrido; una persona real tarda ~20% más.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { simulate } = require('./sim.js');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const targets = opt('targets', '50,75,100,125,150').split(',').map(Number).map((m) => m * 60);
const write = argv.includes('--write');
const TOL = Number(opt('tol', '0.04'));
const steps = [0.3, 0.3, 0.3, 0.3, 0.3];

function table() {
  const ln = [0];
  for (let f = 2; f <= 100; f++) ln.push(ln[f - 2] + steps[Math.min(4, Math.floor((f - 1) / 20))]);
  return ln;
}

for (let z = 0; z < 5; z++) {
  let lo = 0.02, hi = 1.2, bestStep = steps[z], bestErr = Infinity;
  for (let it = 0; it < 16; it++) {
    const mid = it === 0 ? steps[z] : Math.sqrt(lo * hi);
    steps[z] = mid;
    // El tramo posterior se rellena con el mismo paso para que la tabla esté completa.
    for (let k = z + 1; k < 5; k++) steps[k] = mid;
    const r = simulate({ floorLn: table(), enemyScale: Math.exp(mid) }, { stopAt: z, runCap: targets[z] * 4, hours: 40 });
    const d = r.durations.length > z ? r.durations[z] : Infinity;
    const err = d === Infinity ? 9 : Math.log(d / targets[z]);
    process.stdout.write(`zona ${z} it ${String(it).padStart(2)} paso=${mid.toFixed(3)} (A=${Math.exp(mid).toFixed(3)}) dur=${d === Infinity ? '>' + (targets[z] * 4 / 60).toFixed(0) : (d / 60).toFixed(1)}m objetivo=${(targets[z] / 60).toFixed(0)}m\n`);
    if (Math.abs(err) < bestErr) { bestErr = Math.abs(err); bestStep = mid; }
    if (Math.abs(err) < TOL) break;
    if (err > 0) hi = mid; else lo = mid;
  }
  steps[z] = bestStep;
  for (let k = z + 1; k < 5; k++) steps[k] = bestStep;
  console.log(`=> zona ${z}: paso ${bestStep.toFixed(3)} (error ${(bestErr * 100).toFixed(1)}%)`);
}

const ln = table();
const final = simulate({ floorLn: ln, enemyScale: Math.exp(steps[4]) }, { hours: 40 });
console.log('\n' + final.text);
if (write) {
  const out = `/**
 * Tabla de dificultad por piso: ln(escala) de los pisos 1..100.
 * La genera tools/calibrate.js (objetivos del bot: ${targets.map((t) => t / 60).join('/')} min por recorrido;
 * pasos por zona: ${steps.map((x) => x.toFixed(3)).join(', ')}).
 * No editar a mano: si se cambia el equilibrio, volver a calibrar.
 */
(function (root) {
  'use strict';
  const GM = root.GM || (root.GM = {});
  GM.FLOOR_LN = [${ln.map((v) => v.toFixed(4)).join(', ')}];
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'js', 'floors.js'), out);
  console.log('Escrito src/js/floors.js');
}
