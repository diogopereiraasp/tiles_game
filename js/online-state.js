    /* =====================================================================
       MULTIPLAYER ONLINE (SUPABASE REALTIME) - SUPORTE A 2, 3 E 4 JOGADORES
       ===================================================================== */
    let rtRoom = null; // Sala online via Supabase Realtime
    let isP2P = false;
    let isHost = false;
    let scoreHistory = []; // pontos de cada jogador ao fim de cada rodada: [[p0,p1,...], ...] (resumo do fim de partida)
    let stateVer = 0; // nº de jogadas (ACTION) aplicadas; todos os aparelhos avançam juntos. Salto = mensagem perdida => ressincroniza
    let lastResyncAt = 0;
    let myP2PIndex = null; // 0 = Host (P1), 1 = P2, 2 = P3, 3 = P4
    let currentRoomCode = null;
    let targetOnlinePlayers = 2;

    // Para o Host: conexões com convidados [connP2, connP3, connP4]
    let hostGuestConnections = [];
    // Para o Convidado: conexão direta com o Host
    let clientHostConn = null;
    let guestDisconnectTimers = {};
    let hostDisconnectTimer = null;
    let rankedMatchId = null;   // id da partida ranqueada no servidor (null = sala de amigos, sem Elo)
    let hostEpoch = 0;          // sobe 1 a cada troca de anfitrião (o maior vence em caso de conflito)
    let movesPlayed = 0;        // jogadas confirmadas (o servidor exige um mínimo para validar vitória por abandono)
    let hostMigrationTimer = null;
    const HOST_MIGRATION_DELAY_MS = 10000; // sem anfitrião por 10s => um convidado assume a sala
    const DISCONNECT_GRACE_PERIOD_MS = 300000; // 5min de tolerância para tela bloqueada / oscilação de sinal

