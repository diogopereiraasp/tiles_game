#!/usr/bin/env node
// Roda todos os testes: node tests/run-all.js
//   BATTERY=800 node tests/run-all.js   -> bateria oficial do bot (mais lenta)
//   SKIP_SQL=1 node tests/run-all.js    -> sem os testes de SQL (não precisa de Postgres)
const { spawnSync } = require('child_process');
const path = require('path');

const steps = [
  ['service worker', 'node', [path.join(__dirname, 'sw.test.js')]],
  ['sincronia online', 'node', [path.join(__dirname, 'sync.test.js')]],
  ['lógica do jogo e bot', 'node', [path.join(__dirname, 'game.test.js')]],
];
if (!process.env.SKIP_SQL) steps.push(['SQL (Postgres temporário)', 'bash', [path.join(__dirname, 'sql', 'run.sh')], [2]]);

let failed = 0;
for (const [name, cmd, args, okCodes = []] of steps) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (okCodes.includes(r.status)) console.log(`(${name}: pulado)`);
  else if (r.status !== 0) { failed++; console.log(`>>> FALHOU: ${name}`); }
}
console.log(failed ? `\n${failed} grupo(s) de testes falharam` : '\nTodos os testes passaram.');
process.exit(failed ? 1 : 0);
