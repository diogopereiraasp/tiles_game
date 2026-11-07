// Carrega os scripts do jogo (clássicos, escopo global compartilhado) num contexto isolado do Node, sem navegador.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeContext(files, extra = {}) {
  const noop = () => {};
  const el = new Proxy(function () {}, {
    get: (t, k) => (k === 'style' || k === 'classList' || k === 'dataset') ? new Proxy({}, { get: () => noop, set: () => true }) : (k === 'querySelector' || k === 'querySelectorAll' ? () => (k === 'querySelectorAll' ? [] : el) : (typeof k === 'symbol' ? undefined : el)),
    set: () => true, apply: () => el,
  });
  const storage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
  const win = {};
  const ctx = {
    console, Math, Date, JSON, Promise, Map, Set, Array, Object, Number, String, Boolean, Symbol, Error, RegExp, Proxy, Uint8Array,
    parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, // sem relógios/loops em segundo plano
    requestAnimationFrame: noop,
    document: { getElementById: () => el, querySelector: () => el, querySelectorAll: () => [], createElement: () => el, addEventListener: noop, body: el, visibilityState: 'visible' },
    window: win, localStorage: storage(), sessionStorage: storage(), navigator: { userAgent: 'node' },
    location: { search: '', pathname: '/', origin: 'http://t', protocol: 'http:', hostname: 'localhost' }, history: { replaceState: noop },
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) }, alert: noop, confirm: () => true, prompt: noop,
    performance: { now: () => Date.now() }, Audio: function () {},
    ...extra,
  };
  win.addEventListener = noop; win.document = ctx.document; Object.assign(win, { localStorage: ctx.localStorage, navigator: ctx.navigator });
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// Funções que vivem em ui.js/account.js/online.js e são chamadas pela lógica: substitutas sem tela.
const HEADLESS_STUBS = `
  renderAll = renderBoards = renderTileCounts = renderDraftingArea = function () {};
  animateScoreStep = animateFloorPenalty = function () {};
  waitMs = () => Promise.resolve();
  saveSessionToStorage = function () {};
  recordMatchResult = function () {};
  updateHeaderPlayerButtons = function () {};
  var __ended = false;
  endGame = async function () { __ended = true; };
`;

function loadGame(opts = {}) {
  // saveSessionToStorage/recordMatchResult/updateHeaderPlayerButtons não existem sem online.js/account.js: declare antes
  const pre = `var saveSessionToStorage, recordMatchResult, updateHeaderPlayerButtons, renderAll, renderBoards, renderTileCounts, renderDraftingArea, animateScoreStep, animateFloorPenalty, broadcastP2P = function(){};${opts.withOnline ? '' : ' var CLOCK_INITIAL_MS = 300000, CLOCK_INCREMENT_MS = 15000, CLOCK_MAX_MS = 300000, clockEnabled = false;'}`;
  const ctx = makeContext([]);
  vm.runInContext(pre, ctx);
  const files = ['js/config.js', 'js/chat.js', 'js/online-state.js', 'js/game-setup.js', 'js/bot.js', 'js/turns.js'].concat(opts.withOnline ? ['js/online.js'] : []);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext(HEADLESS_STUBS, ctx);
  if (opts.withOnline) vm.runInContext('updateHeaderPlayerButtons = function () {}; saveSessionToStorage = function () {};', ctx);
  return ctx;
}

module.exports = { makeContext, loadGame, vm };
