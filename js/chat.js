    /* =====================================================================
       CHAT DA PARTIDA ONLINE (P2P)
       ===================================================================== */
    let unreadChatCount = 0;
    const CHAT_PLAYER_COLORS = ['#38bdf8', '#eab308', '#ef4444', '#4ade80'];

    function escapeChatHTML(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function updateChatVisibility() {
      // O chat só fica disponível se a partida estiver ativa e for online (P2P)
      const isOnlineActive = Boolean(isP2P && isGameActive);
      const headerBtn = document.getElementById('chatHeaderBtn');
      const floatBtn = document.getElementById('chatFloatingBtn');
      const chatWin = document.getElementById('chatWindow');

      if (headerBtn) headerBtn.style.display = isOnlineActive ? 'inline-flex' : 'none';
      if (floatBtn) floatBtn.style.display = isOnlineActive ? 'flex' : 'none';

      if (!isOnlineActive) {
        if (chatWin) chatWin.style.display = 'none';
        unreadChatCount = 0;
        updateChatBadge();
      }
    }

    function toggleChatWindow() {
      const chatWin = document.getElementById('chatWindow');
      if (!chatWin) return;
      const isOpening = (chatWin.style.display === 'none' || !chatWin.style.display);
      if (isOpening) {
        chatWin.style.display = 'flex';
        unreadChatCount = 0;
        updateChatBadge();
        const input = document.getElementById('chatInput');
        if (input) setTimeout(() => input.focus(), 60);
        const msgContainer = document.getElementById('chatMessages');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
      } else {
        chatWin.style.display = 'none';
      }
    }

    function updateChatBadge() {
      const hBadge = document.getElementById('chatHeaderBadge');
      const fBadge = document.getElementById('chatFloatingBadge');
      const text = unreadChatCount > 9 ? '9+' : String(unreadChatCount);
      const show = unreadChatCount > 0;

      if (hBadge) {
        hBadge.textContent = text;
        hBadge.style.display = show ? 'inline-block' : 'none';
      }
      if (fBadge) {
        fBadge.textContent = text;
        fBadge.style.display = show ? 'inline-block' : 'none';
      }
    }

    function appendChatMessage(senderIndex, senderName, text, time, isOwn = false) {
      const msgContainer = document.getElementById('chatMessages');
      if (!msgContainer) return;

      const chatWin = document.getElementById('chatWindow');
      const isOpen = chatWin && chatWin.style.display !== 'none';

      if (!isOpen && !isOwn) {
        unreadChatCount++;
        updateChatBadge();
      }

      const safeText = escapeChatHTML(text);
      const fallbackName = `Jogador ${(typeof senderIndex === 'number' ? senderIndex + 1 : 1)}`;
      const safeName = escapeChatHTML(senderName || fallbackName);
      const color = CHAT_PLAYER_COLORS[(typeof senderIndex === 'number' && senderIndex >= 0) ? (senderIndex % CHAT_PLAYER_COLORS.length) : 0];

      const row = document.createElement('div');
      row.className = `chat-msg-row ${isOwn ? 'own' : 'other'}`;

      const meta = document.createElement('div');
      meta.className = 'chat-msg-meta';
      meta.innerHTML = isOwn
        ? `<span>${escapeChatHTML(time || '')}</span><strong style="color: ${color}">Você</strong>`
        : `<strong style="color: ${color}">${safeName}</strong><span>${escapeChatHTML(time || '')}</span>`;

      const bubble = document.createElement('div');
      bubble.className = 'chat-msg-bubble';
      bubble.innerHTML = safeText;

      row.appendChild(meta);
      row.appendChild(bubble);
      msgContainer.appendChild(row);

      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function appendChatSystemMessage(text) {
      const msgContainer = document.getElementById('chatMessages');
      if (!msgContainer) return;

      const sysDiv = document.createElement('div');
      sysDiv.className = 'chat-system-msg';
      sysDiv.textContent = text;
      msgContainer.appendChild(sysDiv);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function clearChatHistory() {
      const msgContainer = document.getElementById('chatMessages');
      if (msgContainer) {
        msgContainer.innerHTML = '<div class="chat-system-msg">Chat online conectado. Converse com os jogadores durante a partida!</div>';
      }
      unreadChatCount = 0;
      updateChatBadge();
    }

    function sendChatMessage() {
      const input = document.getElementById('chatInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      const senderIdx = (myP2PIndex !== null) ? myP2PIndex : 0;
      const myName = (players && players[senderIdx] && players[senderIdx].name)
        ? players[senderIdx].name
        : (isHost ? 'Host' : `Jogador ${senderIdx + 1}`);

      const now = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const chatMsg = {
        type: 'CHAT',
        senderIndex: senderIdx,
        senderName: myName,
        text: text,
        time: time
      };

      // Exibe para si mesmo
      appendChatMessage(senderIdx, myName, text, time, true);

      // Envia via WebRTC
      if (isHost) {
        hostGuestConnections.forEach(c => {
          if (c && c.open) {
            try { c.send(chatMsg); } catch (e) { }
          }
        });
      } else if (clientHostConn && clientHostConn.open) {
        try { clientHostConn.send(chatMsg); } catch (e) { }
      }
    }

