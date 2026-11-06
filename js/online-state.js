    /* =====================================================================
       MULTIPLAYER ONLINE (SUPABASE REALTIME) - SUPORTE A 2, 3 E 4 JOGADORES
       ===================================================================== */
    let rtRoom = null; // Sala online via Supabase Realtime
    let isP2P = false;
    let isHost = false;
    let myP2PIndex = null; // 0 = Host (P1), 1 = P2, 2 = P3, 3 = P4
    let currentRoomCode = null;
    let targetOnlinePlayers = 2;

    // Para o Host: conexões com convidados [connP2, connP3, connP4]
    let hostGuestConnections = [];
    // Para o Convidado: conexão direta com o Host
    let clientHostConn = null;
    let guestDisconnectTimers = {};
    let hostDisconnectTimer = null;
    const DISCONNECT_GRACE_PERIOD_MS = 300000; // 5min de tolerância para tela bloqueada / oscilação de sinal

