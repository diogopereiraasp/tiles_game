    // UI RENDER
    function renderTileCounts() {
      const bar = document.getElementById('tileCountsBar');
      if (!bar) return;

      const inBag = { blue: 0, yellow: 0, red: 0, black: 0, white: 0 };
      if (Array.isArray(bag)) {
        bag.forEach(c => {
          if (inBag[c] !== undefined) inBag[c]++;
        });
      }

      const colorLabels = {
        blue: 'Azul',
        yellow: 'Amarelo',
        red: 'Vermelho',
        black: 'Preto',
        white: 'Branco'
      };

      bar.innerHTML = COLORS.map(c => `
        <span class="tile-count-item" title="${colorLabels[c]}: ${inBag[c]} restantes na sacola">
          <span class="tile-count-dot ${c}"></span>
          <span class="tile-count-num">${inBag[c]}</span>
        </span>
      `).join('');
    }

    function renderAll() {
      const boardsGrid = document.getElementById('boardsGrid');
      boardsGrid.className = `grid-${playerCount}p`;

      renderDraftingArea();
      renderBoards();
      renderTileCounts();
    }

    function renderDraftingArea() {
      const fWrap = document.getElementById('factoriesWrap');
      fWrap.innerHTML = '';

      factories.forEach((factory, fIdx) => {
        const disc = document.createElement('div');
        // Se a fábrica foi a selecionada, ela fica visualmente vazia (preview de retirada)
        const isPickedFactory = selected && selected.source === 'f' && selected.fIdx === fIdx;
        const isEmpty = factory.length === 0 || isPickedFactory;
        disc.className = `factory-disc ${isEmpty ? 'empty' : ''}`;

        if (isEmpty) {
          // Cria 4 slots sutis para manter o círculo estruturado
          for (let s = 0; s < 4; s++) {
            const emptySlot = document.createElement('div');
            emptySlot.className = 'slot-empty tile-factory';
            emptySlot.style.borderRadius = 'var(--radius-tile)';
            emptySlot.style.opacity = '0.15';
            disc.appendChild(emptySlot);
          }
        } else {
          factory.forEach(color => {
            const t = document.createElement('div');
            t.className = `tile tile-factory ${color}`;
            t.onclick = (e) => {
              e.stopPropagation();
              pickFromFactory(fIdx, color);
            };
            disc.appendChild(t);
          });
        }

        fWrap.appendChild(disc);
      });

      const cDisc = document.getElementById('centerDisc');
      cDisc.innerHTML = '';

      // Mostra a peça de 1º jogador se ainda estiver no centro
      if (starterTileInCenter) {
        const st = document.createElement('div');
        // Se pegou do centro, a peça de 1º jogador vai para a linha de chão no preview
        const isCenterPicked = selected && selected.source === 'c';
        st.className = `tile tile-factory starter ${isCenterPicked ? 'preview-ghost' : ''}`;
        st.textContent = '1º';
        cDisc.appendChild(st);
      }

      // Peças normais da mesa central
      center.forEach(color => {
        const isPickedColor = selected && selected.source === 'c' && selected.color === color;
        // As peças que o jogador pegou saem da mesa na visualização
        if (isPickedColor) return;

        const t = document.createElement('div');
        t.className = `tile tile-factory ${color}`;
        t.onclick = (e) => {
          e.stopPropagation();
          pickFromCenter(color);
        };
        cDisc.appendChild(t);
      });

      // BGA PREVIEW: Se pegou de uma fábrica, mostra as peças que sobram caindo no centro
      if (selected && selected.source === 'f') {
        const factory = factories[selected.fIdx] || [];
        const leftovers = factory.filter(c => c !== selected.color);
        leftovers.forEach(color => {
          const t = document.createElement('div');
          t.className = `tile tile-factory ${color} preview-ghost`;
          t.title = 'Sobra da fábrica que irá para o centro';
          cDisc.appendChild(t);
        });
      }
    }

    function renderBoards() {
      const container = document.getElementById('boardsGrid');
      container.innerHTML = '';

      // No modo online (P2P), ordena para que "Você" apareça sempre primeiro
      // e os próximos jogadores fiquem na sequência exata de turnos após você.
      let displayPlayers = players;
      if (isP2P && myP2PIndex !== null && myP2PIndex >= 0 && myP2PIndex < players.length) {
        displayPlayers = [];
        for (let i = 0; i < players.length; i++) {
          const idx = (myP2PIndex + i) % players.length;
          displayPlayers.push(players[idx]);
        }
      }

      displayPlayers.forEach(p => {
        const isCurrentTurn = (p.id === turn);
        const card = document.createElement('div');
        card.className = `player-card ${isCurrentTurn ? 'active-turn' : ''}`;

        const isMe = (isP2P && myP2PIndex !== null && p.id === myP2PIndex);
        const baseName = escapeHtml(p.name || (isBotMode ? (p.id === 1 ? 'Bot' : 'Você') : `Jogador ${p.id + 1}`));
        let playerTitle = isMe ? `${baseName} (Você)` : baseName;
        if (isBotMode && p.id === 1) {
          playerTitle = `<span class="player-name">${baseName}</span><span class="bot-level-badge bot-level-${botDifficulty}">${getBotDifficultyLabel(botDifficulty)}</span>`;
        }

        const top = document.createElement('div');
        top.className = 'card-top';

        top.innerHTML = `
            <span class="player-label">
              <span class="turn-indicator"></span>
              <span>${playerTitle}</span>
            </span>
            <span class="player-pts" id="playerPts_${p.id}">${isP2P ? `<span class="player-clock" id="playerClock_${p.id}">${icon('clock')} ${formatClock(p.clock)}</span> ` : ''}${p.score} pts</span>
          `;
        card.appendChild(top);

        // Barra de Ação Integrada ao Card do Jogador Ativo:
        // Exibida para todos os jogadores para que todos vejam o que o jogador da vez selecionou
        if (isCurrentTurn && selected) {
          const actionBar = document.createElement('div');
          actionBar.className = 'card-action-bar';

          const canAct = canPlayerAct();
          let rightContent = '';

          if (canAct) {
            const confirmBtn = stagedMove
              ? `<button class="card-btn-confirm" onclick="confirmMove()">Confirmar</button>`
              : '';
            rightContent = `
              <div class="card-action-btns">
                ${confirmBtn}
                <button class="card-btn-cancel" onclick="cancelMove()">Cancelar</button>
              </div>
            `;
          } else {
            rightContent = `
              <span class="card-action-waiting" style="font-size: 11px; color: #94a3b8; font-weight: 600;">
                ${stagedMove ? 'Aguardando confirmação...' : 'Escolhendo destino...'}
              </span>
            `;
          }

          actionBar.innerHTML = `
            <div class="card-action-info">
              <div class="card-mini-tile tile ${selected.color}">${selected.count}x</div>
            </div>
            ${rightContent}
          `;
          card.appendChild(actionBar);
        }

        const body = document.createElement('div');
        body.className = 'board-body';

        // Pattern rows
        const patWrap = document.createElement('div');
        patWrap.className = 'pattern-lines';

        for (let r = 0; r < 5; r++) {
          const row = p.pattern[r];
          const rowDiv = document.createElement('div');

          let canTarget = false;
          if (selected && isCurrentTurn && canPlayerAct()) {
            const wallCol = WALL_LAYOUT[r].indexOf(selected.color);
            const wallOccupied = p.wall[r][wallCol];
            const colorMatch = (row.count === 0 || row.color === selected.color);
            const hasSpace = row.count < row.size;
            canTarget = !wallOccupied && colorMatch && hasSpace;
          }

          const isStagedRow = isCurrentTurn && stagedMove && stagedMove.target === 'row' && stagedMove.rIdx === r;
          rowDiv.className = `pattern-row ${canTarget ? 'targetable' : ''} ${isStagedRow ? 'staged-row' : ''}`;
          if (canTarget) {
            rowDiv.onclick = () => {
              if (isStagedRow) {
                confirmMove();
              } else {
                stagePlacement('row', r);
              }
            };
          }

          // Calcula preview se esta linha for a selecionada para staging
          let previewAdded = 0;
          let previewColor = row.color;
          if (isStagedRow && selected) {
            previewColor = selected.color;
            const space = row.size - row.count;
            previewAdded = Math.min(space, selected.count);
          }

          for (let s = 0; s < row.size; s++) {
            const actualFilled = s >= (row.size - row.count);
            const previewFilled = isStagedRow && (s >= (row.size - (row.count + previewAdded)) && s < (row.size - row.count));

            if (actualFilled && row.color) {
              const t = document.createElement('div');
              t.className = `tile ${row.color}`;
              rowDiv.appendChild(t);
            } else if (previewFilled && previewColor) {
              const t = document.createElement('div');
              t.className = `tile ${previewColor} preview-ghost`;
              t.title = 'Pré-visualização do posicionamento';
              rowDiv.appendChild(t);
            } else {
              const empty = document.createElement('div');
              empty.className = 'slot-empty';
              rowDiv.appendChild(empty);
            }
          }
          patWrap.appendChild(rowDiv);
        }
        body.appendChild(patWrap);

        // Mosaic Wall
        const wallGrid = document.createElement('div');
        wallGrid.className = 'wall-grid';
        wallGrid.id = `wallGrid_${p.id}`;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const color = WALL_LAYOUT[r][c];
            const filled = p.wall[r][c];
            const cell = document.createElement('div');
            cell.id = `wallCell_${p.id}_${r}_${c}`;
            cell.className = `wall-cell tile ${color} ${filled ? 'filled' : ''}`;
            wallGrid.appendChild(cell);
          }
        }
        body.appendChild(wallGrid);

        card.appendChild(body);

        // Floor line
        const floor = document.createElement('div');
        const canFloor = selected && isCurrentTurn && canPlayerAct();
        const isStagedFloor = isCurrentTurn && stagedMove && stagedMove.target === 'floor';
        floor.className = `floor-line ${canFloor ? 'targetable' : ''} ${isStagedFloor ? 'staged-floor' : ''}`;
        if (canFloor) {
          floor.onclick = () => {
            if (isStagedFloor) {
              confirmMove();
            } else {
              stagePlacement('floor');
            }
          };
        }

        // Calcula itens de pré-visualização no chão (starter tile + overflow ou direto no chão)
        const previewFloorItems = [];
        if (isCurrentTurn && selected && stagedMove) {
          if (selected.source === 'c' && starterTileInCenter) {
            previewFloorItems.push('starter');
          }
          if (stagedMove.target === 'floor') {
            for (let i = 0; i < selected.count; i++) {
              previewFloorItems.push(selected.color);
            }
          } else if (stagedMove.target === 'row') {
            const stagedRow = p.pattern[stagedMove.rIdx];
            const space = stagedRow.size - stagedRow.count;
            const overflow = selected.count - Math.min(space, selected.count);
            for (let i = 0; i < overflow; i++) {
              previewFloorItems.push(selected.color);
            }
          }
        }

        for (let i = 0; i < 7; i++) {
          const slot = document.createElement('div');
          const actualItem = p.floor[i];
          const previewIdx = i - p.floor.length;
          const isPreviewSlot = previewIdx >= 0 && previewIdx < previewFloorItems.length;

          if (actualItem) {
            slot.className = `floor-slot occupied tile ${actualItem === 'starter' ? 'starter' : actualItem}`;
            slot.textContent = actualItem === 'starter' ? '1º' : '';
          } else if (isPreviewSlot) {
            const previewItem = previewFloorItems[previewIdx];
            slot.className = `floor-slot occupied tile preview-ghost ${previewItem === 'starter' ? 'starter' : previewItem}`;
            slot.textContent = previewItem === 'starter' ? '1º' : '';
            slot.title = 'Penalidade prévia no chão';
          } else {
            slot.className = 'floor-slot';
            slot.textContent = FLOOR_PENALTIES[i];
          }
          floor.appendChild(slot);
        }
        card.appendChild(floor);

        container.appendChild(card);
      });
    }

    function restoreSessionFromStorage() {
      try {
        const raw = sessionStorage.getItem('azul_saved_session') || localStorage.getItem('azul_saved_session');
        if (!raw) return false;
        const session = JSON.parse(raw);
        if (!session || !session.gameState || !session.isGameActive) {
          clearSavedSession();
          return false;
        }

        isGameActive = true;
        document.getElementById('mainMenuModal').style.display = 'none';
        updateChatVisibility();

        if (session.mode === 'online') {
          isP2P = true;
          isHost = !!session.isHost;
          myP2PIndex = session.myP2PIndex;
          currentRoomCode = session.currentRoomCode;
          targetOnlinePlayers = session.targetOnlinePlayers || session.playerCount || 2;
          rankedMatchId = session.rankedMatchId || null;
          hostEpoch = session.hostEpoch || 0;
          movesPlayed = session.movesPlayed || 0;
          isBotMode = false;

          // Atualiza URL com o código da sala
          if (currentRoomCode && window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, `${window.location.pathname}?sala=${currentRoomCode}`);
          }

          if (isHost) {
            updateP2PBadge('waiting', `P1 (Reconectando Host...)`);
            applyFullGameState(session.gameState);
            initRealtimeRoom(currentRoomCode, 'host', () => {
              updateP2PBadge('online', `P1 (Host - ${targetOnlinePlayers}P)`);
            });
          } else {
            updateP2PBadge('waiting', `Reconectando...`);
            applyFullGameState(session.gameState);
            clientHostConn = new RtConn(null);
            setupClientConnection();
            initRealtimeRoom(currentRoomCode, 'guest');
          }
          return true;
        } else if (session.mode === 'bot') {
          isP2P = false;
          isHost = false;
          myP2PIndex = null;
          isBotMode = true;
          botDifficulty = session.botDifficulty || 'hard';
          playerCount = 2;
          const diffLabel = getBotDifficultyLabel(botDifficulty);
          updateP2PBadge('offline', `vs Bot (${diffLabel})`);
          applyFullGameState(session.gameState);
          triggerBotIfNeeded();
          return true;
        } else {
          // Local Pass & Play
          isP2P = false;
          isHost = false;
          myP2PIndex = null;
          isBotMode = false;
          playerCount = session.playerCount || 2;
          updateP2PBadge('offline', `Local (${playerCount}P)`);
          applyFullGameState(session.gameState);
          return true;
        }
      } catch (e) {
        console.warn('Erro ao restaurar sessão anterior:', e);
        return false;
      }
    }

    // Inicialização e checagem de parâmetros de URL (?sala=...)
    window.onload = () => {
      // 0. Carrega nomes de jogadores salvos no storage e inicializa listeners
      loadSavedPlayerNames();
      setupPlayerNameStorageListeners();

      // 1. Tenta restaurar sessão salva (reload/F5)
      const restored = restoreSessionFromStorage();
      if (restored) return;

      // 2. Se a URL tiver ?sala=XYZ e não tinha sessão restaurada, preenche o código e abre a tela para o jogador conferir o nome e entrar
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('sala') || urlParams.get('room');
      if (roomParam) {
        document.getElementById('mainMenuModal').style.display = 'none';
        const codeInput = document.getElementById('roomCodeInput');
        if (codeInput) codeInput.value = roomParam.toUpperCase();
        const nameInput = document.getElementById('onlineMyNameInput');
        if (nameInput && nameInput.value === 'Jogador 1') {
          nameInput.value = 'Jogador 2';
          nameInput.select();
        }
        openMultiplayerModal('join');
        return;
      }

      // 3. Caso padrão inicial: prepara tabuleiro base e mostra menu
      initGame();
    };

    window.addEventListener('beforeunload', () => {
      // Salva estado antes de fechar/recarregar
      saveSessionToStorage();
    });

    // ── Efeito 3D nas peças (selecionável; lembra a escolha neste navegador) ──
    // ── Desenhos de azulejo nas peças (liga/desliga; padrão: ligado) ──
    const MOTIFS_KEY = 'azul_motifs_v1';
    function applyMotifs(on) {
      document.body.classList.toggle('motifs', on);
      const b = document.getElementById('fxMotifBtn');
      if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
    }
    function toggleMotifs() {
      const on = !document.body.classList.contains('motifs');
      applyMotifs(on);
      try { localStorage.setItem(MOTIFS_KEY, on ? '1' : '0'); } catch (e) { }
    }
    (function initMotifs() {
      let on = true; // padrão: ligado
      try { if (localStorage.getItem(MOTIFS_KEY) === '0') on = false; } catch (e) { }
      applyMotifs(on);
    })();

        // Chave nova (v2): o 3D começa LIGADO para todos, mesmo para quem desligou antes de a opção existir como padrão
    const FX3D_KEY = 'azul_fx3d_v2';
    function applyFx3d(on) {
      document.body.classList.toggle('fx3d', on);
      const b = document.getElementById('fx3dBtn');
      if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
    }
    function toggleFx3d() {
      const on = !document.body.classList.contains('fx3d');
      applyFx3d(on);
      try { localStorage.setItem(FX3D_KEY, on ? '1' : '0'); } catch (e) { }
    }
    (function initFx3d() {
      let on = true; // padrão: ligado e marcado
      try { if (localStorage.getItem(FX3D_KEY) === '0') on = false; } catch (e) { }
      applyFx3d(on);
    })();

        hydrateIcons();
