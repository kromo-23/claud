#!/usr/bin/env node
/** Barrido de parámetros: node tools/tune.js '{"enemyScale":[1.3,1.4],"msMult":[2,3]}' */
'use strict';
const { simulate } = require('./sim.js');
const grid = JSON.parse(process.argv[2] || '{}');
const hours = Number(process.argv[3] || 14);
const keys = Object.keys(grid);
const combos = [{}];
keys.forEach((k) => {
  const next = [];
  combos.forEach((c) => grid[k].forEach((v) => next.push(Object.assign({}, c, { [k]: v }))));
  combos.length = 0; combos.push(...next);
});
const fmt = (s) => (s / 60).toFixed(0).padStart(4) + 'm';
combos.forEach((c) => {
  const r = simulate(c, { hours: hours });
  const d = r.durations.map(fmt).join(' ');
  console.log(JSON.stringify(c).padEnd(70), '| runs:', d, '|', r.ended ? 'FIN ' + r.hours.toFixed(2) + 'h' : 'NO FIN (piso ' + r.floor + ' rango ' + r.rank + ')');
});
