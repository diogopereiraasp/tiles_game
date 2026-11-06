    // ── Relógio de ação (online): 5min inicial, +30s por jogada, teto de 5min ──
    const CLOCK_INITIAL_MS = 300000;
    const CLOCK_INCREMENT_MS = 30000;
    const CLOCK_MAX_MS = 300000;
    let clockLastTick = Date.now();
    let clockSyncCounter = 0;

    function formatClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function updateClockDisplays() {
      (players || []).forEach(p => {
        const el = document.getElementById(`playerClock_${p.id}`);
        if (!el) return;
        el.innerHTML = `${icon('clock')} ${formatClock(p.clock)}`;
        el.classList.toggle('clock-low', p.clock <= 30000);
      });
    }

    setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - clockLastTick, 2000); // evita salto quando a aba é congelada
      clockLastTick = now;
      if (!isP2P || !isGameActive || hasMatchEndedByAbandon || isScoringAnimationActive) return;
      const p = players && players[turn];
      if (!p || typeof p.clock !== 'number') return;
      p.clock = Math.max(0, p.clock - dt);
      updateClockDisplays();

      if (isHost) {
        if (p.clock <= 0) {
          const msg = { type: 'PLAYER_ABANDONED', playerIndex: p.id, playerName: p.name, reason: 'timeout' };
          broadcastP2P(msg);
          handlePlayerAbandoned(p.id, p.name, 'timeout');
        } else if (++clockSyncCounter >= 120) { // ~30s (cada celular já conta o tempo; isto só corrige desvios)
          clockSyncCounter = 0;
          broadcastP2P({ type: 'CLOCK_SYNC', clocks: players.map(x => x.clock), turn });
        }
      }
    }, 250);

    // Conjunto de caracteres legíveis (3 letras e números)
    // Omitimos letras facilmente confusas, mas garantimos suporte a 'O' e '0' com visual cortado (slashed-zero)
    const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    function generate4DigitCode() {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
      }
      return code;
    }

    let selectedLocalCount = 2;

    // Persistência de nomes dos jogadores no LocalStorage
    function loadSavedPlayerNames() {
      try {
        const p1 = localStorage.getItem('azul_name_local_1');
        const p2 = localStorage.getItem('azul_name_local_2');
        const p3 = localStorage.getItem('azul_name_local_3');
        const p4 = localStorage.getItem('azul_name_local_4');
        const onlineP = localStorage.getItem('azul_name_online');

        const elP1 = document.getElementById('localNameP1');
        const elP2 = document.getElementById('localNameP2');
        const elP3 = document.getElementById('localNameP3');
        const elP4 = document.getElementById('localNameP4');
        const elOnline = document.getElementById('onlineMyNameInput');

        if (elP1 && p1) elP1.value = p1;
        if (elP2 && p2) elP2.value = p2;
        if (elP3 && p3) elP3.value = p3;
        if (elP4 && p4) elP4.value = p4;

        if (elOnline) {
          if (onlineP) elOnline.value = onlineP;
          else if (p1) elOnline.value = p1;
        }
      } catch (e) {
        console.warn('Erro ao carregar nomes do storage:', e);
      }
    }

    function savePlayerNamesToStorage() {
      try {
        const elP1 = document.getElementById('localNameP1');
        const elP2 = document.getElementById('localNameP2');
        const elP3 = document.getElementById('localNameP3');
        const elP4 = document.getElementById('localNameP4');
        const elOnline = document.getElementById('onlineMyNameInput');

        if (elP1 && elP1.value.trim()) localStorage.setItem('azul_name_local_1', elP1.value.trim());
        if (elP2 && elP2.value.trim()) localStorage.setItem('azul_name_local_2', elP2.value.trim());
        if (elP3 && elP3.value.trim()) localStorage.setItem('azul_name_local_3', elP3.value.trim());
        if (elP4 && elP4.value.trim()) localStorage.setItem('azul_name_local_4', elP4.value.trim());
        if (elOnline && elOnline.value.trim()) localStorage.setItem('azul_name_online', elOnline.value.trim());
      } catch (e) {
        console.warn('Erro ao salvar nomes no storage:', e);
      }
    }

    function setupPlayerNameStorageListeners() {
      const ids = ['localNameP1', 'localNameP2', 'localNameP3', 'localNameP4', 'onlineMyNameInput'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.removeEventListener('input', savePlayerNamesToStorage);
          el.removeEventListener('change', savePlayerNamesToStorage);
          el.addEventListener('input', savePlayerNamesToStorage);
          el.addEventListener('change', savePlayerNamesToStorage);
        }
      });
    }

    // Executa imediatamente para preencher inputs se o DOM já estiver pronto
    loadSavedPlayerNames();
    setupPlayerNameStorageListeners();

    function openLocalModal() {
      loadSavedPlayerNames();
      document.getElementById('mainMenuModal').style.display = 'none';
      const modal = document.getElementById('localModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeLocalModal() {
      const modal = document.getElementById('localModal');
      if (modal) modal.style.display = 'none';
      document.getElementById('mainMenuModal').style.display = 'flex';
    }

    function selectLocalPlayerCount(count) {
      selectedLocalCount = count;
      [2, 3, 4].forEach(n => {
        const btn = document.getElementById(`local${n}pBtn`);
        if (btn) {
          if (n === count) btn.classList.add('active');
          else btn.classList.remove('active');
        }
        const input = document.getElementById(`localNameP${n}`);
        if (input) {
          input.style.display = (n <= count) ? 'block' : 'none';
        }
      });
    }

    function startConfiguredLocalGame() {
      savePlayerNamesToStorage();
      const modal = document.getElementById('localModal');
      if (modal) modal.style.display = 'none';
      const names = [];
      for (let i = 1; i <= selectedLocalCount; i++) {
        const el = document.getElementById(`localNameP${i}`);
        const val = el ? el.value.trim() : '';
        names.push(val || `Jogador ${i}`);
      }
      chooseLocalMode(selectedLocalCount, names);
    }

    function chooseOnlineMode() {
      document.getElementById('mainMenuModal').style.display = 'none';
      isBotMode = false;
      openMultiplayerModal();
    }

    function openBotModal() {
      loadSavedPlayerNames();
      document.getElementById('mainMenuModal').style.display = 'none';
      const modal = document.getElementById('botModal');
      if (modal) {
        modal.style.display = 'flex';
        selectBotDifficulty(botDifficulty || 'hard');
      }
    }

    function closeBotModal() {
      const modal = document.getElementById('botModal');
      if (modal) modal.style.display = 'none';
      document.getElementById('mainMenuModal').style.display = 'flex';
    }

    function selectBotDifficulty(diff) {
      botDifficulty = diff;
      ['easy', 'medium', 'hard'].forEach(d => {
        const card = document.getElementById(`botDiffCard_${d}`);
        if (card) {
          if (d === diff) card.classList.add('active');
          else card.classList.remove('active');
        }
      });
    }

    function startConfiguredBotGame() {
      const modal = document.getElementById('botModal');
      if (modal) modal.style.display = 'none';
      chooseBotMode(botDifficulty);
    }

    function chooseBotMode(diff = 'hard') {
      document.getElementById('mainMenuModal').style.display = 'none';
      const botModal = document.getElementById('botModal');
      if (botModal) botModal.style.display = 'none';
      botDifficulty = diff || 'hard';
      isP2P = false;
      isBotMode = true;
      isGameActive = true;
      myP2PIndex = null;
      playerCount = 2;
      updateChatVisibility();
      const diffLabel = getBotDifficultyLabel(botDifficulty);
      updateP2PBadge('offline', `vs Bot (${diffLabel})`);
      initGame(['Você', 'Bot']);
      saveSessionToStorage();
    }

    function chooseLocalMode(count = 2, customNames = null) {
      document.getElementById('mainMenuModal').style.display = 'none';
      isP2P = false;
      isBotMode = false;
      isGameActive = true;
      myP2PIndex = null;
      playerCount = count;
      updateChatVisibility();
      updateP2PBadge('offline', `Local (${count}P)`);
      initGame(customNames);
      saveSessionToStorage();
    }

    function selectHostPCount(count) {
      targetOnlinePlayers = count;
      [2, 3, 4].forEach(n => {
        const btn = document.getElementById(`host${n}pBtn`);
        if (btn) {
          if (n === count) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SALA ONLINE VIA SUPABASE REALTIME
    // Cada jogador fica conectado ao servidor do Supabase (não um ao outro).
    // Se a tela bloquear, o cliente do Supabase reconecta sozinho ao voltar
    // e o "Presence" avisa quem saiu/voltou. RtConn imita a interface de
    // conexão antiga (send / on('open'|'data'|'close') / close / open / peer).
    // ─────────────────────────────────────────────────────────────
    function getRtClientId() {
      const gen = () => (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try {
        let id = sessionStorage.getItem('azul_rt_id');
        if (!id) { id = gen(); sessionStorage.setItem('azul_rt_id', id); }
        return id;
      } catch (e) { return gen(); }
    }

    class RtConn {
      constructor(remoteId) {
        this.peer = remoteId;
        this.open = false;
        this.assignedIndex = undefined;
        this._handlers = { open: [], data: [], close: [] };
      }
      on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
      _emit(evt, arg) {
        (this._handlers[evt] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } });
      }
      send(data) {
        if (!rtRoom || rtRoom.destroyed || !this.peer) return;
        // O Realtime não garante ordem: numeramos por destinatário para reordenar na chegada
        const seq = (rtRoom.seqTo.get(this.peer) || 0) + 1;
        rtRoom.seqTo.set(this.peer, seq);
        rtRoom.channel.send({ type: 'broadcast', event: 'msg', payload: { from: rtRoom.myId, to: this.peer, sid: rtRoom.sid, seq, data } });
      }
      close() {
        if (this.open && rtRoom && this.peer) {
          try { rtRoom.channel.send({ type: 'broadcast', event: 'ctl', payload: { from: rtRoom.myId, to: this.peer, ctl: 'close' } }); } catch (e) { }
        }
        this.open = false;
      }
    }

    function destroyRealtimeRoom() {
      if (!rtRoom) return;
      rtRoom.destroyed = true;
      clearTimeout(rtRoom.notFoundTimer);
      rtRoom.missing.forEach(t => clearTimeout(t));
      rtRoom.inbox.forEach(st => clearTimeout(st.timer));
      try { sb.removeChannel(rtRoom.channel); } catch (e) { }
      rtRoom = null;
    }

    // role: 'host' | 'guest'. opts.fresh = sala nova (host verifica colisão de código / guest avisa se não achar o host)
    // Metadados anunciados no Presence (usados para eleger novo anfitrião)
    function rtTrackPresence() {
      if (!rtRoom || rtRoom.destroyed) return Promise.resolve('none');
      const room = rtRoom;
      return room.channel.track({ id: room.myId, role: room.role, idx: myP2PIndex, epoch: hostEpoch });
    }

    // role: 'host' | 'guest' (pode mudar durante a partida: migração de anfitrião)
    // opts.fresh = sala nova; opts.fixedCode = código vindo do matchmaking; opts.ranked = partida ranqueada
    function initRealtimeRoom(roomCode, role, onReady, opts = {}) {
      if (!sb) {
        alert('Não foi possível conectar ao servidor do jogo. Verifique sua internet e tente novamente.');
        updateP2PBadge('offline', 'Sem conexão');
        return;
      }
      destroyRealtimeRoom();

      const myId = getRtClientId();
      const channel = sb.channel(`azul-room-${roomCode.toUpperCase()}`, {
        config: { broadcast: { self: false }, presence: { key: myId } }
      });
      const room = { channel, myId, role, roomCode, conns: new Map(), missing: new Map(), seqTo: new Map(), inbox: new Map(),
        sid: Math.random().toString(36).slice(2, 10), hostId: null, destroyed: false, readyFired: false, firstSync: true, notFoundTimer: null };
      rtRoom = room;

      const readPresence = () => {
        const present = new Map(); // id -> { role, idx, epoch }
        Object.values(channel.presenceState()).forEach(metas => metas.forEach(m => {
          if (m && m.id) present.set(m.id, { role: m.role, idx: m.idx, epoch: m.epoch || 0 });
        }));
        return present;
      };
      room.readPresence = readPresence;
      const clearMissing = (key) => {
        if (room.missing.has(key)) { clearTimeout(room.missing.get(key)); room.missing.delete(key); }
      };
      // O Presence oscila (principalmente ao entrar). Só fecha a conexão após 4s de ausência contínua.
      const markMissing = (key) => {
        if (room.missing.has(key)) return;
        room.missing.set(key, setTimeout(() => {
          room.missing.delete(key);
          if (room.destroyed) return;
          const present = readPresence();
          if (room.role === 'host') {
            const conn = room.conns.get(key);
            if (conn && conn.open && !present.has(key)) { conn.open = false; conn._emit('close'); }
          } else {
            const hostThere = [...present.values()].some(m => m.role === 'host');
            if (!hostThere && clientHostConn && clientHostConn.open) { clientHostConn.open = false; clientHostConn._emit('close'); }
          }
        }, 4000));
      };

      channel.on('presence', { event: 'sync' }, () => {
        if (room.destroyed) return;
        const present = readPresence();

        if (room.role === 'host') {
          // Código em uso por outro host: gera outro (só em sala nova de amigos)
          if (room.firstSync && opts.fresh && !opts.fixedCode) {
            const otherHost = [...present.entries()].some(([id, m]) => m.role === 'host' && id !== myId);
            if (otherHost) {
              destroyRealtimeRoom();
              p2pCreateRoom();
              return;
            }
          }
          // Outro anfitrião mais "novo" assumiu enquanto eu estava fora: viro convidado e ressincronizo
          const rival = [...present.entries()].filter(([id, m]) => m.role === 'host' && id !== myId)
            .sort((x, y) => (y[1].epoch - x[1].epoch) || (x[0] < y[0] ? -1 : 1))[0];
          if (rival && isGameActive && (rival[1].epoch > hostEpoch || (rival[1].epoch === hostEpoch && rival[0] < myId))) {
            demoteToGuest();
            return;
          }
          // Convidados que sumiram do Presence => conexão fechada
          room.conns.forEach((conn, id) => {
            if (conn.open && !present.has(id)) markMissing(id);
            else clearMissing(id);
          });
        } else {
          const hostEntry = [...present.entries()].filter(([, m]) => m.role === 'host')
            .sort((x, y) => (y[1].epoch - x[1].epoch) || (x[0] < y[0] ? -1 : 1))[0];
          const conn = clientHostConn;
          if (hostEntry) clearMissing('host');
          if (hostEntry && conn) {
            room.hostId = hostEntry[0];
            clearTimeout(room.notFoundTimer);
            if (hostMigrationTimer) { clearTimeout(hostMigrationTimer); hostMigrationTimer = null; }
            if (!conn.open || conn.peer !== hostEntry[0]) {
              conn.peer = hostEntry[0];
              conn.open = true;
              conn._emit('open');
            }
          } else if (!hostEntry && conn && conn.open) {
            markMissing('host');
          }
        }
        room.firstSync = false;
      });

      // Entrega em ordem por remetente; se faltar uma mensagem por 1,5s, pula a lacuna
      const deliverInOrder = (payload, handle) => {
        let st = room.inbox.get(payload.from);
        if (!st || st.sid !== payload.sid) {
          if (st) clearTimeout(st.timer);
          st = { sid: payload.sid, next: 1, buf: new Map(), timer: null };
          room.inbox.set(payload.from, st);
        }
        if (typeof payload.seq !== 'number') { handle(payload); return; }
        if (payload.seq < st.next) return; // duplicada
        st.buf.set(payload.seq, payload);
        const flush = () => {
          while (st.buf.has(st.next)) {
            const p = st.buf.get(st.next);
            st.buf.delete(st.next);
            st.next++;
            handle(p);
          }
          clearTimeout(st.timer);
          st.timer = null;
          if (st.buf.size) {
            st.timer = setTimeout(() => {
              if (room.destroyed || !st.buf.size) return;
              st.next = Math.min(...st.buf.keys());
              flush();
            }, 1500);
          }
        };
        flush();
      };

      channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
        if (room.destroyed || !payload || payload.to !== myId) return;
        deliverInOrder(payload, handleRtMessage);
      });

      const handleRtMessage = (payload) => {
        if (room.destroyed) return;
        clearMissing(room.role === 'host' ? payload.from : 'host');
        if (room.role === 'host') {
          let conn = room.conns.get(payload.from);
          if (!conn || !conn.open) {
            conn = new RtConn(payload.from);
            conn.open = true;
            room.conns.set(payload.from, conn);
            handleGuestIncoming(conn);
          }
          conn._emit('data', payload.data);
        } else if (clientHostConn) {
          // Segurança: convidado só aceita mensagens de quem está anunciado como anfitrião
          const sender = room.readPresence().get(payload.from);
          if (!sender || sender.role !== 'host') return;
          if (!clientHostConn.open) { clientHostConn.peer = payload.from; clientHostConn.open = true; }
          clientHostConn._emit('data', payload.data);
        }
      };

      channel.on('broadcast', { event: 'ctl' }, ({ payload }) => {
        if (room.destroyed || !payload || payload.to !== myId || payload.ctl !== 'close') return;
        if (room.role !== 'host' && payload.from !== (clientHostConn && clientHostConn.peer)) return; // só o anfitrião fecha a conexão do convidado
        const conn = room.role === 'host' ? room.conns.get(payload.from) : clientHostConn;
        if (conn && conn.open) { conn.open = false; conn._emit('close'); }
      });

      channel.subscribe(async (status) => {
        if (room.destroyed) return;
        if (status === 'SUBSCRIBED') {
          // Também roda em toda reconexão automática: reanuncia presença
          try { await rtTrackPresence(); } catch (e) { console.warn('track falhou', e); }
          if (room.readyFired || opts.rejoin) {
            // Reconexão: mensagens podem ter se perdido enquanto estávamos fora -> ressincroniza
            if (room.role === 'guest' && clientHostConn) {
              clientHostConn.open = false; // o próximo 'sync' do Presence reemite 'open' => REQUEST_SYNC
            } else if (room.role === 'host' && isGameActive && !hasMatchEndedByAbandon) {
              setTimeout(() => { if (!room.destroyed) broadcastP2P({ type: 'SYNC_STATE', state: getFullGameState() }); }, 800);
            }
          }
          if (!room.readyFired) {
            room.readyFired = true;
            if (room.role === 'guest' && opts.fresh && !opts.ranked) {
              room.notFoundTimer = setTimeout(() => {
                if (room.destroyed || (clientHostConn && clientHostConn.open)) return;
                alert('Sala não encontrada. Confira o código e se o criador da sala ainda está com ela aberta.');
                updateP2PBadge('offline', 'Sala não encontrada');
                destroyRealtimeRoom();
              }, 8000);
            }
            if (onReady) onReady(myId);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime:', status, '— o cliente vai tentar reconectar sozinho');
          if (isGameActive) updateP2PBadge('waiting', 'Reconectando...');
        }
      });
    }

    // ── Migração de anfitrião ──
    // Todos os jogadores já têm o estado completo da partida. Se o anfitrião some (tela bloqueada,
    // sem sinal), o convidado de MENOR índice presente assume a sala e a partida continua para os outros.
    function scheduleHostMigration() {
      if (isHost || !isP2P) return;
      if (hostMigrationTimer) clearTimeout(hostMigrationTimer);
      hostMigrationTimer = setTimeout(() => { hostMigrationTimer = null; tryPromoteToHost(); }, HOST_MIGRATION_DELAY_MS);
    }

    async function tryPromoteToHost() {
      const room = rtRoom;
      if (!room || room.destroyed || room.role !== 'guest' || isHost) return;
      if (!isGameActive || hasMatchEndedByAbandon) return;
      if (clientHostConn && clientHostConn.open) return;

      // Só assume quem comprovadamente está conectado ao servidor
      let alive = false;
      try {
        if (room.channel.state === 'joined') {
          alive = (await Promise.race([rtTrackPresence(), new Promise(r => setTimeout(() => r('timeout'), 4000))])) === 'ok';
        }
      } catch (e) { }
      if (!alive) { scheduleHostMigration(); return; }

      await new Promise(r => setTimeout(r, 1500)); // deixa o Presence assentar
      if (room.destroyed || rtRoom !== room || room.role !== 'guest' || (clientHostConn && clientHostConn.open)) return;

      const present = room.readPresence();
      if ([...present.values()].some(m => m.role === 'host')) return; // o anfitrião voltou ou outro já assumiu
      const idxs = [...present.values()].filter(m => m.role === 'guest' && typeof m.idx === 'number').map(m => m.idx);
      if (!idxs.includes(myP2PIndex)) idxs.push(myP2PIndex);
      if (Math.min(...idxs) !== myP2PIndex) { scheduleHostMigration(); return; } // outro tem prioridade; reavalia depois

      // Assume a sala
      room.role = 'host';
      isHost = true;
      hostEpoch = (hostEpoch || 0) + 1;
      targetOnlinePlayers = playerCount || targetOnlinePlayers;
      if (hostDisconnectTimer) { clearTimeout(hostDisconnectTimer); hostDisconnectTimer = null; }
      if (clientHostConn) clientHostConn.open = false;
      clientHostConn = null;
      hostGuestConnections = [];
      room.conns.clear();
      rtTrackPresence();
      appendChatSystemMessage('O anfitrião caiu. Você assumiu a sala para a partida continuar.');
      const myName = (players && players[myP2PIndex] && players[myP2PIndex].name) || 'Você';
      updateP2PBadge('online', `${myName} (Anfitrião - ${targetOnlinePlayers}P)`);
      startGuestDisconnectTimer(0); // o antigo anfitrião tem a mesma tolerância de qualquer jogador
      saveSessionToStorage();
    }

    function startGuestDisconnectTimer(idx) {
      if (guestDisconnectTimers[idx]) clearTimeout(guestDisconnectTimers[idx]);
      guestDisconnectTimers[idx] = setTimeout(() => {
        if (isGameActive && !hasMatchEndedByAbandon) {
          const leavingName = (players && players[idx] && players[idx].name) ? players[idx].name : `Jogador ${idx + 1}`;
          handlePlayerAbandoned(idx, leavingName);
          if (isHost) broadcastP2P({ type: 'PLAYER_ABANDONED', playerIndex: idx, playerName: leavingName });
        }
      }, DISCONNECT_GRACE_PERIOD_MS);
    }

    function demoteToGuest() {
      const room = rtRoom;
      if (!room || room.role !== 'host') return;
      room.role = 'guest';
      isHost = false;
      room.conns.forEach(c => { c.open = false; });
      room.conns.clear();
      hostGuestConnections = [];
      Object.values(guestDisconnectTimers).forEach(t => clearTimeout(t));
      guestDisconnectTimers = {};
      clientHostConn = new RtConn(null);
      setupClientConnection();
      appendChatSystemMessage('Outro jogador assumiu a sala enquanto você estava fora. Sincronizando...');
      updateP2PBadge('waiting', 'Sincronizando com o novo anfitrião...');
      rtTrackPresence();
    }

    function p2pCreateRoom(fixedCode = null, opts = {}) {
      savePlayerNamesToStorage();
      const roomInfo = document.getElementById('hostRoomInfo');
      const roomCodeEl = document.getElementById('myRoomCode');
      roomCodeEl.textContent = '----';
      roomInfo.style.display = 'block';

      const shortCode = fixedCode || generate4DigitCode();

      initRealtimeRoom(shortCode, 'host', () => {
        currentRoomCode = shortCode;
        roomCodeEl.textContent = shortCode;
        isHost = true;
        isP2P = true;
        myP2PIndex = 0;
        hostGuestConnections = [];
        rtTrackPresence();

        playerCount = targetOnlinePlayers;
        const myNameInput = document.getElementById('onlineMyNameInput');
        const hostName = (myNameInput && myNameInput.value.trim()) || 'Jogador 1';

        // Inicializa jogadores com o nome do Host em P1
        const initialNames = [hostName];
        for (let i = 2; i <= playerCount; i++) initialNames.push(`Jogador ${i}`);
        initGame(initialNames);

        updateHeaderPlayerButtons(playerCount);
        updateHostWaitingUI();
        updateP2PBadge('waiting', hostName);
        saveSessionToStorage();
      }, { fresh: true, fixedCode: !!fixedCode, ranked: !!opts.ranked });
    }

    function updateHostWaitingUI() {
      const waitTxt = document.getElementById('waitGuestText');
      const connectedCount = 1 + hostGuestConnections.length;
      if (waitTxt) {
        waitTxt.textContent = `Aguardando jogadores: ${connectedCount} / ${targetOnlinePlayers} conectados`;
      }
    }

    function handleGuestIncoming(conn) {
      // Se não está em jogo e já atingiu o limite de participantes
      if (!isGameActive && hostGuestConnections.length >= targetOnlinePlayers - 1) {
        const existingConnIdx = hostGuestConnections.findIndex(c => c.peer === conn.peer);
        if (existingConnIdx === -1) {
          const sendRoomFull = () => {
            try { conn.send({ type: 'ROOM_FULL' }); } catch (e) { }
            setTimeout(() => { try { conn.close(); } catch (e) { } }, 1000);
          };
          if (conn.open) sendRoomFull();
          else conn.on('open', sendRoomFull);
          return;
        }
      }

      const onConnectionReady = () => {
        // Se a partida ainda não começou (sala de espera), atribui index sequencial
        if (!isGameActive) {
          let assignedIndex = hostGuestConnections.length + 1; // 1, 2 ou 3
          conn.assignedIndex = assignedIndex;
          hostGuestConnections.push(conn);

          conn.send({
            type: 'WELCOME',
            playerIndex: assignedIndex,
            totalPlayers: targetOnlinePlayers,
            roomCode: currentRoomCode
          });

          if (1 + hostGuestConnections.length >= targetOnlinePlayers) {
            isGameActive = true;
            closeMultiplayerModal();
            document.getElementById('mainMenuModal').style.display = 'none';
            const hostName = (players && players[0] && players[0].name) ? players[0].name : 'P1';
            updateP2PBadge('online', `${hostName} (Host - ${targetOnlinePlayers}P)`);
            updateChatVisibility();
            appendChatSystemMessage('Todos os jogadores conectados! A partida começou.');
            const fullState = getFullGameState();
            conn.send({ type: 'SYNC_STATE', state: fullState });
            broadcastP2P({ type: 'SYNC_STATE', state: fullState });
          } else {
            updateHostWaitingUI();
            updateP2PBadge('waiting', `P1 (${1 + hostGuestConnections.length}/${targetOnlinePlayers})`);
          }
        }
        saveSessionToStorage();
      };

      if (conn.open) {
        onConnectionReady();
      } else {
        conn.on('open', onConnectionReady);
      }

      conn.on('data', (data) => {
        handleHostReceivedMessage(conn, data);
      });

      conn.on('close', () => {
        const idx = hostGuestConnections.indexOf(conn);
        const assignedIdx = conn.assignedIndex || (idx !== -1 ? idx + 1 : 1);
        if (idx !== -1) {
          hostGuestConnections.splice(idx, 1);
        }
        updateHostWaitingUI();

        // Se a partida online estiver ativa e o convidado desconectar temporariamente (ex: reload/refresh/bloqueio)
        if (isGameActive && !hasMatchEndedByAbandon) {
          const guestName = (players && players[assignedIdx] && players[assignedIdx].name)
            ? players[assignedIdx].name
            : `Jogador ${assignedIdx + 1}`;
          updateP2PBadge('waiting', `Aguardando ${guestName}...`);
          if (guestDisconnectTimers[assignedIdx]) clearTimeout(guestDisconnectTimers[assignedIdx]);
          guestDisconnectTimers[assignedIdx] = setTimeout(() => {
            if (isGameActive && !hasMatchEndedByAbandon) {
              const leavingName = (players && players[assignedIdx] && players[assignedIdx].name)
                ? players[assignedIdx].name
                : `Jogador ${assignedIdx + 1}`;
              handlePlayerAbandoned(assignedIdx, leavingName);
            }
          }, DISCONNECT_GRACE_PERIOD_MS);
        }
      });
    }

    function p2pJoinRoom(codeOverride = null, opts = {}) {
      savePlayerNamesToStorage();
      let code = codeOverride || document.getElementById('roomCodeInput').value.trim();
      if (!code) {
        alert('Digite o código de 4 dígitos da sala.');
        return;
      }

      currentRoomCode = code.toUpperCase().replace(/^AZUL-/, '');
      isHost = false;
      updateP2PBadge('waiting', 'Conectando...');
      clientHostConn = new RtConn(null);
      setupClientConnection();
      initRealtimeRoom(currentRoomCode, 'guest', null, { fresh: true, ranked: !!opts.ranked });
    }

    function setupClientConnection() {
      const onClientOpen = () => {
        isP2P = true;
        console.log('Conectado ao Host com sucesso!');
        if (hostDisconnectTimer) {
          clearTimeout(hostDisconnectTimer);
          hostDisconnectTimer = null;
        }
        const myNameInput = document.getElementById('onlineMyNameInput');
        const myName = (myNameInput && myNameInput.value.trim())
          || (myP2PIndex !== null && players && players[myP2PIndex] && players[myP2PIndex].name)
          || null;
        clientHostConn.send({ type: 'REQUEST_SYNC', requestedIndex: myP2PIndex, playerName: myName });
      };

      if (clientHostConn.open) {
        onClientOpen();
      } else {
        clientHostConn.on('open', onClientOpen);
      }

      clientHostConn.on('data', (data) => {
        handleClientReceivedMessage(data);
      });

      clientHostConn.on('close', () => {
        if (isGameActive && !hasMatchEndedByAbandon) {
          updateP2PBadge('waiting', 'Reconectando ao Host...');
          // Tenta reconectar imediatamente caso o socket tenha caído
          attemptGuestReconnect();
          scheduleHostMigration();
          if (!hostDisconnectTimer) {
            hostDisconnectTimer = setTimeout(() => {
              if (isGameActive && !hasMatchEndedByAbandon && (!clientHostConn || !clientHostConn.open)) {
                const hostName = (players && players[0] && players[0].name) ? players[0].name : 'Host';
                handlePlayerAbandoned(0, hostName);
              }
            }, DISCONNECT_GRACE_PERIOD_MS);
          }
        } else {
          updateP2PBadge('offline', 'Desconectado');
        }
      });
    }

    function attemptGuestReconnect() {
      // O cliente Realtime reconecta sozinho; aqui só garantimos que o socket esteja ativo
      if (isHost || !currentRoomCode) return;
      if (!rtRoom) {
        if (!clientHostConn) { clientHostConn = new RtConn(null); setupClientConnection(); }
        initRealtimeRoom(currentRoomCode, 'guest');
        return;
      }
      ensureRealtimeConnected();
    }

    function ensureRealtimeConnected() {
      try {
        if (sb && sb.realtime && !sb.realtime.isConnected()) sb.realtime.connect();
      } catch (e) { }
      checkRealtimeHealth();
    }

    // O canal pode parecer "joined" localmente mas estar morto no servidor (ex: após suspensão).
    // Testamos reenviando a presença; se o servidor recusar, recriamos o canal da sala.
    let rtHealthBusy = false;
    async function checkRealtimeHealth() {
      if (!rtRoom || rtHealthBusy || !isP2P) return;
      rtHealthBusy = true;
      const room = rtRoom;
      try {
        let ok = false;
        if (room.channel.state === 'joined') {
          const res = await Promise.race([
            rtTrackPresence(),
            new Promise(r => setTimeout(() => r('timeout'), 5000))
          ]);
          ok = res === 'ok';
        }
        if (!ok && rtRoom === room && !room.destroyed && room.readyFired) {
          console.warn('Canal Realtime inativo, recriando sala...');
          if (room.role === 'guest' && clientHostConn) clientHostConn.open = false;
          initRealtimeRoom(room.roomCode, room.role, null, { rejoin: true });
        }
      } catch (e) {
        console.warn('Health check falhou', e);
      } finally {
        rtHealthBusy = false;
      }
    }
    setInterval(() => { if (isP2P && rtRoom && document.visibilityState === 'visible') checkRealtimeHealth(); }, 45000);

    // Host recebe ação de um convidado, executa localmente e replica para os outros convidados
    function handleHostReceivedMessage(senderConn, msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ACTION') {
        // Segurança: o anfitrião só aceita jogada de quem está na vez e que seja legal
        if (!validateGuestAction(senderConn.assignedIndex, msg.action)) {
          try { senderConn.send({ type: 'SYNC_STATE', state: getFullGameState() }); } catch (e) { }
          return;
        }
        executeGameAction(msg.action, false);
        // Repassa para os outros convidados
        hostGuestConnections.forEach(c => {
          if (c !== senderConn && c.open) {
            c.send(msg);
          }
        });
      } else if (msg.type === 'REQUEST_SYNC') {
        const idx = (Number.isInteger(msg.requestedIndex) && msg.requestedIndex >= 0 && msg.requestedIndex < targetOnlinePlayers && msg.requestedIndex !== myP2PIndex)
          ? msg.requestedIndex
          : (senderConn.assignedIndex || (hostGuestConnections.indexOf(senderConn) + 1));
        // Segurança: não deixa outro cliente tomar o assento de quem está conectado agora
        const seatTaken = hostGuestConnections.some(c => c !== senderConn && c.open && c.assignedIndex === idx && c.peer !== senderConn.peer);
        if (seatTaken) {
          try { senderConn.send({ type: 'ROOM_FULL' }); } catch (e) { }
          return;
        }
        senderConn.assignedIndex = idx;

        // Cancela qualquer timer de abandono por desconexão para este jogador
        if (guestDisconnectTimers[idx]) {
          clearTimeout(guestDisconnectTimers[idx]);
          delete guestDisconnectTimers[idx];
        }

        // Garante que a nova conexão esteja em hostGuestConnections
        const existingIdx = hostGuestConnections.findIndex(c => c.assignedIndex === idx || c === senderConn);
        if (existingIdx !== -1) {
          hostGuestConnections[existingIdx] = senderConn;
        } else {
          hostGuestConnections.push(senderConn);
        }

        if (msg.playerName && players && players[idx]) {
          players[idx].name = cleanName(msg.playerName) || players[idx].name;
        }
        senderConn.send({
          type: 'WELCOME',
          playerIndex: idx,
          totalPlayers: targetOnlinePlayers,
          roomCode: currentRoomCode
        });
        const fullState = getFullGameState();
        senderConn.send({ type: 'SYNC_STATE', state: fullState });
        // Sincroniza nome para os outros participantes
        broadcastP2P({ type: 'SYNC_STATE', state: fullState });

        const hostName = (players && players[0] && players[0].name) ? players[0].name : 'P1';
        updateP2PBadge('online', `${hostName} (Host - ${targetOnlinePlayers}P)`);
        renderBoards();
        saveSessionToStorage();

        // Garante que o host também feche o modal caso ainda esteja aberto
        if (1 + hostGuestConnections.length >= targetOnlinePlayers) {
          closeMultiplayerModal();
          document.getElementById('mainMenuModal').style.display = 'none';
          updateChatVisibility();
        }
      } else if (msg.type === 'SET_PLAYER_NAME') {
        if (msg.playerIndex === senderConn.assignedIndex && players && players[msg.playerIndex] && cleanName(msg.name)) {
          players[msg.playerIndex].name = cleanName(msg.name);
          broadcastP2P({ type: 'SYNC_STATE', state: getFullGameState() });
          renderBoards();
          saveSessionToStorage();
        }
      } else if (msg.type === 'CHAT') {
        // O índice do remetente é o do assento da conexão (não confia no que o cliente declara)
        const seat = senderConn.assignedIndex;
        if (!Number.isInteger(seat)) return;
        const safeMsg = { type: 'CHAT', senderIndex: seat, senderName: cleanName(players && players[seat] && players[seat].name), text: String(msg.text ?? '').slice(0, 500), time: String(msg.time ?? '').slice(0, 10) };
        appendChatMessage(safeMsg.senderIndex, safeMsg.senderName, safeMsg.text, safeMsg.time, false);
        hostGuestConnections.forEach(c => {
          if (c !== senderConn && c.open) {
            try { c.send(safeMsg); } catch (e) { }
          }
        });
      } else if (msg.type === 'PLAYER_ABANDONED') {
        // Segurança: um jogador só pode abandonar a si mesmo (nunca declarar que outro saiu)
        const seat = senderConn.assignedIndex;
        if (!Number.isInteger(seat) || msg.playerIndex !== seat) return;
        const name = cleanName(players && players[seat] && players[seat].name);
        handlePlayerAbandoned(seat, name, 'abandon');
        hostGuestConnections.forEach(c => {
          if (c !== senderConn && c.open) {
            try { c.send({ type: 'PLAYER_ABANDONED', playerIndex: seat, playerName: name, reason: 'abandon' }); } catch (e) { }
          }
        });
      }
    }

    // Segurança: valida uma jogada recebida de um convidado
    function validateGuestAction(seat, a) {
      if (!a || typeof a !== 'object' || !Number.isInteger(seat)) return false;
      if (!isGameActive || hasMatchEndedByAbandon || isScoringAnimationActive) return false;
      if (seat !== turn) return false;
      switch (a.type) {
        case 'PICK_FACTORY':
          return Number.isInteger(a.fIdx) && !!factories[a.fIdx] && COLORS.includes(a.color) && factories[a.fIdx].includes(a.color);
        case 'PICK_CENTER':
          return COLORS.includes(a.color) && center.includes(a.color);
        case 'STAGE_ROW': {
          if (!selected || !Number.isInteger(a.rIdx) || a.rIdx < 0 || a.rIdx > 4) return false;
          const p = players[turn];
          const row = p.pattern[a.rIdx];
          if (row.count > 0 && row.color !== selected.color) return false;
          return !p.wall[a.rIdx][WALL_LAYOUT[a.rIdx].indexOf(selected.color)];
        }
        case 'STAGE_FLOOR': return !!selected;
        case 'CONFIRM_MOVE': return !!selected && !!stagedMove;
        case 'CANCEL_MOVE': return !!selected;
        default: return false;
      }
    }

    // Convidado recebe mensagens do Host
    function handleClientReceivedMessage(msg) {
      if (msg.type === 'WELCOME') {
        myP2PIndex = msg.playerIndex;
        playerCount = msg.totalPlayers;
        if (msg.roomCode) currentRoomCode = msg.roomCode;
        updateHeaderPlayerButtons(playerCount);

        const myNameInput = document.getElementById('onlineMyNameInput');
        const myName = (myNameInput && myNameInput.value.trim()) || `P${myP2PIndex + 1}`;
        updateP2PBadge('waiting', `${myName} (Conectado à sala ${currentRoomCode})`);
        rtTrackPresence(); // anuncia meu índice (usado na eleição de novo anfitrião)
      } else if (msg.type === 'ROOM_FULL') {
        alert('Esta sala já atingiu o número máximo de jogadores.');
      } else if (msg.type === 'SYNC_STATE') {
        isGameActive = true;
        applyFullGameState(msg.state);
        closeMultiplayerModal();
        document.getElementById('mainMenuModal').style.display = 'none';
        const myName = (myP2PIndex !== null && players[myP2PIndex] && players[myP2PIndex].name)
          ? players[myP2PIndex].name
          : (myP2PIndex !== null ? `P${myP2PIndex + 1}` : '?');
        updateP2PBadge('online', `${myName} (${playerCount}P)`);
        updateChatVisibility();
        saveSessionToStorage();
      } else if (msg.type === 'ACTION') {
        executeGameAction(msg.action, false);
      } else if (msg.type === 'CHAT') {
        const isFromMe = (typeof msg.senderIndex === 'number' && myP2PIndex !== null && msg.senderIndex === myP2PIndex);
        appendChatMessage(msg.senderIndex, msg.senderName, msg.text, msg.time, isFromMe);
      } else if (msg.type === 'PLAYER_ABANDONED') {
        if (!Number.isInteger(msg.playerIndex)) return;
        handlePlayerAbandoned(msg.playerIndex, cleanName(msg.playerName), msg.reason === 'timeout' ? 'timeout' : 'abandon');
      } else if (msg.type === 'CLOCK_SYNC') {
        if (players && Array.isArray(msg.clocks)) {
          msg.clocks.forEach((c, i) => { if (players[i] && typeof c === 'number') players[i].clock = c; });
          updateClockDisplays();
        }
      }
    }

    function broadcastP2P(data) {
      if (isHost) {
        hostGuestConnections.forEach(c => {
          if (c && c.open) c.send(data);
        });
      } else if (clientHostConn && clientHostConn.open) {
        clientHostConn.send(data);
      }
    }

    function executeGameAction(action, broadcast = true) {
      if (action.type === 'PICK_FACTORY') {
        pickFromFactory(action.fIdx, action.color, false);
      } else if (action.type === 'PICK_CENTER') {
        pickFromCenter(action.color, false);
      } else if (action.type === 'STAGE_ROW') {
        stagePlacement('row', action.rIdx, false);
      } else if (action.type === 'STAGE_FLOOR') {
        stagePlacement('floor', null, false);
      } else if (action.type === 'CONFIRM_MOVE') {
        confirmMove(false);
      } else if (action.type === 'CANCEL_MOVE') {
        cancelMove(false);
      }

      if (broadcast && isP2P) {
        broadcastP2P({ type: 'ACTION', action });
      }
      saveSessionToStorage();
    }

    function updateHeaderPlayerButtons(count) {
      [2, 3, 4].forEach(n => {
        const btn = document.getElementById(`btn${n}p`);
        if (btn) {
          if (n === count) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    }

    function getFullGameState() {
      return {
        playerCount,
        players,
        factories,
        center,
        bag,
        discard,
        turn,
        round,
        nextStartPlayer,
        starterTileInCenter,
        selected,
        stagedMove,
        hostEpoch,
        movesPlayed
      };
    }

    function saveSessionToStorage() {
      try {
        if (!isGameActive) {
          clearSavedSession();
          return;
        }

        let mode = 'local';
        if (isP2P) mode = 'online';
        else if (isBotMode) mode = 'bot';

        const session = {
          mode,
          isGameActive,
          isP2P,
          isHost,
          myP2PIndex,
          currentRoomCode,
          targetOnlinePlayers,
          isBotMode,
          botDifficulty,
          playerCount,
          rankedMatchId,
          hostEpoch,
          movesPlayed,
          gameState: getFullGameState()
        };
        sessionStorage.setItem('azul_saved_session', JSON.stringify(session));
      } catch (e) {
        console.warn('Erro ao salvar sessão local:', e);
      }
    }

    function clearSavedSession() {
      try {
        sessionStorage.removeItem('azul_saved_session');
        localStorage.removeItem('azul_saved_session');
      } catch (e) { }
    }

    // Segurança: estado vindo da rede é validado (tipos, cores, nomes) antes de ir para a tela
    function sanitizeIncomingState(st) {
      const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
      const tile = c => COLORS.includes(c) || c === 'starter';
      const tiles = arr => (Array.isArray(arr) ? arr.filter(tile).slice(0, 120) : []);
      const out = { ...st };
      out.playerCount = num(st.playerCount, 2, 2, 4);
      out.players = (Array.isArray(st.players) ? st.players : []).slice(0, 4).map((p, i) => {
        const q = { ...p, id: i, name: cleanName(p.name), score: num(p.score, 0, 0, 1000), clock: num(p.clock, CLOCK_INITIAL_MS, 0, CLOCK_MAX_MS) };
        ['boardScore', 'lineBonus', 'colBonus', 'colorBonus', 'finalBonus'].forEach(k => { if (p[k] !== undefined) q[k] = num(p[k], 0, 0, 1000); });
        q.floor = tiles(p.floor).slice(0, 7);
        q.pattern = Array.from({ length: 5 }, (_, r) => {
          const row = (p.pattern && p.pattern[r]) || {};
          return { size: r + 1, count: num(row.count, 0, 0, r + 1), color: COLORS.includes(row.color) ? row.color : null };
        });
        q.wall = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => !!(p.wall && p.wall[r] && p.wall[r][c])));
        delete q.uid;
        return q;
      });
      out.factories = (Array.isArray(st.factories) ? st.factories : []).slice(0, 9).map(tiles);
      out.center = tiles(st.center);
      out.bag = tiles(st.bag);
      out.discard = tiles(st.discard);
      out.turn = num(st.turn, 0, 0, 3);
      out.round = num(st.round, 1, 1, 99);
      out.nextStartPlayer = num(st.nextStartPlayer, 0, 0, 3);
      out.starterTileInCenter = !!st.starterTileInCenter;
      const sel = st.selected;
      out.selected = (sel && COLORS.includes(sel.color) && (sel.source === 'f' || sel.source === 'c'))
        ? { source: sel.source, color: sel.color, count: num(sel.count, 1, 1, 20), fIdx: Number.isInteger(sel.fIdx) ? sel.fIdx : undefined } : null;
      const sm = st.stagedMove;
      out.stagedMove = (sm && (sm.target === 'floor' || (sm.target === 'row' && Number.isInteger(sm.rIdx) && sm.rIdx >= 0 && sm.rIdx <= 4)))
        ? (sm.target === 'floor' ? { target: 'floor' } : { target: 'row', rIdx: sm.rIdx }) : null;
      return out;
    }

    function applyFullGameState(state) {
      state = sanitizeIncomingState(state);
      playerCount = state.playerCount;
      players = state.players;
      players.forEach(p => { if (typeof p.clock !== 'number') p.clock = CLOCK_INITIAL_MS; });
      factories = state.factories;
      center = state.center;
      bag = state.bag;
      discard = state.discard;
      turn = state.turn;
      round = state.round;
      nextStartPlayer = state.nextStartPlayer;
      starterTileInCenter = state.starterTileInCenter;
      selected = state.selected;
      stagedMove = state.stagedMove || null;
      hostEpoch = Math.max(hostEpoch || 0, state.hostEpoch || 0);
      movesPlayed = state.movesPlayed || 0;
      updateHeaderPlayerButtons(playerCount);
      renderAll();
      saveSessionToStorage();
    }

    function updateP2PBadge(status, text) {
      const badge = document.getElementById('p2pStatus');
      const dot = document.getElementById('p2pDot');
      const lbl = document.getElementById('p2pLabel');
      badge.style.display = 'inline-flex';
      dot.className = `status-dot ${status}`;
      lbl.textContent = text;
    }

    function copyInviteLink() {
      if (!currentRoomCode) return;
      const url = `${window.location.origin}${window.location.pathname}?sala=${currentRoomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copiado para a área de transferência! Envie para seus amigos entrarem.');
      }).catch(() => {
        prompt('Copie o link abaixo:', url);
      });
    }

    let currentOnlineTab = 'create';

    function switchOnlineTab(tab) {
      currentOnlineTab = tab;
      const tabCreateBtn = document.getElementById('tabCreateBtn');
      const tabJoinBtn = document.getElementById('tabJoinBtn');
      const tabCreateContent = document.getElementById('onlineTabCreate');
      const tabJoinContent = document.getElementById('onlineTabJoin');

      if (tab === 'create') {
        if (tabCreateBtn) tabCreateBtn.classList.add('active');
        if (tabJoinBtn) tabJoinBtn.classList.remove('active');
        if (tabCreateContent) tabCreateContent.style.display = 'block';
        if (tabJoinContent) tabJoinContent.style.display = 'none';
      } else {
        if (tabJoinBtn) tabJoinBtn.classList.add('active');
        if (tabCreateBtn) tabCreateBtn.classList.remove('active');
        if (tabJoinContent) tabJoinContent.style.display = 'block';
        if (tabCreateContent) tabCreateContent.style.display = 'none';
      }
    }

    function openMultiplayerModal(initialTab = 'create') {
      loadSavedPlayerNames();
      document.getElementById('mainMenuModal').style.display = 'none';
      document.getElementById('multiplayerModal').style.display = 'flex';
      switchOnlineTab(initialTab);
    }

    function closeMultiplayerModal() {
      document.getElementById('multiplayerModal').style.display = 'none';
    }

    function backFromMultiplayerToMainMenu() {
      closeMultiplayerModal();
      // Se não estiver em jogo ativo, fecha conexões pendentes e volta ao menu principal
      if (!isP2P || myP2PIndex === null) {
        destroyRealtimeRoom();
        isP2P = false;
        isHost = false;
        myP2PIndex = null;
        currentRoomCode = null;
        const badge = document.getElementById('p2pStatus');
        if (badge) badge.style.display = 'none';
        updateChatVisibility();
        clearChatHistory();
      }
      document.getElementById('mainMenuModal').style.display = 'flex';
    }

    function exitToMainMenu() {
      const confirmModal = document.getElementById('confirmExitModal');
      if (confirmModal) {
        confirmModal.style.display = 'flex';
      } else {
        confirmExitGame();
      }
    }

    function closeConfirmExitModal() {
      const confirmModal = document.getElementById('confirmExitModal');
      if (confirmModal) confirmModal.style.display = 'none';
    }

    function handlePlayerAbandoned(abandonedIndex, abandonedName, reason) {
      if (!isGameActive || hasMatchEndedByAbandon) return;
      recordMatchResult(reason === 'timeout' ? 'timeout' : 'abandon', abandonedIndex);
      hasMatchEndedByAbandon = true;
      isGameActive = false;
      clearSavedSession();

      if (botTurnTimer) {
        clearTimeout(botTurnTimer);
        botTurnTimer = null;
      }

      // Identifica quem abandonou e quem permaneceu na partida
      const leavingName = abandonedName || (players && players[abandonedIndex] && players[abandonedIndex].name) || `Jogador ${abandonedIndex + 1}`;
      appendChatSystemMessage(reason === 'timeout' ? `${leavingName} ficou sem tempo.` : `${leavingName} desconectou da partida.`);
      const remainingPlayers = (players || []).filter((p, idx) => idx !== abandonedIndex);
      const remainingWinner = remainingPlayers.length === 1 ? remainingPlayers[0] : null;

      const modal = document.getElementById('endModal');
      const title = modal ? modal.querySelector('h2') : null;
      if (title) title.innerHTML = icon('trophy') + (reason === 'timeout' ? ' Vitória por Tempo!' : ' Vitória por Abandono!');

      const desc = document.getElementById('winnerDesc');
      if (desc) {
        let listHtml = '';
        if (remainingWinner) {
          const isMe = (isP2P && remainingWinner.id === myP2PIndex);
          const baseName = escapeHtml(remainingWinner.name || `Jogador ${remainingWinner.id + 1}`);
          const winnerLabel = isMe ? `${baseName} (Você)` : baseName;

          listHtml = `
            <div style="margin-bottom: 16px; color: #94a3b8; font-size: 13px;">
              <strong style="color: #f87171;">${escapeHtml(leavingName)}</strong> ${reason === 'timeout' ? 'ficou sem tempo.' : 'saiu da partida.'}
            </div>
            <div class="endgame-list">
              <div class="endgame-item winner">
                <div class="endgame-header-row">
                  <div class="endgame-left">
                    <span class="endgame-rank">${icon('trophy')} 1º</span>
                    <span class="endgame-name">${winnerLabel}</span>
                  </div>
                  <div class="endgame-right">
                    <span class="endgame-score">${remainingWinner.score} pts</span>
                    <span class="endgame-bonus" style="color: #4ade80;">Vencedor</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          // No caso de mais de um jogador restante (3P / 4P)
          const sorted = [...remainingPlayers].sort((a, b) => b.score - a.score);
          listHtml = `
            <div style="margin-bottom: 16px; color: #94a3b8; font-size: 13px;">
              <strong style="color: #f87171;">${escapeHtml(leavingName)}</strong> ${reason === 'timeout' ? 'ficou sem tempo.' : 'saiu da partida.'}
            </div>
            <div class="endgame-list">
              ${sorted.map((p, idx) => {
            const isWinner = idx === 0;
            const isMe = (isP2P && p.id === myP2PIndex);
            const baseName = escapeHtml(p.name || `Jogador ${p.id + 1}`);
            const pLabel = isMe ? `${baseName} (Você)` : baseName;
            return `
                  <div class="endgame-item ${isWinner ? 'winner' : ''}">
                    <div class="endgame-header-row">
                      <div class="endgame-left">
                        <span class="endgame-rank">${idx === 0 ? `${icon('trophy')} 1º` : `${idx + 1}º`}</span>
                        <span class="endgame-name">${pLabel}</span>
                      </div>
                      <div class="endgame-right">
                        <span class="endgame-score">${p.score} pts</span>
                        ${isWinner ? '<span class="endgame-bonus" style="color: #4ade80;">Vencedor</span>' : ''}
                      </div>
                    </div>
                  </div>
                `;
          }).join('')}
            </div>
          `;
        }
        desc.innerHTML = listHtml;
      }

      if (modal) modal.style.display = 'flex';
      updateP2PBadge('offline', 'Partida Finalizada');
    }

    function confirmExitGame() {
      closeConfirmExitModal();

      // Saída voluntária de partida online em andamento conta como derrota
      if (isP2P && isGameActive && !hasMatchEndedByAbandon && myP2PIndex !== null) {
        recordMatchResult('abandon', myP2PIndex);
      }
      matchRecorded = false;

      // Notifica os outros jogadores que este jogador abandonou a partida
      if (isP2P && isGameActive) {
        const myName = (myP2PIndex !== null && players && players[myP2PIndex] && players[myP2PIndex].name)
          ? players[myP2PIndex].name
          : (isHost ? 'Host' : `Jogador ${(myP2PIndex !== null ? myP2PIndex : 0) + 1}`);

        try {
          broadcastP2P({
            type: 'PLAYER_ABANDONED',
            playerIndex: myP2PIndex,
            playerName: myName
          });
        } catch (e) { }
      }

      clearSavedSession();
      hasMatchEndedByAbandon = false;
      rankedMatchId = null;
      hostEpoch = 0;
      movesPlayed = 0;
      if (hostMigrationTimer) { clearTimeout(hostMigrationTimer); hostMigrationTimer = null; }

      if (isP2P) {
        // Aguarda 100ms para envio da mensagem pelo socket antes de fechar conexões
        setTimeout(() => {
          if (isHost) {
            hostGuestConnections.forEach(c => { try { c.close(); } catch (e) { } });
            hostGuestConnections = [];
          } else if (clientHostConn) {
            try { clientHostConn.close(); } catch (e) { }
            clientHostConn = null;
          }
          destroyRealtimeRoom();
          isP2P = false;
          isHost = false;
          myP2PIndex = null;
          currentRoomCode = null;
        }, 100);
      }

      if (botTurnTimer) {
        clearTimeout(botTurnTimer);
        botTurnTimer = null;
      }
      isBotMode = false;
      isGameActive = false;
      updateChatVisibility();
      clearChatHistory();

      const badge = document.getElementById('p2pStatus');
      if (badge) badge.style.display = 'none';

      // Limpa qualquer parâmetro de URL (?sala=...)
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Reinicia tabuleiro base limpo
      initGame();

      document.getElementById('multiplayerModal').style.display = 'none';
      const localModal = document.getElementById('localModal');
      if (localModal) localModal.style.display = 'none';
      const botModal = document.getElementById('botModal');
      if (botModal) botModal.style.display = 'none';
      document.getElementById('endModal').style.display = 'none';
      document.getElementById('mainMenuModal').style.display = 'flex';
    }

    // Ao desbloquear a tela / voltar para a aba: garante o socket do Realtime ativo
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isP2P && rtRoom) {
        ensureRealtimeConnected();
      }
    });

    function restartLocalGame() {
      if (isP2P) {
        if (!isHost) {
          alert('Apenas o Host (P1) pode reiniciar a partida online.');
          return;
        }
        if (!confirm('Deseja reiniciar a partida para todos os jogadores?')) return;
        initGame();
        broadcastP2P({ type: 'SYNC_STATE', state: getFullGameState() });
      } else if (isBotMode) {
        initGame(['Você', 'Bot']);
      } else {
        const names = players ? players.map(p => p.name) : null;
        initGame(names);
      }
    }

