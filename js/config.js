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

