    /* =====================================================================
       LÓGICA PRINCIPAL DO JOGO AZUL
       ===================================================================== */
    function createBag() {
      const b = [];
      COLORS.forEach(c => {
        for (let i = 0; i < 20; i++) b.push(c);
      });
      return shuffle(b);
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function drawTiles(n) {
      const drawn = [];
      for (let i = 0; i < n; i++) {
        if (bag.length === 0) {
          if (discard.length === 0) break;
          bag = shuffle([...discard]);
          discard = [];
        }
        drawn.push(bag.pop());
      }
      return drawn;
    }

    function changePlayerCount(n) {
      if (isP2P) {
        alert('Em partidas online P2P, a quantidade de jogadores é definida pelo Host ao criar a sala.');
        return;
      }
      isBotMode = false;
      playerCount = n;
      updateHeaderPlayerButtons(n);
      initGame();
    }

    function initGame(names = null) {
      hasMatchEndedByAbandon = false;
      matchRecorded = false;
      const endTitle = document.querySelector('#endModal h2');
      if (endTitle) endTitle.textContent = 'Fim de Jogo';

      bag = createBag();
      discard = [];
      round = 1;
      turn = 0;
      nextStartPlayer = 0;
      selected = null;
      stagedMove = null;

      players = [];
      for (let i = 0; i < playerCount; i++) {
        let pName = (names && names[i]) ? names[i] : (localStorage.getItem(`azul_name_local_${i + 1}`) || `Jogador ${i + 1}`);
        if (isBotMode) {
          if (i === 0) pName = (names && names[0]) ? names[0] : 'Você';
          else if (i === 1) pName = 'Bot';
        }
        players.push({
          id: i,
          name: pName,
          clock: CLOCK_INITIAL_MS,
          score: 0,
          pattern: [
            { size: 1, count: 0, color: null },
            { size: 2, count: 0, color: null },
            { size: 3, count: 0, color: null },
            { size: 4, count: 0, color: null },
            { size: 5, count: 0, color: null }
          ],
          wall: Array(5).fill(null).map(() => Array(5).fill(false)),
          floor: []
        });
      }

      startRound();
      renderAll();
      triggerBotIfNeeded();
    }

    function getFactoryCount() {
      return playerCount === 2 ? 5 : (playerCount === 3 ? 7 : 9);
    }

    function startRound() {
      const fCount = getFactoryCount();
      factories = [];
      for (let f = 0; f < fCount; f++) {
        factories.push(drawTiles(4));
      }
      center = [];
      starterTileInCenter = true;
      turn = nextStartPlayer;
      selected = null;
      stagedMove = null;
    }

    function canPlayerAct() {
      if (isBotMode) return turn === 0;
      if (isP2P) return turn === myP2PIndex;
      return true;
    }

    function triggerBotIfNeeded() {
      if (!isBotMode || turn !== 1 || isScoringAnimationActive) return;
      if (botTurnTimer) clearTimeout(botTurnTimer);
      const thinkDelay = botDifficulty === 'easy' ? 700 : (botDifficulty === 'medium' ? 600 : 500);
      botTurnTimer = setTimeout(() => {
        botTurnTimer = null;
        botPlayTurn();
      }, thinkDelay);
    }

