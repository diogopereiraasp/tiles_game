    /* =====================================================================
       PARTIDA RANQUEADA: FILA DE PAREAMENTO (servidor: find_ranked_match)
       O servidor junta dois jogadores com Elo parecido (janela cresce com a espera),
       escolhe o anfitrião e o código da sala. Só estas partidas valem Elo.
       ===================================================================== */
    let mmActive = false;
    let mmBusy = false;
    let mmPollTimer = null;
    let mmClockTimer = null;
    let mmStartedAt = 0;
    let mmHandshakeTimer = null;
    const MM_POLL_MS = 2000;
    const MM_HANDSHAKE_TIMEOUT_MS = 45000; // tempo para o oponente aparecer na sala depois do pareamento

    async function startRankedSearch() {
      if (!sb) { alert('Não foi possível conectar ao servidor. Verifique sua internet.'); return; }
      const user = await ensureSignedIn();
      if (!user) { alert('Não foi possível entrar na sua conta. Tente novamente em instantes.'); return; }

      // Primeira vez com o nome padrão: convida a escolher o nome de usuário antes de entrar no ranking
      let prompted = false;
      try { prompted = !!localStorage.getItem('azul_name_prompted'); } catch (e) { }
      if (authProfile && isDefaultUsername(authProfile.display_name) && !prompted) {
        try { localStorage.setItem('azul_name_prompted', '1'); } catch (e) { }
        openAccountModal('Escolha seu nome de usuário (único) para aparecer no ranking. Depois toque em Partida Ranqueada de novo.');
        return;
      }

      document.getElementById('mainMenuModal').style.display = 'none';
      document.getElementById('searchModal').style.display = 'flex';
      const elo = (authProfile && typeof authProfile.elo === 'number') ? authProfile.elo : 0;
      document.getElementById('searchEloLine').textContent = `Seu Elo: ${elo} · ${getEloTier(elo).name}`;
      document.getElementById('searchTitle').textContent = 'Procurando oponente...';
      document.getElementById('searchSub').textContent = 'Buscando alguém com Elo parecido com o seu.';

      mmActive = true;
      mmStartedAt = Date.now();
      const tick = () => {
        const s = Math.floor((Date.now() - mmStartedAt) / 1000);
        const el = document.getElementById('searchTimer');
        if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s === 20) document.getElementById('searchSub').textContent = 'Ampliando a busca para Elos mais distantes...';
      };
      tick();
      clearInterval(mmClockTimer);
      mmClockTimer = setInterval(tick, 1000);
      clearInterval(mmPollTimer);
      mmPollTimer = setInterval(mmPoll, MM_POLL_MS);
      mmPoll();
    }

    async function mmPoll() {
      if (!mmActive || mmBusy) return;
      mmBusy = true;
      try {
        const { data, error } = await sb.rpc('find_ranked_match');
        if (!mmActive) return;
        if (error) { console.warn('Fila:', error.message); return; }
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.r_status === 'matched') {
          stopRankedSearchLoop();
          startRankedMatch(row);
        }
      } catch (e) {
        console.warn('Fila falhou:', e);
      } finally {
        mmBusy = false;
      }
    }

    function stopRankedSearchLoop() {
      mmActive = false;
      clearInterval(mmPollTimer); mmPollTimer = null;
      clearInterval(mmClockTimer); mmClockTimer = null;
    }

    async function cancelRankedSearch() {
      const wasActive = mmActive;
      stopRankedSearchLoop();
      document.getElementById('searchModal').style.display = 'none';
      document.getElementById('mainMenuModal').style.display = 'flex';
      if (wasActive && sb) { try { await sb.rpc('cancel_ranked_search'); } catch (e) { } }
    }

    function startRankedMatch(row) {
      rankedMatchId = row.r_match_id;
      targetOnlinePlayers = 2;
      const searchTitle = document.getElementById('searchTitle');
      if (searchTitle) searchTitle.textContent = 'Oponente encontrado!';
      document.getElementById('searchSub').textContent = 'Entrando na partida...';

      const nameInput = document.getElementById('onlineMyNameInput');
      const myName = (authProfile && authProfile.display_name) || 'jogador';
      if (nameInput) nameInput.value = myName;

      setTimeout(() => { document.getElementById('searchModal').style.display = 'none'; }, 600);

      if (row.r_role === 'host') p2pCreateRoom(row.r_room_code, { ranked: true });
      else p2pJoinRoom(row.r_room_code, { ranked: true });

      // Se o oponente não aparecer na sala, desiste e volta ao menu
      clearTimeout(mmHandshakeTimer);
      mmHandshakeTimer = setTimeout(() => {
        if (isGameActive) return;
        alert('Seu oponente não conseguiu entrar na partida. Tente procurar outra.');
        abortRankedStart();
      }, MM_HANDSHAKE_TIMEOUT_MS);
    }

    function abortRankedStart() {
      clearTimeout(mmHandshakeTimer); mmHandshakeTimer = null;
      destroyRealtimeRoom();
      isP2P = false; isHost = false; myP2PIndex = null; currentRoomCode = null;
      rankedMatchId = null; hostEpoch = 0; movesPlayed = 0;
      isGameActive = false;
      const badge = document.getElementById('p2pStatus');
      if (badge) badge.style.display = 'none';
      clearSavedSession();
      initGame();
      document.getElementById('multiplayerModal').style.display = 'none';
      document.getElementById('mainMenuModal').style.display = 'flex';
    }
