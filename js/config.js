    /* =====================================================================
       CONFIGURAÇÃO E CONSTANTES DO JOGO AZUL
       ===================================================================== */
    const COLORS = ['blue', 'yellow', 'red', 'black', 'white'];

    // Segurança: nomes e textos vindos da rede são DADOS, nunca HTML.
    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
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

