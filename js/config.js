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
      x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
      alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
      'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
      // avatares (a chave é o que fica salvo em profiles.avatar)
      star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
      crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
      rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
      dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8.5 8.5h.01"/><path d="M15.5 15.5h.01"/><path d="M12 12h.01"/><path d="M15.5 8.5h.01"/><path d="M8.5 15.5h.01"/>',
      target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
      leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
      heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
      diamond: '<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>',
      shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
      anchor: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
      music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>'
    };
    const AVATAR_KEYS = ['star', 'zap', 'flame', 'crown', 'rocket', 'dice', 'target', 'moon', 'leaf', 'heart', 'diamond', 'shield', 'sun', 'anchor', 'music', 'mountain'];

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

