    /* =====================================================================
       INTELIGÊNCIA ARTIFICIAL DO BOT (3 NÍVEIS: FÁCIL, MÉDIO, DIFÍCIL)
       ===================================================================== */

    // Calcula penalidade exata da linha de chão considerando espaços restantes
    function calcExactFloorPenalty(currentFloorCount, newItemsCount) {
      let penalty = 0;
      for (let i = 0; i < newItemsCount; i++) {
        const slot = currentFloorCount + i;
        if (slot < FLOOR_PENALTIES.length) {
          penalty += FLOOR_PENALTIES[slot]; // valores negativos: -1, -1, -2, -2, -2, -3, -3
        } else {
          penalty += -3;
        }
      }
      return penalty;
    }

    // Verifica se um jogador pode legalmente alocar uma cor em uma linha padrão
    function canPlayerPlaceInRow(p, color, r) {
      const wallCol = WALL_LAYOUT[r].indexOf(color);
      if (p.wall[r][wallCol]) return false;
      const row = p.pattern[r];
      if (row.count > 0 && row.color !== color) return false;
      if (row.count >= row.size) return false;
      return true;
    }

    // Calcula o espaço máximo que um jogador possui em linhas padrão para uma cor
    function getPlayerMaxSpaceForColor(p, color) {
      let maxSpace = 0;
      for (let r = 0; r < 5; r++) {
        if (canPlayerPlaceInRow(p, color, r)) {
          const sp = p.pattern[r].size - p.pattern[r].count;
          if (sp > maxSpace) maxSpace = sp;
        }
      }
      return maxSpace;
    }

    // Contagem de azulejos visíveis atualmente na mesa (fábricas + centro)
    function getVisibleTileCounts() {
      const counts = { blue: 0, yellow: 0, red: 0, black: 0, white: 0 };
      factories.forEach(factory => {
        if (factory) factory.forEach(c => { if (counts[c] !== undefined) counts[c]++; });
      });
      center.forEach(c => {
        if (counts[c] !== undefined) counts[c]++;
      });
      return counts;
    }

    // Contagem de azulejos ainda não pontuados nem descartados (disponíveis no futuro: sacola + descarte)
    function getRemainingUnplayedTileCounts() {
      const remaining = { blue: 20, yellow: 20, red: 20, black: 20, white: 20 };
      players.forEach(p => {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (p.wall[r][c]) {
              const color = WALL_LAYOUT[r][c];
              remaining[color]--;
            }
          }
          if (p.pattern[r].count > 0 && p.pattern[r].color) {
            remaining[p.pattern[r].color] -= p.pattern[r].count;
          }
        }
        p.floor.forEach(c => {
          if (remaining[c] !== undefined) remaining[c]--;
        });
      });
      factories.forEach(f => {
        if (f) f.forEach(c => { if (remaining[c] !== undefined) remaining[c]--; });
      });
      center.forEach(c => {
        if (remaining[c] !== undefined) remaining[c]--;
      });
      return remaining;
    }

    // Identifica colunas que o jogador já completou ou que estão mais avançadas
    function getColumnFillCounts(p) {
      const colCounts = [0, 0, 0, 0, 0];
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 5; r++) {
          if (p.wall[r][c]) colCounts[c]++;
        }
      }
      return colCounts;
    }

    // Pontuação projetada total (pontos atuais + bônus de fim de jogo atuais)
    function calculateProjectedTotalScore(p) {
      let total = p.score;
      // Linhas (+2)
      for (let r = 0; r < 5; r++) {
        if (p.wall[r].every(v => v)) total += 2;
      }
      // Colunas (+7)
      for (let c = 0; c < 5; c++) {
        let full = true;
        for (let r = 0; r < 5; r++) {
          if (!p.wall[r][c]) { full = false; break; }
        }
        if (full) total += 7;
      }
      // Cores (+10)
      COLORS.forEach(color => {
        let full = true;
        for (let r = 0; r < 5; r++) {
          const c = WALL_LAYOUT[r].indexOf(color);
          if (!p.wall[r][c]) { full = false; break; }
        }
        if (full) total += 10;
      });
      return total;
    }

    // ─────────────────────────────────────────────────────────────
    // NÍVEL 1: FÁCIL (Iniciante / Casual)
    // Jogo amigável e descontraído. Foca apenas nas próprias linhas,
    // não avalia adjacências na parede, não calcula colunas, comete
    // pequenos erros e nunca tenta bloquear o adversário.
    // ─────────────────────────────────────────────────────────────
    function evaluateMoveEasy(bot, opt, target, rIdx) {
      let score = 0;
      const isStarter = (opt.source === 'c' && starterTileInCenter);
      const starterCount = isStarter ? 1 : 0;

      if (target === 'row') {
        const row = bot.pattern[rIdx];
        const space = row.size - row.count;
        const placed = Math.min(space, opt.count);
        const overflow = opt.count - placed;
        const willComplete = (row.count + placed === row.size);

        if (willComplete) {
          score += 8; // Bônus fixo simples ao fechar
        } else {
          score += placed * 1.5;
        }

        // Penalidade casual de chão
        const floorPen = calcExactFloorPenalty(bot.floor.length, overflow + starterCount);
        score += floorPen * 1.2;
      } else {
        // Chão direto
        const floorPen = calcExactFloorPenalty(bot.floor.length, opt.count + starterCount);
        score += floorPen * 1.5 - 6;
      }

      // Adiciona ruído aleatório para simular jogador humano casual
      score += (Math.random() * 6 - 3);
      return score;
    }

    // ─────────────────────────────────────────────────────────────
    // NÍVEL 2: MÉDIO (Estratégico / Equilibrado)
    // Joga com boa técnica para o próprio tabuleiro:
    // Avalia adjacências imediatas na parede, prioriza linhas rápidas,
    // busca colunas e evita fortemente penalidades de chão.
    // Não lê o tabuleiro do oponente nem faz hate draft.
    // ─────────────────────────────────────────────────────────────
    function evaluateMoveMedium(bot, opt, target, rIdx) {
      let score = 0;
      const isStarter = (opt.source === 'c' && starterTileInCenter);
      const starterCount = isStarter ? 1 : 0;

      if (target === 'row') {
        const row = bot.pattern[rIdx];
        const space = row.size - row.count;
        const placed = Math.min(space, opt.count);
        const overflow = opt.count - placed;
        const willComplete = (row.count + placed === row.size);
        const wallCol = WALL_LAYOUT[rIdx].indexOf(opt.color);

        if (willComplete) {
          const wallPts = calculateTileScore(bot.wall, rIdx, wallCol);
          score += 14 + (wallPts * 3.0);

          // Prioridade das 3 colunas centrais (efeito âncora e ramificação)
          if (wallCol === 2) score += 3.0;
          else if (wallCol === 1 || wallCol === 3) score += 1.8;
          else if (round <= 2) score -= 1.5;

          // Bônus se ajuda a fechar coluna (+7 no fim do jogo)
          let colFilled = 0;
          for (let r = 0; r < 5; r++) {
            if (r === rIdx || bot.wall[r][wallCol]) colFilled++;
          }
          score += colFilled * 1.8;
        } else {
          // Progresso parcial: prefere linhas superiores (0, 1, 2)
          const upperBonus = (4 - rIdx) * 1.0;
          score += 4.0 + (placed * 2.2) + upperBonus - (space - placed) * 1.0;
          if (wallCol === 2) score += 1.5;
        }

        const floorPen = calcExactFloorPenalty(bot.floor.length, overflow + starterCount);
        score += floorPen * 3.8; // Evita fortemente estouro de chão

        if (isStarter) {
          score -= 0.5; // Custo leve do token
        }
      } else {
        const floorPen = calcExactFloorPenalty(bot.floor.length, opt.count + starterCount);
        score += floorPen * 4.2 - 16;
      }

      // Pequeno desempate
      score += Math.random() * 0.4;
      return score;
    }

    // ─────────────────────────────────────────────────────────────
    // NÍVEL 3: DIFÍCIL (Mestre WSBG / Estratégia Avançada de Campeonato)
    // 1. Macroestratégia: 2 Linhas + 1 Coluna (preferência Coluna #2, evita bordas colunas 0 e 4).
    // 2. Alinhamento vertical: Linhas 4 e 5 NUNCA desalinhadas; linha 3 alinhada se incompleta.
    // 3. Foco em progresso nas linhas 4 e 5 no R1; aceita negativos parciais se o oponente não pontuar R5.
    // 4. Token de 1º jogador com alto valor estratégico (iniciativa na próxima rodada, controle de cores críticas).
    // 5. Forcing moves, criação de lotes tóxicos defensivos e controle de paridade de turnos.
    // 6. Free colors: cores que o oponente não pode alocar (guardadas ou usadas para forçar jogadas).
    // 7. Rastreamento e contagem de azulejos na sacola/descarte para evitar esperar peças impossíveis.
    // 8. Round 5 determinístico: cálculo analítico do caminho para a vitória vs forçar prorrogação.
    // ─────────────────────────────────────────────────────────────
    function evaluateMoveHard(bot, opp, opt, target, rIdx) {
      let score = 0;
      const isStarter = (opt.source === 'c' && starterTileInCenter);
      const starterFloorCount = isStarter ? 1 : 0;
      const visibleCounts = getVisibleTileCounts();
      const remainingTiles = getRemainingUnplayedTileCounts();
      const botColCounts = getColumnFillCounts(bot);
      const oppColCounts = opp ? getColumnFillCounts(opp) : [0, 0, 0, 0, 0];

      // Determina coluna-alvo prioritária do bot (preferência por colunas 1 e 2, especialmente #2)
      let primaryTargetCol = 1;
      let bestColWeight = -1;
      [1, 2, 3].forEach(c => {
        let weight = botColCounts[c] * 2;
        if (c === 1) weight += 1.0; // Minor preference para coluna #2 (índice 1)
        if (weight > bestColWeight) {
          bestColWeight = weight;
          primaryTargetCol = c;
        }
      });

      // ─── 1. VALOR PRÓPRIO NO TABULEIRO DO BOT ───
      if (target === 'row') {
        const row = bot.pattern[rIdx];
        const space = row.size - row.count;
        const placed = Math.min(space, opt.count);
        const overflow = opt.count - placed;
        const willComplete = (row.count + placed === row.size);
        const wallCol = WALL_LAYOUT[rIdx].indexOf(opt.color);

        // MACRO: Evitar extremidades (especialmente borda direita, col 4)
        if (wallCol === 4) {
          score -= (round <= 2) ? 6.5 : 3.5;
        } else if (wallCol === 0) {
          score -= (round <= 2) ? 4.0 : 2.5;
        } else if (wallCol === 1) {
          score += 4.5; // Coluna #2 preferencial
        } else if (wallCol === 2) {
          score += 3.8; // Coluna central
        } else if (wallCol === 3) {
          score += 2.5;
        }

        // ALINHAMENTO DE LINHAS: Linhas 4 e 5 nunca desalinhadas; linha 3 alinhada se incompleta
        const row4Col = (bot.pattern[3].count > 0) ? WALL_LAYOUT[3].indexOf(bot.pattern[3].color) : -1;
        const row5Col = (bot.pattern[4].count > 0) ? WALL_LAYOUT[4].indexOf(bot.pattern[4].color) : -1;

        if (rIdx === 4 && row4Col !== -1 && !willComplete) {
          if (wallCol === row4Col) score += 7.5;
          else score -= 15.0; // Nunca desalinhar row 4 e 5
        } else if (rIdx === 3 && row5Col !== -1 && !willComplete) {
          if (wallCol === row5Col) score += 7.5;
          else score -= 15.0; // Nunca desalinhar row 4 e 5
        } else if (rIdx === 2 && !willComplete) {
          const anchorCol = (row5Col !== -1) ? row5Col : row4Col;
          if (anchorCol !== -1) {
            if (wallCol === anchorCol) score += 4.0;
            else score -= 5.0;
          }
        }

        if (willComplete) {
          const immediatePts = calculateTileScore(bot.wall, rIdx, wallCol);
          score += 16 + (immediatePts * 3.8);

          // Efeito âncora e conexões cruzadas
          const hasHNeighbor = (wallCol > 0 && bot.wall[rIdx][wallCol - 1]) || (wallCol < 4 && bot.wall[rIdx][wallCol + 1]);
          const hasVNeighbor = (rIdx > 0 && bot.wall[rIdx - 1][wallCol]) || (rIdx < 4 && bot.wall[rIdx + 1][wallCol]);
          if (hasHNeighbor && hasVNeighbor) score += 4.5;
          else if (hasHNeighbor || hasVNeighbor) score += 2.0;

          // Progresso de Colunas (+7 pontos de fim de jogo)
          let filledColCount = 0;
          for (let r = 0; r < 5; r++) {
            if (r === rIdx || bot.wall[r][wallCol]) filledColCount++;
          }
          if (filledColCount === 5) score += 14.0;
          else if (filledColCount === 4) score += 7.0;
          else if (filledColCount === 3) score += 3.5;

          // Bônus de cor (+10)
          let colorCountOnWall = 0;
          for (let r = 0; r < 5; r++) {
            const c = WALL_LAYOUT[r].indexOf(opt.color);
            if (r === rIdx || bot.wall[r][c]) colorCountOnWall++;
          }
          if (colorCountOnWall === 5) score += 18.0;
          else if (colorCountOnWall === 4) score += 5.0;

          // Fim de jogo em linha completa
          let willEndGame = true;
          for (let c = 0; c < 5; c++) {
            if (c !== wallCol && !bot.wall[rIdx][c]) {
              willEndGame = false;
              break;
            }
          }
          if (willEndGame) {
            const botProj = calculateProjectedTotalScore(bot) + immediatePts + 2;
            const oppProj = opp ? calculateProjectedTotalScore(opp) : 0;
            if (botProj > oppProj) score += 25.0;
            else score -= 30.0;
          }
        } else {
          // Progresso parcial
          if (round === 1) {
            if (rIdx === 4) score += 9.5 + (placed * 2.5); // Linha 5 prioridade máxima no R1
            else if (rIdx === 3) score += 7.5 + (placed * 2.2);
            else if (rIdx === 2) score += 3.0 + (placed * 1.5);
            else score += 1.5 + (placed * 1.0);
          } else {
            if (rIdx === 0) score += 3.5;
            else if (rIdx === 1) score += 3.0;
            else if (rIdx === 2) score += 2.2;
            else {
              if (row.count === 0 && placed < 3) score -= 3.5;
              else score += 3.0 + (placed * 2.0);
            }
          }

          // Flexibilidade: não travar linhas 1 e 2
          const row1Free = (bot.pattern[0].count === 0);
          const row2Free = (bot.pattern[1].count === 0);
          if ((rIdx === 3 || rIdx === 4) && !row1Free && !row2Free) {
            score -= 2.5;
          }
        }

        // Penalidade de chão calibrada
        const floorPen = calcExactFloorPenalty(bot.floor.length, overflow + starterFloorCount);
        if (round === 1 && rIdx >= 3) {
          score += floorPen * 2.0; // Aceita negativos leves em prol de progredir linhas 4/5
        } else {
          score += floorPen * 4.5;
        }

        // ─── VALOR DO TOKEN DE 1º JOGADOR (INICIATIVA) ───
        if (isStarter) {
          // Ter o token de primeiro jogador é muito importante no Azul:
          // 1. Dá iniciativa para escolher a melhor fábrica no próximo round antes do oponente.
          // 2. Protege o bot de hate-draft na próxima rodada em cores vitais.
          // 3. Permite reagir às escolhas do oponente e controlar o fluxo do jogo.
          let starterValue = 7.0; // Alto valor base (supera largamente a penalidade de -1 ponto)

          if (round === 1) {
            starterValue += 3.0; // No R1, tomar o 1º jogador e selecionar a coluna reagindo ao oponente é crucial
          } else if (round >= 4) {
            starterValue += 2.0; // No late game, controlar o primeiro movimento define fechamento de colunas
          }

          // Se há cores críticas disputadas pelo bot ou pelo oponente para a próxima rodada
          const criticalColorNeeded = bot.pattern.some(p => p.count > 0 && p.count < p.size);
          if (criticalColorNeeded) starterValue += 2.5;

          score += starterValue;
        }
      } else {
        // Chão direto
        const floorPen = calcExactFloorPenalty(bot.floor.length, opt.count + starterFloorCount);
        score += floorPen * 5.0 - 25;
        if (isStarter) score += 6.0; // Mesmo indo pro chão, o token de 1º jogador tem alto valor
      }

      // ─── 2. HATE DRAFTING E LEITURA DO ADVERSÁRIO (DENY) ───
      if (opp) {
        let oppDenialValue = 0;
        let oppRowsWithColor = 0;

        for (let r = 0; r < 5; r++) {
          if (canPlayerPlaceInRow(opp, opt.color, r)) {
            oppRowsWithColor++;
            const oppRow = opp.pattern[r];
            const oppWallCol = WALL_LAYOUT[r].indexOf(opt.color);
            const oppNeeded = oppRow.size - oppRow.count;

            if (oppRow.count > 0 && opt.count >= oppNeeded) {
              const oppPts = calculateTileScore(opp.wall, r, oppWallCol);
              let oppVal = 14 + (oppPts * 3.5);

              let oppFilledCols = 0;
              for (let ro = 0; ro < 5; ro++) {
                if (ro === r || opp.wall[ro][oppWallCol]) oppFilledCols++;
              }
              if (oppFilledCols === 5) oppVal += 12.0;
              else if (oppFilledCols === 4) oppVal += 5.5;

              if (r === 4) oppVal += 7.5;
              else if (r === 3) oppVal += 5.0;

              if (oppVal > oppDenialValue) oppDenialValue = oppVal;
            }
          }
        }

        // Identifica cor livre (o oponente não pode usar em nenhuma linha)
        const isFreeColorForBot = (oppRowsWithColor === 0);
        if (isFreeColorForBot) {
          if (opt.source === 'f') score -= 1.5; // Cor segura na fábrica, não precisa se apressar
        } else {
          score += oppDenialValue * 0.8;
        }

        // ─── 3. FORCING MOVES E CONTROLE DE PARIDADE ───
        const activeFactories = factories.filter(f => f && f.length > 0).length;
        const centerColors = [...new Set(center)];
        const remainingPicks = activeFactories + centerColors.length;

        centerColors.forEach(cColor => {
          const cCount = center.filter(c => c === cColor).length;
          const oppSpace = getPlayerMaxSpaceForColor(opp, cColor);
          if (cCount > oppSpace && cCount >= 3) {
            const oppDump = cCount - oppSpace;
            const oppPenalty = calcExactFloorPenalty(opp.floor.length, oppDump);
            const parityFavorsBot = (remainingPicks % 2 === 1);

            if (opt.source === 'f') {
              const fCountOther = factories[opt.fIdx]?.filter(c => c === cColor).length || 0;
              if (fCountOther > 0 && parityFavorsBot) {
                score += Math.abs(oppPenalty) * 1.8;
              }
            }

            if (parityFavorsBot && opt.color !== cColor) {
              score += Math.abs(oppPenalty) * 1.4;
            }
          }
        });

        // Autodefesa contra armadilhas de paridade
        centerColors.forEach(cColor => {
          const cCount = center.filter(c => c === cColor).length;
          const botSpace = getPlayerMaxSpaceForColor(bot, cColor);
          if (cCount > botSpace && cCount >= 2) {
            const parityTrapsBot = (remainingPicks % 2 === 0);
            if (parityTrapsBot && opt.color !== cColor) {
              score -= 9.0;
            }
          }
        });

        // ─── 4. ROUND 5: CÁLCULO DETERMINÍSTICO E PATH TO VICTORY ───
        if (round >= 5) {
          const botProjected = calculateProjectedTotalScore(bot);
          const oppProjected = calculateProjectedTotalScore(opp);
          const scoreDiff = botProjected - oppProjected;

          let oppCol4Threat = 0;
          for (let c = 0; c < 5; c++) {
            if (oppColCounts[c] >= 4) oppCol4Threat++;
          }
          if (oppCol4Threat >= 2) score += oppDenialValue * 0.5;

          if (scoreDiff > 3) {
            if (target === 'floor' || (target === 'row' && overflow > 0)) {
              score -= 10.0;
            }
          } else if (scoreDiff < -3) {
            score += oppDenialValue * 1.0;
          }
        }
      }

      // ─── 5. CONTAGEM DE AZULEJOS RESTANTES (TILE TRACKING) ───
      const remainingColorSupply = remainingTiles[opt.color] || 0;
      if (target === 'row') {
        const row = bot.pattern[rIdx];
        const space = row.size - row.count;
        const placed = Math.min(space, opt.count);
        const neededAfterMove = space - placed;

        if (neededAfterMove > 0) {
          const visibleTableColor = (visibleCounts[opt.color] || 0) - opt.count;
          const totalFutureAvailable = visibleTableColor + remainingColorSupply;

          if (totalFutureAvailable < neededAfterMove) {
            score -= 18.0; // Bloqueia fechar com azulejos esgotados
          } else if (totalFutureAvailable === neededAfterMove) {
            score -= 3.0;
          } else {
            score += 1.0;
          }
        }
      }

      // Pequena variação para desempate
      score += Math.random() * 0.15;

      return score;
    }

    function botPlayTurn() {
      if (!isBotMode || turn !== 1 || isScoringAnimationActive) return;
      const bot = players[1];
      const opp = (players && players[0]) ? players[0] : null;

      // 1. Gera todas as opções de coleta disponíveis nas fábricas e no centro
      const options = [];

      factories.forEach((factory, fIdx) => {
        if (!factory || factory.length === 0) return;
        const uniqueColors = [...new Set(factory)];
        uniqueColors.forEach(color => {
          const count = factory.filter(c => c === color).length;
          options.push({ source: 'f', fIdx, color, count });
        });
      });

      if (center.length > 0) {
        const uniqueCenter = [...new Set(center)];
        uniqueCenter.forEach(color => {
          const count = center.filter(c => c === color).length;
          options.push({ source: 'c', color, count });
        });
      }

      if (options.length === 0) return;

      // 2. Monta todos os movimentos candidatos válidos (opção + destino)
      const candidates = [];

      options.forEach(opt => {
        for (let r = 0; r < 5; r++) {
          const row = bot.pattern[r];
          const colorMatch = (row.count === 0 || row.color === opt.color);
          const wallCol = WALL_LAYOUT[r].indexOf(opt.color);
          const wallOccupied = bot.wall[r][wallCol];
          const hasSpace = row.count < row.size;

          if (!wallOccupied && colorMatch && hasSpace) {
            candidates.push({ opt, target: 'row', rIdx: r });
          }
        }
        // Destino linha de chão sempre é válido
        candidates.push({ opt, target: 'floor' });
      });

      if (candidates.length === 0) return;

      // 3. Avalia os candidatos de acordo com o nível de dificuldade selecionado
      let bestMove = null;
      let bestScore = -99999;

      // No modo Fácil, pequena chance de jogada casual subótima para iniciantes
      if (botDifficulty === 'easy' && Math.random() < 0.25) {
        const rowCandidates = candidates.filter(c => c.target === 'row');
        if (rowCandidates.length > 0) {
          bestMove = rowCandidates[Math.floor(Math.random() * rowCandidates.length)];
        }
      }

      if (!bestMove) {
        candidates.forEach(cand => {
          let score = 0;
          if (botDifficulty === 'easy') {
            score = evaluateMoveEasy(bot, cand.opt, cand.target, cand.rIdx);
          } else if (botDifficulty === 'medium') {
            score = evaluateMoveMedium(bot, cand.opt, cand.target, cand.rIdx);
          } else {
            score = evaluateMoveHard(bot, opp, cand.opt, cand.target, cand.rIdx);
          }

          if (score > bestScore) {
            bestScore = score;
            bestMove = cand;
          }
        });
      }

      if (!bestMove) {
        bestMove = candidates[0];
      }

      // 4. Executa a escolha e confirmação com transição visual suave
      selected = { ...bestMove.opt };
      stagedMove = bestMove.target === 'row' ? { target: 'row', rIdx: bestMove.rIdx } : { target: 'floor' };
      renderAll();

      const confirmDelay = botDifficulty === 'easy' ? 650 : (botDifficulty === 'medium' ? 500 : 400);
      setTimeout(() => {
        if (!isBotMode || turn !== 1) return;
        confirmMove(false);
      }, confirmDelay);
    }

    // Tile Selection Logic (BGA Flow)
