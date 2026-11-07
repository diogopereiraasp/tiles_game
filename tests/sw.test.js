// Teste da lógica do service worker (sw.js) no Node, com caches/fetch simulados.
// Rodar: node tests/sw.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const store = new Map();                       // "cache" simulado: url -> Response
const listeners = {};
let online = true;
let fetchCalls = [];
class FakeResponse {
  constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.ok = this.status < 400; this.type = init.type || 'basic'; }
  clone() { return new FakeResponse(this.body, { status: this.status, type: this.type }); }
}
const sandbox = {
  URL, Response: FakeResponse, console,
  self: { location: { origin: 'https://site.test' }, addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim() {} } },
  caches: {
    open: async () => ({ addAll: async () => {}, put: async (req, res) => { store.set(req.url, res); } }),
    match: async (req) => store.get(typeof req === 'string' ? new URL(req, 'https://site.test/').href : req.url),
    keys: async () => [], delete: async () => true,
  },
  fetch: async (req) => { fetchCalls.push(req.url); if (!online) throw new Error('offline'); return new FakeResponse('rede:' + req.url); },
};
sandbox.self.skipWaiting = () => {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../sw.js', 'utf8'), sandbox);

const run = (url, opts = {}) => new Promise((resolve) => {
  let p = null;
  const ev = { request: { url, method: opts.method || 'GET', mode: opts.mode || 'no-cors' }, respondWith: (x) => { p = Promise.resolve(x); } };
  listeners.fetch(ev);
  resolve(p);
});

(async () => {
  // 1) online: busca na rede e guarda cópia
  let r = await run('https://site.test/js/ui.js?v=1');
  assert.strictEqual(r.body, 'rede:https://site.test/js/ui.js?v=1');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(store.has('https://site.test/js/ui.js?v=1'), 'deveria ter guardado a cópia');

  // 2) offline: usa a cópia guardada
  online = false;
  r = await run('https://site.test/js/ui.js?v=1');
  assert.strictEqual(r.body, 'rede:https://site.test/js/ui.js?v=1');

  // 3) offline, navegação sem cópia da URL: cai no index.html guardado
  online = true; await run('https://site.test/index.html'); await new Promise(r => setTimeout(r, 10));
  online = false;
  r = await run('https://site.test/?sala=ABCD', { mode: 'navigate' });
  assert.strictEqual(r.body, 'rede:https://site.test/index.html');

  // 4) offline, recurso nunca visto: 503 (não quebra)
  r = await run('https://site.test/js/nunca.js');
  assert.strictEqual(r.status, 503);

  // 5) POST e outros domínios (Supabase) NÃO são interceptados
  online = true; fetchCalls = [];
  assert.strictEqual(await run('https://site.test/x', { method: 'POST' }), null);
  assert.strictEqual(await run('https://cbhjtbjrbtkelpsmqsly.supabase.co/rest/v1/rpc/x'), null);
  assert.strictEqual(fetchCalls.length, 0);

  // 6) a biblioteca do jsDelivr é guardada (para abrir offline)
  r = await run('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
  assert.ok(r.body.startsWith('rede:'));

  console.log('sw.test.js: OK (6 cenários)');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
