// Testes da sincronia online (stateVer, RESYNC, revanche, escolha de coluna, sorteio) sem rede nem navegador.
// Rodar: node tests/sync.test.js
const assert = require('assert');
const { loadGame, vm } = require('./harness');

const ctx = loadGame({ withOnline: true });
// devolve cópia JSON de objetos/arrays (evita comparar protótipos de realms diferentes); Promises passam direto
const run = (code) => { const r = vm.runInContext(code, ctx); return (r && typeof r === 'object' && typeof r.then !== 'function') ? JSON.parse(JSON.stringify(r)) : r; };
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

// conexões falsas
run(`
  var __sent = [], __toGuest = [], __toOther = [];
  function __newGame(n) { isBotMode = false; playerCount = n; targetOnlinePlayers = n; initGame(['Ana','Beto','Caio','Duda'].slice(0, n)); isP2P = true; rankedMatchId = null; isGameActive = true; }
  function __asGuest() { isHost = false; myP2PIndex = 1; clientHostConn = { open: true, send: m => __sent.push(m.type + (m.ver !== undefined ? ':' + m.ver : '')) }; lastResyncAt = 0; }
`);

(async () => {
  console.log('sync.test.js');

  await test('convidado: aplica em sequência, ignora repetida, pede RESYNC ao pular (1x), alinha após SYNC_STATE', () => {
    run(`__newGame(2); __asGuest(); __sent.length = 0; stateVer = 0;`);
    const A = (v) => run(`handleClientReceivedMessage({ type: 'ACTION', action: { type: 'PICK_CENTER', color: 'blue' }, ver: ${v} })`);
    A(1); A(2);
    assert.strictEqual(run('stateVer'), 2);
    A(2);
    assert.strictEqual(run('stateVer'), 2, 'repetida ignorada');
    A(4);
    assert.strictEqual(run('stateVer'), 2, 'salto não aplica');
    assert.deepStrictEqual(run('__sent'), ['RESYNC']);
    A(5);
    assert.strictEqual(run('__sent.length'), 1, 'limite de 1 pedido a cada 3 s');
    run(`handleClientReceivedMessage({ type: 'SYNC_STATE', state: Object.assign(getFullGameState(), { stateVer: 5 }) })`);
    assert.strictEqual(run('stateVer'), 5);
    A(6);
    assert.strictEqual(run('stateVer'), 6);
  });

  await test('anfitrião: aplica e repassa com a sua versão; fora de sequência devolve SYNC_STATE; RESYNC devolve estado', () => {
    run(`__newGame(2); isHost = true; myP2PIndex = 0; stateVer = 10; validateGuestAction = () => true;
      __toGuest = []; __toOther = [];
      var __snd = { assignedIndex: 1, open: true, send: m => __toGuest.push(m.type + (m.ver !== undefined ? ':' + m.ver : '')) };
      var __oth = { open: true, send: m => __toOther.push(m.type + (m.ver !== undefined ? ':' + m.ver : '')) };
      hostGuestConnections = [__snd, __oth];`);
    const H = (m) => run(`handleHostReceivedMessage(__snd, ${JSON.stringify(m)})`);
    H({ type: 'ACTION', action: { type: 'PICK_CENTER', color: 'blue' }, ver: 11 });
    assert.strictEqual(run('stateVer'), 11);
    assert.deepStrictEqual(run('__toOther'), ['ACTION:11']);
    assert.deepStrictEqual(run('__toGuest'), [], 'quem enviou não recebe de volta');
    H({ type: 'ACTION', action: { type: 'PICK_CENTER', color: 'blue' }, ver: 11 }); // repetida
    H({ type: 'ACTION', action: { type: 'PICK_CENTER', color: 'blue' }, ver: 20 }); // pulou
    assert.strictEqual(run('stateVer'), 11, 'nada aplicado');
    assert.deepStrictEqual(run('__toGuest'), ['SYNC_STATE', 'SYNC_STATE']);
    H({ type: 'RESYNC' });
    assert.strictEqual(run('__toGuest.length'), 3);
  });

  await test('jogadas locais do anfitrião saem numeradas 1,2,3; modo bot não envia nada', () => {
    run(`__newGame(2); isHost = true; myP2PIndex = 0; turn = 0; __sent = []; broadcastP2P = m => __sent.push(m);`);
    run(`pickFromFactory(0, factories[0][0]); stagePlacement('floor'); confirmMove();`);
    assert.deepStrictEqual(run('__sent.map(m => m.ver)'), [1, 2, 3]);
    run(`isP2P = false; isBotMode = true; __sent = []; initGame(['Você','Bot']); turn = 0; pickFromFactory(0, factories[0][0]);`);
    assert.strictEqual(run('__sent.length'), 0);
    assert.strictEqual(run('stateVer'), 0);
    run('isBotMode = false; isP2P = true;');
  });

  await test('revanche: só anfitrião, só sala de amigos após fim normal; convidado reabre ao receber estado novo', () => {
    run(`__newGame(3); isHost = true; myP2PIndex = 0; movesPlayed = 42; stateVer = 42; matchFinished = true; __sent = []; broadcastP2P = m => __sent.push(m);`);
    run('startRematch()');
    assert.strictEqual(run('matchFinished'), false);
    assert.strictEqual(run('stateVer'), 0);
    assert.strictEqual(run('movesPlayed'), 0);
    assert.deepStrictEqual(run('players.map(p => p.name).join()'), 'Ana,Beto,Caio', 'mantém os nomes');
    const sync = run('__sent.find(m => m.type === "SYNC_STATE")');
    assert.ok(sync, 'anfitrião avisa os convidados');
    // ranqueada: sem revanche
    run(`rankedMatchId = 'abc'; matchFinished = true; __sent = []; startRematch();`);
    assert.strictEqual(run('__sent.length'), 0, 'ranqueada não tem revanche');
    run(`rankedMatchId = null; matchFinished = false;`);
    // convidado vendo o fim recebe o estado novo
    run(`isHost = false; myP2PIndex = 1; movesPlayed = 42; matchFinished = true;`);
    run(`handleClientReceivedMessage({ type: 'SYNC_STATE', state: ${JSON.stringify(sync.state)} })`);
    assert.strictEqual(run('matchFinished'), false, 'reabriu');
    assert.strictEqual(run('movesPlayed'), 0);
    // SYNC comum (com mais jogadas) NÃO reabre
    run(`matchFinished = true; movesPlayed = 10;`);
    run(`handleClientReceivedMessage({ type: 'SYNC_STATE', state: Object.assign(${JSON.stringify(sync.state)}, { movesPlayed: 30 }) })`);
    assert.strictEqual(run('matchFinished'), true);
  });

  await test('após o fim normal, aviso de abandono é ignorado e sair não conta abandono', () => {
    run(`__newGame(2); isHost = false; myP2PIndex = 1; matchFinished = true; hasMatchEndedByAbandon = false; var __rec = 0; recordMatchResult = () => { __rec++; };`);
    run(`handlePlayerAbandoned(0, 'Ana', 'abandon')`);
    assert.strictEqual(run('hasMatchEndedByAbandon'), false);
    assert.strictEqual(run('__rec'), 0);
  });

  await test('saída/tempo antes da 1a jogada: partida cancelada, sem registrar abandono; depois da 1a jogada registra', () => {
    run(`__newGame(2); isHost = true; myP2PIndex = 0; matchFinished = false; hasMatchEndedByAbandon = false; movesPlayed = 0; var __rec = []; recordMatchResult = (r, i) => { __rec.push(r + ':' + i); };`);
    run(`handlePlayerAbandoned(1, 'Beto', 'abandon')`);
    assert.strictEqual(run('hasMatchEndedByAbandon'), true, 'a partida termina');
    assert.deepStrictEqual(run('__rec'), [], 'nada registrado com 0 jogadas');
    run(`__newGame(2); matchFinished = false; hasMatchEndedByAbandon = false; movesPlayed = 0; __rec = [];`);
    run(`handlePlayerAbandoned(1, 'Beto', 'timeout')`);
    assert.deepStrictEqual(run('__rec'), [], 'tempo esgotado sem jogadas também não registra');
    run(`__newGame(2); matchFinished = false; hasMatchEndedByAbandon = false; movesPlayed = 5; __rec = [];`);
    run(`handlePlayerAbandoned(1, 'Beto', 'abandon')`);
    assert.deepStrictEqual(run('__rec'), ['abandon:1'], 'com jogadas registra normalmente');
  });

  await test('escolha de coluna (avançado): convidado reenvia WALL_PICK ao novo anfitrião; novo anfitrião confirma', async () => {
    run(`__newGame(3); advancedMode = true; autoWallChoice = false; isHost = false; myP2PIndex = 1; round = 1; __sent = [];
      clientHostConn = { open: true, send: m => __sent.push(m) };
      var __p = players[1]; __p.pattern[0] = { size: 1, count: 1, color: 'yellow' };
      var __cols = validCols(__p, 0, 'yellow');
      var __prom = chooseWallColumn(__p, 0, 'yellow'); pickWallColumn(1, 0, __cols[2]);`);
    assert.strictEqual(run('__sent.length'), 1);
    run('resendPendingWallPick()');
    assert.strictEqual(run('__sent.length'), 2, 'reenviou');
    assert.strictEqual(run('__sent[1].c'), run('__cols[2]'));
    run(`receiveWallChoice({ round: 1, playerId: 1, r: 0, c: __cols[2] })`);
    assert.strictEqual(await run('__prom'), run('__cols[2]'));
    const n = run('__sent.length'); run('resendPendingWallPick()');
    assert.strictEqual(run('__sent.length'), n, 'depois de confirmado não reenvia');
    // novo anfitrião aguardando a escolha de outro jogador
    run(`__newGame(3); advancedMode = true; autoWallChoice = false; isHost = false; myP2PIndex = 1; round = 1; var __out = []; broadcastP2P = m => __out.push(m);
      clientHostConn = { open: true, send: () => {} };
      var __p2 = players[2]; __p2.pattern[0] = { size: 1, count: 1, color: 'red' };
      var __c2 = validCols(__p2, 0, 'red'); var __pr2 = chooseWallColumn(__p2, 0, 'red');
      isHost = true; rearmWallChoicesAsHost();
      receiveWallPick(2, { type: 'WALL_PICK', round: 1, playerId: 2, r: 0, c: __c2[1] });`);
    assert.strictEqual(await run('__pr2'), run('__c2[1]'));
    assert.ok(run('__out.some(m => m.type === "WALL_CHOICE" && m.playerId === 2)'));
  });

  await test('randomizeOnlineStarter sorteia entre todas as posições', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) { run('playerCount = 4; randomizeOnlineStarter()'); seen.add(run('turn')); assert.strictEqual(run('turn'), run('nextStartPlayer')); }
    assert.deepStrictEqual([...seen].sort(), [0, 1, 2, 3]);
  });

  console.log(failures ? `\n${failures} teste(s) falharam` : '\nsync.test.js: OK');
  process.exit(failures ? 1 : 0);
})();
