    function pickFromFactory(fIdx, color, broadcast = true) {
      if (broadcast && !canPlayerAct()) return;
      if (!factories[fIdx] || !factories[fIdx].includes(color)) return;
      const count = factories[fIdx].filter(c => c === color).length;
      selected = { source: 'f', fIdx, color, count };
      stagedMove = null; // Reinicia destino prévio ao mudar seleção
      renderAll();

      if (broadcast && isP2P) {
        broadcastP2P({ type: 'ACTION', action: { type: 'PICK_FACTORY', fIdx, color } });
      }
    }

    function pickFromCenter(color, broadcast = true) {
      if (broadcast && !canPlayerAct()) return;
      const count = center.filter(c => c === color).length;
      if (count === 0) return;
      selected = { source: 'c', color, count };
      stagedMove = null;
      renderAll();

      if (broadcast && isP2P) {
        broadcastP2P({ type: 'ACTION', action: { type: 'PICK_CENTER', color } });
      }
    }

    // BGA Stage: escolhe onde colocar temporariamente para ver preview
    function stagePlacement(target, rIdx = null, broadcast = true) {
      if (broadcast && !canPlayerAct()) return;
      if (!selected) return;

      if (target === 'row') {
        const p = players[turn];
        const row = p.pattern[rIdx];
        if (row.count > 0 && row.color !== selected.color) return;
        if (validCols(p, rIdx, selected.color).length === 0) return;
        stagedMove = { target: 'row', rIdx };
      } else if (target === 'floor') {
        stagedMove = { target: 'floor' };
      }

      renderAll();

      if (broadcast && isP2P) {
        if (target === 'row') {
          broadcastP2P({ type: 'ACTION', action: { type: 'STAGE_ROW', rIdx } });
        } else {
          broadcastP2P({ type: 'ACTION', action: { type: 'STAGE_FLOOR' } });
        }
      }
    }

    // BGA Cancel: descarta seleção e preview
    function cancelMove(broadcast = true) {
      if (broadcast && !canPlayerAct()) return;
      selected = null;
      stagedMove = null;
      renderAll();

      if (broadcast && isP2P) {
        broadcastP2P({ type: 'ACTION', action: { type: 'CANCEL_MOVE' } });
      }
    }

    // BGA Confirm: efetiva o movimento escolhido e encerra o turno
    function confirmMove(broadcast = true) {
      if (broadcast && !canPlayerAct()) return;
      if (!selected || !stagedMove) return;

      const p = players[turn];
      commitDraft();

      if (stagedMove.target === 'row') {
        const rIdx = stagedMove.rIdx;
        const row = p.pattern[rIdx];
        row.color = selected.color;
        const space = row.size - row.count;
        const toRow = Math.min(space, selected.count);
        const overflow = selected.count - toRow;

        row.count += toRow;
        for (let i = 0; i < overflow; i++) {
          dropToFloor(p, selected.color);
        }
      } else if (stagedMove.target === 'floor') {
        for (let i = 0; i < selected.count; i++) {
          dropToFloor(p, selected.color);
        }
      }

      if (broadcast && isP2P) {
        broadcastP2P({ type: 'ACTION', action: { type: 'CONFIRM_MOVE' } });
      }

      movesPlayed++;
      if (isP2P && typeof p.clock === 'number') {
        p.clock = Math.min(CLOCK_MAX_MS, p.clock + CLOCK_INCREMENT_MS);
      }
      finishTurn();
    }

    function dropToFloor(p, color) {
      if (p.floor.length < 7) {
        p.floor.push(color);
      } else {
        discard.push(color);
      }
    }

    function commitDraft() {
      const p = players[turn];
      if (selected.source === 'f') {
        const remaining = factories[selected.fIdx].filter(c => c !== selected.color);
        center.push(...remaining);
        factories[selected.fIdx] = [];
      } else if (selected.source === 'c') {
        if (starterTileInCenter) {
          starterTileInCenter = false;
          nextStartPlayer = turn;
          dropToFloor(p, 'starter');
        }
        center = center.filter(c => c !== selected.color);
      }
    }

    function finishTurn() {
      selected = null;
      stagedMove = null;
      const emptyFactories = factories.every(f => f.length === 0);
      const emptyCenter = center.length === 0;

      if (emptyFactories && emptyCenter) {
        scoreRound();
      } else {
        turn = (turn + 1) % playerCount;
        triggerBotIfNeeded();
      }
      renderAll();
      saveSessionToStorage();
    }

    // ─────────────────────────────────────────────────────────────
    // VELOCIDADE DA ANIMAÇÃO DE PONTUAÇÃO (em milissegundos)
    // Altere este valor para tornar mais rápido ou mais lento:
    // ─────────────────────────────────────────────────────────────
    const SCORING_STEP_DELAY_MS = 900; // Tempo de exibição de cada peça pontuada

    // Pontuação e Parede com Animação Passo a Passo
    let isScoringAnimationActive = false;

    // ── Modo avançado: escolha da coluna ao pontuar ──
    let wallChoice = null;      // { playerId, r, cols, color, resolve } enquanto alguém escolhe
    let autoWallChoice = false; // testes/bots: escolhe sozinho para todos

    // Online (modo avançado nas salas de amigos): a coluna é decidida pelo ANFITRIÃO, que valida e confirma
    // (WALL_CHOICE) para todos; o dono da peça só envia o pedido (WALL_PICK). Assim os dois aparelhos ficam iguais.
    const WALL_CHOICE_TIMEOUT_MS = 60000; // se o dono não escolher em 60s, o anfitrião escolhe a melhor coluna
    const wallChoiceInbox = new Map();    // confirmações que chegaram antes de serem usadas
    const wallChoiceWaiters = new Map();  // convidado: aguardando a confirmação do anfitrião
    const wallPickInbox = new Map();      // anfitrião: pedidos dos convidados que chegaram antes
    const wallPickWaiters = new Map();    // anfitrião: aguardando o pedido de um convidado
    const wallKey = (rd, pid, r) => `${rd}:${pid}:${r}`;

    function pruneWallChoiceMaps() {
      [wallChoiceInbox, wallPickInbox].forEach(m => [...m.keys()].forEach(k => { if (Number(k.split(':')[0]) < round) m.delete(k); }));
    }

    function chooseWallColumn(p, r, color) {
      const cols = validCols(p, r, color);
      if (cols.length === 0) return Promise.resolve(-1);
      if (cols.length === 1) return Promise.resolve(cols[0]);
      if (autoWallChoice || (isBotMode && p.id === 1)) return Promise.resolve(bestWallCol(p, r, color, cols));

      if (!isP2P) {
        return new Promise(resolve => {
          wallChoice = { playerId: p.id, r, cols, color, resolve };
          showWallChoiceHint(p, r, color);
          renderBoards();
        });
      }

      const key = wallKey(round, p.id, r);
      const mine = (p.id === myP2PIndex);

      if (isHost) {
        return new Promise(resolve => {
          let timer = null;
          const decide = (c) => {
            clearTimeout(timer);
            wallPickWaiters.delete(key);
            const col = (Number.isInteger(c) && cols.includes(c)) ? c : bestWallCol(p, r, color, cols); // valida: pedido inválido => melhor coluna
            wallChoice = null;
            hideWallChoiceHint();
            broadcastP2P({ type: 'WALL_CHOICE', round, playerId: p.id, r, c: col });
            renderBoards();
            resolve(col);
          };
          if (mine) {
            wallChoice = { playerId: p.id, r, cols, color, resolve: decide };
            showWallChoiceHint(p, r, color);
            renderBoards();
          } else {
            showWallWaitHint(p, r, color);
            if (wallPickInbox.has(key)) { const c = wallPickInbox.get(key); wallPickInbox.delete(key); decide(c); return; }
            wallPickWaiters.set(key, decide);
            timer = setTimeout(() => decide(null), WALL_CHOICE_TIMEOUT_MS);
          }
        });
      }

      // convidado: só aplica o que o anfitrião confirmou
      return new Promise(resolve => {
        const finish = (c) => {
          wallChoiceWaiters.delete(key);
          wallChoice = null;
          hideWallChoiceHint();
          renderBoards();
          resolve(c);
        };
        if (wallChoiceInbox.has(key)) { const c = wallChoiceInbox.get(key); wallChoiceInbox.delete(key); resolve(c); return; }
        wallChoiceWaiters.set(key, finish);
        if (mine) {
          wallChoice = {
            playerId: p.id, r, cols, color,
            resolve: (c) => {
              // envia o pedido e aguarda a confirmação do anfitrião
              try { clientHostConn.send({ type: 'WALL_PICK', round, playerId: p.id, r, c }); } catch (e) { }
              showWallWaitHint(p, r, color, 'Confirmando...');
            }
          };
          showWallChoiceHint(p, r, color);
          renderBoards();
        } else {
          showWallWaitHint(p, r, color);
        }
      });
    }

    // Convidado recebeu a confirmação do anfitrião
    function receiveWallChoice(msg) {
      if (!msg || !Number.isInteger(msg.round) || !Number.isInteger(msg.playerId) || !Number.isInteger(msg.r) || !Number.isInteger(msg.c)) return;
      if (msg.r < 0 || msg.r > 4 || msg.c < 0 || msg.c > 4) return;
      const key = wallKey(msg.round, msg.playerId, msg.r);
      const w = wallChoiceWaiters.get(key);
      if (w) w(msg.c); else wallChoiceInbox.set(key, msg.c);
    }

    // Anfitrião recebeu o pedido de um convidado (só vale do dono da peça)
    function receiveWallPick(seat, msg) {
      if (!msg || msg.playerId !== seat || !Number.isInteger(msg.round) || !Number.isInteger(msg.r) || !Number.isInteger(msg.c)) return;
      if (msg.r < 0 || msg.r > 4 || msg.c < 0 || msg.c > 4) return;
      const key = wallKey(msg.round, msg.playerId, msg.r);
      const w = wallPickWaiters.get(key);
      if (w) w(msg.c); else wallPickInbox.set(key, msg.c);
    }

    // Se o anfitrião caiu no meio da escolha e este aparelho assumiu a sala, passa a decidir as escolhas pendentes
    function rearmWallChoicesAsHost() {
      wallChoiceWaiters.forEach((finish, key) => {
        const [rd, pid, r] = key.split(':').map(Number);
        const p = players[pid];
        if (!p || !p.pattern[r]) return;
        const color = p.pattern[r].color;
        const cols = validCols(p, r, color);
        let t = null;
        const decide = (c) => {
          clearTimeout(t);
          wallPickWaiters.delete(key);
          const col = (Number.isInteger(c) && cols.includes(c)) ? c : bestWallCol(p, r, color, cols);
          broadcastP2P({ type: 'WALL_CHOICE', round: rd, playerId: pid, r, c: col });
          finish(col);
        };
        t = setTimeout(() => decide(null), WALL_CHOICE_TIMEOUT_MS);
        wallPickWaiters.set(key, decide);
        if (wallChoice && wallChoice.playerId === pid && wallChoice.r === r) wallChoice.resolve = decide;
      });
    }

    function pickWallColumn(playerId, r, c) {
      if (!wallChoice || wallChoice.playerId !== playerId || wallChoice.r !== r || !wallChoice.cols.includes(c)) return;
      const w = wallChoice;
      wallChoice = null;
      hideWallChoiceHint();
      w.resolve(c);
      renderBoards();
    }

    const COLOR_LABEL_PT = { blue: 'azul', yellow: 'amarela', red: 'vermelha', black: 'preta', white: 'branca' };
    function showWallChoiceHint(p, r, color) {
      const box = document.getElementById('wallChoiceHint');
      if (!box) return;
      const nm = document.getElementById('wallChoiceName');
      const tx = document.getElementById('wallChoiceText');
      const sw = document.getElementById('wallChoiceSwatch');
      if (nm) nm.textContent = p.name || `Jogador ${p.id + 1}`;
      if (tx) tx.textContent = `Sua vez: escolha a coluna (${COLOR_LABEL_PT[color] || ''}, linha ${r + 1})`;
      if (sw) sw.className = `tile ${color}`;
      box.style.display = 'flex';
    }
    function showWallWaitHint(p, r, color, text) {
      showWallChoiceHint(p, r, color);
      const tx = document.getElementById('wallChoiceText');
      if (tx) tx.textContent = text || `Escolhendo a coluna (${COLOR_LABEL_PT[color] || ''}, linha ${r + 1})`;
      const nm = document.getElementById('wallChoiceName');
      if (nm) nm.textContent = text ? '' : (p.name || '');
    }
    function hideWallChoiceHint() {
      const box = document.getElementById('wallChoiceHint');
      if (box) box.style.display = 'none';
    }

    async function scoreRound() {
      if (isScoringAnimationActive) return;
      isScoringAnimationActive = true;
      pruneWallChoiceMaps();
      let gameEnds = false;

      // Desativa interação temporária
      selected = null;
      renderAll();

      for (let pIdx = 0; pIdx < players.length; pIdx++) {
        const p = players[pIdx];

        // 1. Pontuação linha a linha das completas
        for (let r = 0; r < 5; r++) {
          const row = p.pattern[r];
          if (row.count === row.size) {
            const color = row.color;
            // modo avançado: a pessoa escolhe a coluna (o bot escolhe sozinho); modo normal: coluna fixa da cor
            const c = advancedMode ? await chooseWallColumn(p, r, color) : WALL_LAYOUT[r].indexOf(color);
            if (c < 0) {
              // nenhuma coluna válida sobrou (raro): as peças da linha vão para o descarte, sem pontos
              for (let i = 0; i < row.size; i++) discard.push(color);
              row.count = 0;
              row.color = null;
              renderBoards();
              continue;
            }

            p.wall[r][c] = true;
            if (p.wallColors) p.wallColors[r][c] = color;
            const ptsGained = calculateTileScore(p.wall, r, c);
            p.score += ptsGained;

            // Move peças excedentes para o descarte
            for (let i = 0; i < row.size - 1; i++) discard.push(color);
            row.count = 0;
            row.color = null;

            if (p.wall[r].every(v => v === true)) {
              gameEnds = true;
            }

            // Atualiza renderização para mostrar azulejo na parede e linha limpa
            renderBoards();
            renderTileCounts();

            // Efeito visual com o número bem grande dentro da peça
            animateScoreStep(p.id, r, c, `+${ptsGained}`);
            await waitMs(SCORING_STEP_DELAY_MS);
          }
        }

        // 2. Penalidades da linha de chão
        let pen = 0;
        p.floor.forEach((item, idx) => {
          if (idx < FLOOR_PENALTIES.length) pen += FLOOR_PENALTIES[idx];
          if (item !== 'starter') discard.push(item);
        });

        if (pen < 0) {
          p.score = Math.max(0, p.score + pen);
          p.floor = [];
          renderBoards();
          renderTileCounts();
          animateFloorPenalty(p.id, `${pen}`);
          await waitMs(Math.round(SCORING_STEP_DELAY_MS * 0.8));
        } else {
          p.floor = [];
        }
      }

      await waitMs(500);
      isScoringAnimationActive = false;

      if (gameEnds) {
        endGame();
      } else {
        round++;
        startRound();
        renderAll();
        triggerBotIfNeeded();
        saveSessionToStorage();
      }
    }

    function waitMs(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function animateScoreStep(pId, r, c, label) {
      const cell = document.getElementById(`wallCell_${pId}_${r}_${c}`);
      const ptsEl = document.getElementById(`playerPts_${pId}`);

      if (cell) {
        cell.classList.add('scoring-highlight');
        // Insere o texto grande dentro da própria peça
        const prevText = cell.textContent;
        cell.textContent = label;

        setTimeout(() => {
          cell.classList.remove('scoring-highlight');
          cell.textContent = prevText;
        }, Math.max(700, SCORING_STEP_DELAY_MS - 150));
      }

      if (ptsEl) {
        ptsEl.classList.add('pts-bump');
        setTimeout(() => ptsEl.classList.remove('pts-bump'), 500);
      }
    }

    function animateFloorPenalty(pId, label) {
      const ptsEl = document.getElementById(`playerPts_${pId}`);
      if (ptsEl) {
        ptsEl.classList.add('pts-bump');
        ptsEl.style.color = 'var(--accent-red)';
        setTimeout(() => {
          ptsEl.classList.remove('pts-bump');
          ptsEl.style.color = '';
        }, 700);

        const rect = ptsEl.getBoundingClientRect();
        const badge = document.createElement('div');
        badge.className = 'scoring-floating-badge';
        badge.textContent = label;
        badge.style.color = 'var(--accent-red)';
        badge.style.left = `${rect.left + rect.width / 2}px`;
        badge.style.top = `${rect.top}px`;
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 1100);
      }
    }

    function calculateTileScore(wall, r, c) {
      let hCount = 0;
      for (let i = c - 1; i >= 0 && wall[r][i]; i--) hCount++;
      for (let i = c + 1; i < 5 && wall[r][i]; i++) hCount++;

      let vCount = 0;
      for (let i = r - 1; i >= 0 && wall[i][c]; i--) vCount++;
      for (let i = r + 1; i < 5 && wall[i][c]; i++) vCount++;

      if (hCount > 0 && vCount > 0) return (hCount + 1) + (vCount + 1);
      if (hCount > 0) return hCount + 1;
      if (vCount > 0) return vCount + 1;
      return 1;
    }

    function animateBonusStep(pId, cells, label, badgeText) {
      cells.forEach(({ r, c }) => {
        const cell = document.getElementById(`wallCell_${pId}_${r}_${c}`);
        if (cell) {
          cell.classList.add('bonus-highlight');
          const prevText = cell.textContent;
          cell.textContent = label;
          setTimeout(() => {
            cell.classList.remove('bonus-highlight');
            cell.textContent = prevText;
          }, Math.max(800, SCORING_STEP_DELAY_MS));
        }
      });

      const ptsEl = document.getElementById(`playerPts_${pId}`);
      if (ptsEl) {
        ptsEl.classList.add('bonus-pts-bump');
        setTimeout(() => ptsEl.classList.remove('bonus-pts-bump'), 600);

        if (badgeText) {
          const rect = ptsEl.getBoundingClientRect();
          const badge = document.createElement('div');
          badge.className = 'bonus-floating-badge';
          badge.textContent = badgeText;
          badge.style.left = `${rect.left + rect.width / 2}px`;
          badge.style.top = `${rect.top}px`;
          document.body.appendChild(badge);
          setTimeout(() => badge.remove(), 1400);
        }
      }
    }

    async function animateEndGameBonuses() {
      isScoringAnimationActive = true;

      // Anima bônus jogador por jogador na ordem oficial: Linha (+2), Coluna (+7), Cores completas (+10)
      for (let pIdx = 0; pIdx < players.length; pIdx++) {
        const p = players[pIdx];
        const initialBoardScore = p.score;
        let lineBonus = 0;
        let colBonus = 0;
        let colorBonus = 0;

        // 1. Linhas completas (+2)
        for (let r = 0; r < 5; r++) {
          if (p.wall[r].every(v => v)) {
            const cells = [];
            for (let c = 0; c < 5; c++) cells.push({ r, c });

            p.score += 2;
            lineBonus += 2;
            renderBoards();
            animateBonusStep(p.id, cells, '+2', 'Linha +2');
            await waitMs(SCORING_STEP_DELAY_MS + 250);
          }
        }

        // 2. Colunas completas (+7)
        for (let c = 0; c < 5; c++) {
          let full = true;
          for (let r = 0; r < 5; r++) {
            if (!p.wall[r][c]) { full = false; break; }
          }
          if (full) {
            const cells = [];
            for (let r = 0; r < 5; r++) cells.push({ r, c });

            p.score += 7;
            colBonus += 7;
            renderBoards();
            animateBonusStep(p.id, cells, '+7', 'Coluna +7');
            await waitMs(SCORING_STEP_DELAY_MS + 250);
          }
        }

        // 3. Todas as 5 peças de uma mesma cor (+10)
        for (let colorIdx = 0; colorIdx < COLORS.length; colorIdx++) {
          const clr = COLORS[colorIdx];
          const full = colorPlacedCount(p, clr) === 5;
          if (full) {
            const cells = [];
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 5; c++) {
                if (p.wall[r][c] && wallCellColor(p, r, c) === clr) cells.push({ r, c });
              }
            }

            p.score += 10;
            colorBonus += 10;
            renderBoards();
            animateBonusStep(p.id, cells, '+10', 'Cor +10');
            await waitMs(SCORING_STEP_DELAY_MS + 250);
          }
        }

        p.boardScore = initialBoardScore;
        p.lineBonus = lineBonus;
        p.colBonus = colBonus;
        p.colorBonus = colorBonus;
        p.finalBonus = lineBonus + colBonus + colorBonus;
      }

      await waitMs(500);
      isScoringAnimationActive = false;

      // Exibe modal final com os vencedores e pontuações calculadas
      // Regra oficial: empate em pontos => vence quem completou mais linhas horizontais; persistindo, dividem a vitória
      const sorted = [...players].sort((a, b) => (b.score - a.score) || (completedRows(b) - completedRows(a)));
      const rankOf = sorted.map((p, i) => {
        let r = i;
        while (r > 0 && sorted[r - 1].score === p.score && completedRows(sorted[r - 1]) === completedRows(p)) r--;
        return r + 1;
      });
      const tiedOnScore = sorted.length > 1 && sorted[0].score === sorted[1].score;
      const modal = document.getElementById('endModal');
      const desc = document.getElementById('winnerDesc');

      desc.innerHTML = `
        <div class="endgame-list">
          ${sorted.map((p, idx) => {
        const isWinner = rankOf[idx] === 1;
        const rankLabel = `${rankOf[idx]}º`;
        const name = escapeHtml(p.name || (isBotMode ? (p.id === 1 ? 'Bot' : 'Você') : `Jogador ${p.id + 1}`));
        const boardPts = (p.boardScore !== undefined) ? p.boardScore : (p.score - (p.finalBonus || 0));
        const lBonus = p.lineBonus || 0;
        const cBonus = p.colBonus || 0;
        const clrBonus = p.colorBonus || 0;
        const totBonus = p.finalBonus || 0;

        return `
              <div class="endgame-item ${isWinner ? 'winner' : ''}">
                <div class="endgame-header-row">
                  <div class="endgame-left">
                    <span class="endgame-rank">${rankLabel}</span>
                    <span class="endgame-name">${name}</span>
                  </div>
                  <div class="endgame-right">
                    <span class="endgame-score">${p.score} pts</span>
                    ${totBonus > 0 ? `<span class="endgame-bonus">+${totBonus} bônus</span>` : ''}
                  </div>
                </div>
                <div class="endgame-breakdown">
                  <span class="endgame-tag board" title="Pontos conquistados durante as rodadas">Tabuleiro: <strong>${boardPts}</strong></span>
                  ${lBonus > 0 ? `<span class="endgame-tag bonus-tag" title="Bônus por linhas horizontais completas">Linha: <strong>+${lBonus}</strong></span>` : ''}
                  ${cBonus > 0 ? `<span class="endgame-tag bonus-tag" title="Bônus por colunas verticais completas">Coluna: <strong>+${cBonus}</strong></span>` : ''}
                  ${clrBonus > 0 ? `<span class="endgame-tag bonus-tag" title="Bônus por todas as 5 peças de uma cor">Cor: <strong>+${clrBonus}</strong></span>` : ''}
                  ${tiedOnScore ? `<span class="endgame-tag" title="Critério de desempate: linhas horizontais completas">Linhas completas: <strong>${completedRows(p)}</strong></span>` : ''}
                </div>
              </div>
            `;
      }).join('')}
        </div>
        ${tiedOnScore ? `<div style="margin-top:10px;font-size:11px;color:#94a3b8;">Empate em pontos: desempate por linhas horizontais completas${rankOf[0] === rankOf[1] ? ' (persistiu o empate: vitória dividida)' : ''}.</div>` : ''}
      `;
      modal.style.display = 'flex';
      matchFinished = true;
      recordMatchResult('normal');
      saveSessionToStorage();
    }

    // Linhas horizontais completas da parede (critério de desempate do Azul)
    function completedRows(p) {
      return (p.wall || []).filter(row => row.every(v => v === true)).length;
    }

    async function endGame() {
      await animateEndGameBonuses();
    }

    function closeModalAndRestart() {
      const modal = document.getElementById('endModal');
      if (modal) modal.style.display = 'none';
      const title = modal ? modal.querySelector('h2') : null;
      if (title) title.textContent = 'Fim de Jogo';

      if (hasMatchEndedByAbandon || isP2P) {
        hasMatchEndedByAbandon = false;
        confirmExitGame();
      } else {
        restartLocalGame();
      }
    }

