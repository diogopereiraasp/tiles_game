// Testes de lógica do jogo, sem navegador. Rodar: node tests/game.test.js
// Variáveis: BATTERY=800 (partidas bot x bot; padrão 100; use 800 para a bateria oficial)
const assert = require('assert');
const { loadGame, vm } = require('./harness');

const BATTERY = Number(process.env.BATTERY || 100);
const ctx = loadGame();
const run = (code) => vm.runInContext(code, ctx);

// Jogo completo sem tela: cada índice usa o motor indicado
run(`
  async function __playGame(n, adv, engines, maxMoves) {
    isBotMode = false; isP2P = false; isGameActive = true; playerCount = n; advancedMode = adv; autoWallChoice = true; __ended = false;
    initGame(['A','B','C','D'].slice(0, n)); isGameActive = true; advancedMode = adv;
    let moves = 0; const seats = new Set();
    while (!__ended && moves < (maxMoves || 800)) {
      const idx = turn; seats.add(idx);
      const mv = botChooseMove(idx, engines[idx % engines.length]);
      if (!mv) return { error: 'sem jogada', moves };
      selected = { ...mv.opt };
      stagedMove = mv.target === 'row' ? { target: 'row', rIdx: mv.rIdx } : { target: 'floor' };
      confirmMove(false); moves++;
      let g = 0; while (isScoringAnimationActive && g++ < 20000) await Promise.resolve();
    }
    if (!__ended) return { error: 'não terminou', moves };
    const total = bag.length + discard.length + factories.flat().length + center.length +
      players.reduce((s, p) => s + p.floor.filter(x => x !== 'starter').length + p.pattern.reduce((a, r) => a + r.count, 0) + p.wall.flat().filter(Boolean).length, 0);
    const fin = players.map(p => {
      const rows = p.wall.filter(r => r.every(Boolean)).length; let cols = 0;
      for (let c = 0; c < 5; c++) if (p.wall.every(r => r[c])) cols++;
      return p.score + rows * 2 + cols * 7;
    });
    return { moves, seats: [...seats].sort().join(''), tiles: total, fin };
  }
`);
const playGame = (n, adv, engines, max) => vm.runInContext(`__playGame(${n}, ${adv}, ${JSON.stringify(engines)}, ${max || 800})`, ctx);

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

(async () => {
  console.log('game.test.js');

  await test('seededShuffle é determinístico e preserva todas as peças', () => {
    const base = []; ['blue','yellow','red','black','white'].forEach(c => { for (let i = 0; i < 12; i++) base.push(c); });
    const a = run(`seededShuffle(${JSON.stringify(base)}, 12345)`), b = run(`seededShuffle(${JSON.stringify(base)}, 12345)`);
    const c = run(`seededShuffle(${JSON.stringify(base)}, 12346)`);
    assert.deepStrictEqual(a, b, 'mesma semente deve dar a mesma ordem');
    assert.notDeepStrictEqual(a, c, 'sementes diferentes devem dar ordens diferentes');
    assert.deepStrictEqual([...a].sort(), [...base].sort(), 'não pode perder/criar peças');
  });

  await test('drawTiles online reembaralha o descarte igual em todos os aparelhos', () => {
    const res = [0, 1].map(() => run(`(() => { isP2P = true; bag = []; discard = ${JSON.stringify(Array(40).fill(0).map((_, i) => ['blue','red','black','white','yellow'][i % 5]))}; round = 3; stateVer = 17; return drawTiles(30).join(','); })()`));
    assert.strictEqual(res[0], res[1]);
    run('isP2P = false');
  });

  for (const n of [2, 3, 4]) for (const adv of [false, true]) {
    await test(`${n} jogadores, ${adv ? 'avançado' : 'normal'}: 10 partidas completas (todos jogam, 100 peças conservadas)`, async () => {
      for (let k = 0; k < 10; k++) {
        const r = await playGame(n, adv, ['v1']);
        assert.ok(!r.error, r.error + ' após ' + r.moves + ' jogadas');
        assert.strictEqual(r.tiles, 100, 'peças conservadas');
        assert.strictEqual(r.seats.length, n, 'todas as posições jogaram');
      }
    });
  }

  await test('resumo do fim de partida: um registro por rodada, tabela e gráfico coerentes, nomes escapados', async () => {
    run(`window.__nm = 0`);
    const r = await playGame(3, false, ['v1']);
    assert.ok(!r.error, r.error);
    const info = run(`(() => {
      players[1].name = '<img src=x onerror=alert(1)>';
      const h = buildEndSummaryHtml();
      return { h, rounds: scoreHistory.length, ok: scoreHistory.every(row => row.length === 3),
        mono: scoreHistory.every((row, i) => i === 0 || row.every((v, k) => v >= scoreHistory[i - 1][k] - 7)),
        finals: players.map(p => p.score) };
    })()`);
    assert.ok(info.rounds >= 2, 'deveria haver ao menos 2 rodadas (' + info.rounds + ')');
    assert.ok(info.ok, 'cada rodada guarda os pontos dos 3 jogadores');
    assert.strictEqual((info.h.match(/Rodada \d+/g) || []).length, info.rounds, 'uma linha por rodada');
    assert.ok(info.h.includes('<svg') && (info.h.match(/<polyline/g) || []).length === 3, 'gráfico com 3 linhas');
    assert.ok(!info.h.includes('<img'), 'nome do jogador não pode virar HTML');
    assert.ok(info.h.includes('&lt;img'), 'nome aparece escapado');
    const totals = (info.h.match(/class="es-total">(.*?)<\/tr>/) || [])[1] || '';
    info.finals.forEach(f => assert.ok(totals.includes('<td>' + f + '</td>'), 'total ' + f + ' na tabela'));
  });

  await test('resumo sem histórico (sessão antiga) não quebra: devolve vazio', () => {
    assert.strictEqual(run(`(() => { scoreHistory = []; return buildEndSummaryHtml(); })()`), '');
  });

  await test(`bateria bot: v4 x v1, ${BATTERY} partidas alternando quem começa (vitórias do v4 > 70%)`, async () => {
    let w4 = 0, tie = 0, err = 0, ok = 0;
    for (let i = 0; i < BATTERY; i++) {
      const v4first = i % 2 === 0;
      const r = await playGame(2, false, v4first ? ['v4', 'v1'] : ['v1', 'v4']);
      if (r.error) { err++; continue; }
      ok++;
      const s4 = v4first ? r.fin[0] : r.fin[1], s1 = v4first ? r.fin[1] : r.fin[0];
      if (s4 > s1) w4++; else if (s4 === s1) tie++;
    }
    const rate = 100 * w4 / ok;
    console.log(`       v4 ganhou ${w4}/${ok} (${rate.toFixed(1)}%), empates ${tie}, erros ${err}`);
    assert.strictEqual(err, 0, 'nenhuma partida pode travar');
    assert.ok(rate > 70, `v4 deveria vencer >70% (deu ${rate.toFixed(1)}%)`);
  });

  console.log(failures ? `\n${failures} teste(s) falharam` : '\ngame.test.js: OK');
  process.exit(failures ? 1 : 0);
})();
