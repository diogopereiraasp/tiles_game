    /* =====================================================================
       CONFIGURAÇÃO E CONSTANTES DO JOGO AZUL
       ===================================================================== */
    const COLORS = ['blue', 'yellow', 'red', 'black', 'white'];

    // Segurança: nomes e textos vindos da rede são DADOS, nunca HTML.
    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    // Ícones SVG embutidos (traço, herdam a cor do texto). Use icon('nome') em JS ou <span data-icon="nome"></span> no HTML.
    const ICONS = {
      chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
      phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
      volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
      'volume-off': '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
      sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
      help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/>',
      trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-1.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98 1.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      shapes: '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
      cube: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
      x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
      alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
      'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'
    };

    function icon(name, cls = '') {
      const body = ICONS[name];
      if (!body) return '';
      return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    function hydrateIcons(root = document) {
      root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
    }

    // ── Avisos do próprio jogo (no lugar de alert/confirm/prompt do navegador, que travam a tela e quebram o visual) ──
    let gameToastTimer = null;
    function gameToast(text, ms = 3500) {
      let el = document.getElementById('gameToast');
      if (!el) { el = document.createElement('div'); el.id = 'gameToast'; el.className = 'game-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
      el.textContent = String(text);
      el.style.display = 'block';
      clearTimeout(gameToastTimer);
      gameToastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
    }

    // Caixa de diálogo simples. opts: { title, text, inputValue (campo só leitura para copiar), buttons: [{label, primary, onClick}] }
    function gameDialog(opts) {
      let ov = document.getElementById('gameDialog');
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'gameDialog'; ov.className = 'modal-overlay'; ov.style.display = 'flex'; ov.style.zIndex = '600';
      ov.setAttribute('role', 'alertdialog');
      const box = document.createElement('div'); box.className = 'modal-box'; box.style.maxWidth = '340px';
      if (opts.title) { const h = document.createElement('h2'); h.textContent = opts.title; box.appendChild(h); }
      const p = document.createElement('p'); p.style.cssText = 'margin-bottom: 14px; line-height: 1.45;'; p.textContent = opts.text || ''; box.appendChild(p);
      if (opts.inputValue !== undefined) {
        const inp = document.createElement('input'); inp.type = 'text'; inp.readOnly = true; inp.value = opts.inputValue;
        inp.style.cssText = 'width: 100%; margin-bottom: 14px; box-sizing: border-box;';
        inp.addEventListener('focus', () => inp.select());
        box.appendChild(inp); setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 0);
      }
      const row = document.createElement('div'); row.style.cssText = 'display: flex; gap: 10px;';
      (opts.buttons || [{ label: 'OK', primary: true }]).forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'btn-toggle' + (b.primary ? ' active' : ''); btn.style.cssText = 'flex: 1; padding: 10px; font-weight: 700;'; btn.textContent = b.label;
        btn.addEventListener('click', () => { ov.remove(); if (b.onClick) b.onClick(); });
        row.appendChild(btn);
      });
      box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov);
    }
    const gameAlert = (text, title) => gameDialog({ title, text });
    const gameConfirm = (text, onYes, yesLabel = 'Sim', noLabel = 'Cancelar') =>
      gameDialog({ text, buttons: [{ label: noLabel }, { label: yesLabel, primary: true, onClick: onYes }] });

    // Nome de jogador: sem caracteres de controle nem < >, espaços normalizados, no máximo 15 caracteres
    function cleanName(str) {
      return String(str ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 15);
    }

    const WALL_LAYOUT = [
      ['blue', 'yellow', 'red', 'black', 'white'],
      ['white', 'blue', 'yellow', 'red', 'black'],
      ['black', 'white', 'blue', 'yellow', 'red'],
      ['red', 'black', 'white', 'blue', 'yellow'],
      ['yellow', 'red', 'black', 'white', 'blue']
    ];

    // MODO AVANÇADO (lado cinza do tabuleiro): a parede não tem cores marcadas. Ao pontuar uma linha completa,
    // a pessoa escolhe a coluna da peça; a cor não pode repetir na mesma linha nem na mesma coluna.
    let advancedMode = false;
    const emptyWallColors = () => Array.from({ length: 5 }, () => Array(5).fill(null));

    // Cor da peça que está na casa (modo normal: a cor fixa da parede)
    function wallCellColor(p, r, c) {
      if (!advancedMode) return WALL_LAYOUT[r][c];
      return (p.wallColors && p.wallColors[r][c]) || null;
    }

    // Quantas peças dessa cor já estão na parede
    function colorPlacedCount(p, color) {
      let n = 0;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        if (p.wall[r][c] && wallCellColor(p, r, c) === color) n++;
      }
      return n;
    }

    // Colunas onde a cor pode entrar na linha r (modo normal: 0 ou 1 coluna)
    function validCols(p, r, color) {
      if (!advancedMode) {
        const c = WALL_LAYOUT[r].indexOf(color);
        return (c >= 0 && !p.wall[r][c]) ? [c] : [];
      }
      const wc = p.wallColors;
      for (let c = 0; c < 5; c++) if (p.wall[r][c] && wc[r][c] === color) return []; // a cor já está na linha
      const cols = [];
      for (let c = 0; c < 5; c++) {
        if (p.wall[r][c]) continue;
        let clash = false;
        for (let rr = 0; rr < 5; rr++) if (p.wall[rr][c] && wc[rr][c] === color) { clash = true; break; }
        if (!clash) cols.push(c);
      }
      return cols;
    }

    // Melhor coluna para a peça (usada pelo bot e como coluna-alvo nas heurísticas): mais pontos agora,
    // coluna e cor mais completas, leve preferência pelo centro
    function bestWallCol(p, r, color, cols) {
      let best = cols[0], bestScore = -Infinity;
      cols.forEach(c => {
        p.wall[r][c] = true; p.wallColors[r][c] = color;
        const pts = calculateTileScore(p.wall, r, c);
        let colFilled = 0;
        for (let rr = 0; rr < 5; rr++) if (p.wall[rr][c]) colFilled++;
        const colorN = colorPlacedCount(p, color);
        p.wall[r][c] = false; p.wallColors[r][c] = null;
        const sc = pts + colFilled * 0.9 + colorN * 0.7 - Math.abs(c - 2) * 0.15;
        if (sc > bestScore) { bestScore = sc; best = c; }
      });
      return best;
    }

    // Coluna-alvo da cor na linha (modo normal: a fixa; avançado: a melhor válida, ou -1 se não houver)
    function wallColFor(p, r, color) {
      if (!advancedMode) return WALL_LAYOUT[r].indexOf(color);
      const cols = validCols(p, r, color);
      return cols.length ? bestWallCol(p, r, color, cols) : -1;
    }

    const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3];

    let playerCount = 2;
    let players = [];
    let factories = [];
    let center = [];
    let bag = [];
    let discard = [];
    let turn = 0;
    let round = 1;
    let nextStartPlayer = 0;
    let starterTileInCenter = true;

    // Selection state
    let selected = null; // { source: 'f'|'c', fIdx: number, color: string, count: number }
    let stagedMove = null; // { target: 'row'|'floor', rIdx?: number } - BGA style preview

    // Bot Mode State (vs Bot apenas 2 jogadores)
    let isBotMode = false;
    let botDifficulty = 'hard'; // 'easy' | 'medium' | 'hard'
    let botTurnTimer = null;
    let isGameActive = false;
    let hasMatchEndedByAbandon = false;
    let matchFinished = false; // partida terminou normalmente (sair/jogar novamente depois disso não é abandono)

    function getBotDifficultyLabel(diff) {
      if (diff === 'easy') return 'Fácil';
      if (diff === 'medium') return 'Médio';
      return 'Difícil';
    }

    function getBotDifficultyTag(diff) {
      if (diff === 'easy') return 'Iniciante';
      if (diff === 'medium') return 'Estratégico';
      return 'Mestre';
    }

