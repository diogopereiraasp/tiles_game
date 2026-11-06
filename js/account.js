    // ── Supabase: Auth + Histórico + Ranking ──
    // Apenas a URL e a chave PUBLICÁVEL podem ficar aqui (o código é público no GitHub Pages).
    // A segurança dos dados é garantida pelas políticas RLS em supabase/schema.sql.
    const SUPABASE_URL = 'https://cbhjtbjrbtkelpsmqsly.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dyLQNUxYMHBW_xy-DTzOhw_CQWd-hV3';
    const sb = (window.supabase && window.supabase.createClient)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          realtime: { params: { eventsPerSecond: 30 } }
        })
      : null;
    let authUser = null;
    let authProfile = null;
    let matchRecorded = false;
    let leaderboardTab = 'online';
    let settledOnce = false;

    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    async function loadProfile() {
      if (!sb || !authUser) { authProfile = null; return; }
      const { data } = await sb.from('profiles').select('id, display_name, elo').eq('id', authUser.id).maybeSingle();
      authProfile = data || null;
    }

    function getEloTier(elo) {
      if (elo >= 1000) return { name: 'Diamante', cls: 'tier-diamante' };
      if (elo >= 600) return { name: 'Platina', cls: 'tier-platina' };
      if (elo >= 300) return { name: 'Ouro', cls: 'tier-ouro' };
      if (elo >= 100) return { name: 'Prata', cls: 'tier-prata' };
      return { name: 'Bronze', cls: 'tier-bronze' };
    }

    function renderAuthBar() {
      const $ = id => document.getElementById(id);
      if (!$('pcName')) return;
      const name = (authProfile && authProfile.display_name) || 'Jogador';
      const elo = (authProfile && typeof authProfile.elo === 'number') ? authProfile.elo : null;
      const tier = elo !== null ? getEloTier(elo) : null;
      const initial = name.trim().charAt(0).toUpperCase() || '?';
      const isGuest = !authUser || authUser.is_anonymous;

      $('pcAvatar').textContent = initial;
      $('accAvatar').textContent = initial;
      $('pcName').textContent = sb ? name : 'Offline';
      $('accName').textContent = name;
      $('pcElo').textContent = elo !== null ? elo : '—';
      $('pcTier').textContent = tier ? tier.name : 'Elo';
      $('pcTier').className = 'pc-tier ' + (tier ? tier.cls : '');
      $('accElo').textContent = elo !== null ? `${elo} Elo · ${tier.name}` : 'Sem conexão com o ranking';

      const sub = $('pcSub');
      if (!sb) { sub.textContent = 'Ranking indisponível'; sub.className = 'pc-sub'; }
      else if (isGuest) { sub.textContent = '⚠ Convidado · toque para salvar'; sub.className = 'pc-sub warn'; }
      else { sub.textContent = '✓ Progresso salvo'; sub.className = 'pc-sub'; }

      $('accGuestBox').style.display = isGuest ? '' : 'none';
      $('accSavedBox').style.display = isGuest ? 'none' : '';
      $('accEmail').textContent = (authUser && authUser.email) || '';
    }

    function openAccountModal() {
      document.getElementById('authEmailMsg').textContent = '';
      document.getElementById('accountModal').style.display = 'flex';
      renderAuthBar();
    }

    function closeAccountModal() {
      document.getElementById('accountModal').style.display = 'none';
    }

    async function ensureSignedIn() {
      if (!sb) return null;
      if (authUser) return authUser;
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        authUser = session.user;
      } else {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) { console.warn('Login anônimo falhou:', error.message); return null; }
        authUser = data.user;
      }
      if (!settledOnce) {
        settledOnce = true;
        try { await sb.rpc('settle_my_ranked_matches'); } catch (e) { }
      }
      await loadProfile();
      renderAuthBar();
      return authUser;
    }

    async function submitEmailLogin() {
      if (!sb) return;
      const input = document.getElementById('authEmailInput');
      const msg = document.getElementById('authEmailMsg');
      const email = (input.value || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'E-mail inválido.'; return; }
      msg.textContent = 'Enviando...';
      const emailRedirectTo = window.location.origin + window.location.pathname;

      // Convidado: vincula o e-mail à conta atual (mantém o histórico)
      if (authUser && authUser.is_anonymous) {
        const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo });
        if (!error) {
          msg.textContent = `Link enviado para ${email}. Abra o e-mail e clique no link para salvar sua conta.`;
          return;
        }
        // E-mail já tem conta (ex.: outro aparelho): faz login nela
        if (!/already|registered|exists/i.test(error.message)) {
          msg.textContent = 'Erro: ' + error.message;
          return;
        }
      }

      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo } });
      msg.textContent = error
        ? 'Erro: ' + error.message
        : `Link enviado para ${email}. Abra o e-mail neste aparelho e clique no link para entrar.`;
    }

    async function signOutAccount() {
      if (!sb) return;
      await sb.auth.signOut();
      authUser = null;
      authProfile = null;
      renderAuthBar();
      ensureSignedIn();
    }

    if (sb) {
      sb.auth.onAuthStateChange((_event, session) => {
        authUser = session ? session.user : null;
        // fora do callback para não travar o cliente
        setTimeout(async () => { await loadProfile(); renderAuthBar(); }, 0);
      });
      ensureSignedIn();
    } else {
      document.addEventListener('DOMContentLoaded', renderAuthBar);
    }

    // Grava o resultado do jogador deste dispositivo
    async function recordMatchResult(endReason, abandonedIndex = null) {
      if (matchRecorded || !sb || !players || !players.length) return;

      let myIdx;
      let mode;
      const rankedId = rankedMatchId; // captura antes de qualquer await (a saída da partida zera a variável)
      if (isP2P) { mode = rankedId ? 'online' : 'friends'; myIdx = myP2PIndex; }
      else if (isBotMode) { mode = 'bot'; myIdx = 0; }
      else return; // Pass & Play: não dá para saber qual jogador é o dono da conta
      if (myIdx === null || myIdx === undefined || !players[myIdx]) return;
      matchRecorded = true;

      const me = players[myIdx];
      // Ordem final: quem abandonou/perdeu por tempo fica em último; o resto por pontos
      const order = [...players].sort((x, y) => {
        if (endReason !== 'normal') {
          if (x.id === abandonedIndex) return 1;
          if (y.id === abandonedIndex) return -1;
        }
        return y.score - x.score;
      });
      const placeOf = id => order.findIndex(p => p.id === id) + 1;
      const placement = placeOf(me.id);
      const won = placement === 1;

      try {
        const user = await ensureSignedIn();
        if (!user) { matchRecorded = false; return; }

        // Mantém o nome do perfil igual ao nome usado no jogo
        const gameName = (me.name || '').trim().slice(0, 15);
        if (gameName && (!authProfile || authProfile.display_name !== gameName) && !/^(Você|Jogador \d|P\d)$/.test(gameName)) {
          const { error: nameErr } = await sb.from('profiles').update({ display_name: gameName }).eq('id', user.id);
          if (!nameErr) authProfile = { ...(authProfile || {}), id: user.id, display_name: gameName };
        }

        // Partida ranqueada: o resultado vai para o servidor, que só dá Elo se os DOIS lados relatarem o mesmo
        if (mode === 'online') {
          const opp = players.find(p => p.id !== me.id) || { score: 0 };
          const report = {
            my_score: Math.max(0, me.score | 0),
            opp_score: Math.max(0, opp.score | 0),
            end_reason: endReason,
            loser: endReason === 'normal' ? null : (abandonedIndex === me.id ? 'me' : 'opp'),
            moves: movesPlayed
          };
          const { data: rdata, error: rerr } = await sb.rpc('report_ranked_result', { p_match_id: rankedId, p_report: report });
          if (rerr) { console.warn('Erro ao relatar partida ranqueada:', rerr.message); matchRecorded = false; return; }
          handleRankedResult(Array.isArray(rdata) ? rdata[0] : rdata, rankedId, 0);
          return;
        }

        const { data, error } = await sb.rpc('record_match', {
          p_mode: mode,
          p_player_count: players.length,
          p_score: Math.max(0, Math.min(300, me.score | 0)),
          p_placement: Math.max(1, Math.min(4, placement || players.length)),
          p_won: won,
          p_end_reason: endReason,
          p_bot_difficulty: mode === 'bot' ? String(botDifficulty) : null,
          p_opponents: players.filter(p => p.id !== me.id).map(p => ({
            name: p.name,
            score: p.score,
            placement: placeOf(p.id)
          }))
        });
        if (error) { console.warn('Erro ao salvar partida:', error.message); matchRecorded = false; return; }

        const res = Array.isArray(data) ? data[0] : data;
        if (res && typeof res.elo_after === 'number') {
          const diff = res.elo_after - res.elo_before;
          authProfile = { ...(authProfile || {}), elo: res.elo_after };
          if (diff !== 0) showEloChange(diff, res.elo_after);
        }
        renderAuthBar();
      } catch (e) {
        console.warn('Erro ao salvar partida:', e);
        matchRecorded = false;
      }
    }

    function showResultBanner(html, kind) {
      const desc = document.getElementById('winnerDesc');
      if (!desc) return;
      let el = document.getElementById('eloChangeBanner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'eloChangeBanner';
        desc.appendChild(el);
      } else if (!desc.contains(el)) {
        desc.appendChild(el);
      }
      const colors = { up: ['rgba(74,222,128,0.1)', '#4ade80'], down: ['rgba(248,113,113,0.1)', '#f87171'], info: ['rgba(148,163,184,0.1)', '#cbd5e1'] };
      const [bg, fg] = colors[kind] || colors.info;
      el.style.cssText = `margin-top:14px;padding:10px;border-radius:8px;font-weight:700;font-size:14px;text-align:center;background:${bg};color:${fg};`;
      el.innerHTML = html;
    }

    function showEloChange(diff, newElo) {
      const tier = getEloTier(newElo);
      showResultBanner(`${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : ''}${diff} Elo <span style="color:#94a3b8;font-weight:600;">→ ${newElo} · <span class="${tier.cls}">${tier.name}</span></span>`, diff > 0 ? 'up' : diff < 0 ? 'down' : 'info');
    }

    // Resposta do servidor para uma partida ranqueada: done | pending | disputed | void
    function handleRankedResult(row, matchId, attempt) {
      if (!row) return;
      if (row.r_status === 'done' && typeof row.r_elo_after === 'number') {
        const diff = row.r_elo_after - row.r_elo_before;
        authProfile = { ...(authProfile || {}), elo: row.r_elo_after };
        showEloChange(diff, row.r_elo_after);
        renderAuthBar();
      } else if (row.r_status === 'pending') {
        showResultBanner('⏳ Confirmando o resultado com o oponente...', 'info');
        if (attempt < 20) {
          setTimeout(async () => {
            const { data, error } = await sb.rpc('get_ranked_result', { p_match_id: matchId });
            if (!error) handleRankedResult(Array.isArray(data) ? data[0] : data, matchId, attempt + 1);
          }, 5000);
        } else {
          showResultBanner('O resultado será confirmado quando o oponente reconectar.', 'info');
        }
      } else if (row.r_status === 'disputed') {
        showResultBanner('Resultado divergente entre os jogadores: partida sem Elo.', 'info');
      } else if (row.r_status === 'void') {
        showResultBanner('Partida curta demais ou repetida demais contra o mesmo oponente: sem Elo.', 'info');
      }
    }


    function openLeaderboardModal() {
      document.getElementById('leaderboardModal').style.display = 'flex';
      switchLeaderboardTab(leaderboardTab);
    }

    function closeLeaderboardModal() {
      document.getElementById('leaderboardModal').style.display = 'none';
    }

    async function switchLeaderboardTab(tab) {
      leaderboardTab = tab;
      ['online', 'history'].forEach(t => {
        const id = t === 'online' ? 'lbTabOnline' : 'lbTabHistory';
        document.getElementById(id).classList.toggle('active', t === tab);
      });
      const box = document.getElementById('leaderboardContent');
      if (!sb) { box.innerHTML = '<div class="lb-empty">Não foi possível conectar ao servidor.</div>'; return; }
      box.innerHTML = '<div class="lb-empty">Carregando...</div>';
      await ensureSignedIn();
      if (leaderboardTab !== tab) return;

      if (tab === 'history') {
        if (!authUser) { box.innerHTML = '<div class="lb-empty">Faça login para ver suas partidas.</div>'; return; }
        const { data, error } = await sb.from('matches')
          .select('mode, player_count, score, placement, won, end_reason, opponents, elo_before, elo_after, created_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(30);
        if (leaderboardTab !== tab) return;
        if (error) { box.innerHTML = `<div class="lb-empty">Erro: ${escapeHtml(error.message)}</div>`; return; }
        if (!data.length) { box.innerHTML = '<div class="lb-empty">Nenhuma partida registrada ainda.</div>'; return; }
        const reasonLabel = { normal: '', timeout: ' · por tempo', abandon: ' · por abandono' };
        box.innerHTML = data.map(m => {
          const opp = (m.opponents || []).map(o => `${escapeHtml(o.name)} (${Number(o.score) || 0})`).join(', ');
          const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `
            <div class="lb-row">
              <span class="lb-pos ${m.won ? 'lb-win' : 'lb-loss'}">${m.won ? 'V' : 'D'}</span>
              <div style="min-width:0;">
                <div class="lb-name">vs ${opp || '—'}</div>
                <div class="lb-sub">${m.mode === 'online' ? 'Ranqueada' : m.mode === 'friends' ? 'Amigos' : 'Treino vs Bot'} · ${m.placement}º de ${m.player_count}${reasonLabel[m.end_reason] || ''} · ${date}</div>
              </div>
              <span class="lb-stat">${m.score} pts${typeof m.elo_after === 'number' && typeof m.elo_before === 'number'
                ? `<div class="lb-sub ${m.elo_after >= m.elo_before ? 'lb-win' : 'lb-loss'}">${m.elo_after >= m.elo_before ? '+' : ''}${m.elo_after - m.elo_before} Elo</div>` : ''}</span>
            </div>`;
        }).join('');
        return;
      }

      const { data, error } = await sb.rpc('get_leaderboard', { p_mode: tab, p_limit: 50 });
      if (leaderboardTab !== tab) return;
      if (error) { box.innerHTML = `<div class="lb-empty">Erro: ${escapeHtml(error.message)}</div>`; return; }
      if (!data || !data.length) { box.innerHTML = '<div class="lb-empty">Ninguém no ranking ainda.<br>Jogue uma partida online para entrar!</div>'; return; }
      const medals = ['🥇', '🥈', '🥉'];
      box.innerHTML = data.map((r, i) => {
        const tier = getEloTier(r.elo);
        return `
        <div class="lb-row ${authUser && r.user_id === authUser.id ? 'me' : ''}">
          <span class="lb-pos">${medals[i] || `${i + 1}º`}</span>
          <div style="min-width:0;">
            <div class="lb-name">${escapeHtml(r.display_name)}</div>
            <div class="lb-sub">${r.games} partidas · ${r.win_rate}% vitórias</div>
          </div>
          <div class="lb-stat">${r.elo}<div class="lb-sub ${tier.cls}" style="font-weight:800;">${tier.name}</div></div>
        </div>`;
      }).join('');
    }

