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

    async function loadProfile() {
      if (!sb || !authUser) { authProfile = null; return; }
      const { data } = await sb.from('profiles').select('id, display_name, avatar, elo').eq('id', authUser.id).maybeSingle();
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

      const avatar = (authProfile && AVATAR_KEYS.includes(authProfile.avatar)) ? authProfile.avatar : '';
      ['pcAvatar', 'accAvatar'].forEach(id => {
        if (avatar) $(id).innerHTML = icon(avatar); else $(id).textContent = initial;
        $(id).classList.toggle('has-icon', !!avatar);
      });
      applyProfileNameToInputs();
      $('pcName').textContent = sb ? name : 'Offline';
      $('accName').textContent = name;
      $('pcElo').textContent = elo !== null ? elo : '—';
      $('pcTier').textContent = tier ? tier.name : 'Elo';
      $('pcTier').className = 'pc-tier ' + (tier ? tier.cls : '');
      $('accElo').textContent = elo !== null ? `${elo} Elo · ${tier.name}` : 'Sem conexão com o ranking';

      const sub = $('pcSub');
      if (!sb) { sub.textContent = 'Ranking indisponível'; sub.className = 'pc-sub'; }
      else if (isGuest) { sub.innerHTML = icon('alert') + ' Convidado · toque para salvar'; sub.className = 'pc-sub warn'; }
      else { sub.innerHTML = icon('check') + ' Progresso salvo'; sub.className = 'pc-sub'; }

      $('accGuestBox').style.display = isGuest ? '' : 'none';
      $('accSavedBox').style.display = isGuest ? 'none' : '';
      $('accEmail').textContent = name;
    }

    let selectedAvatar = '';

    function renderAvatarGrid() {
      const grid = document.getElementById('avatarGrid');
      if (!grid) return;
      grid.innerHTML = AVATAR_KEYS.map(a => `<button type="button" class="avatar-opt ${a === selectedAvatar ? 'sel' : ''}" onclick="pickAvatar('${a}')" aria-label="${a}">${icon(a)}</button>`).join('');
    }

    function pickAvatar(a) {
      selectedAvatar = (selectedAvatar === a) ? '' : a; // tocar de novo remove o avatar
      renderAvatarGrid();
    }

    const USERNAME_RE = /^[A-Za-z0-9_]{3,15}$/;
    const RESERVED_USERNAMES = ['admin', 'administrador', 'azul', 'bot', 'suporte', 'moderador', 'sistema', 'jogador', 'voce'];
    const isDefaultUsername = (n) => /^jogador\d{8}$/i.test(n || '');

    // Em partidas online o nome do jogador é sempre o nome de usuário (único): o campo fica travado
    function applyProfileNameToInputs() {
      const name = authProfile && authProfile.display_name;
      const inp = document.getElementById('onlineMyNameInput');
      if (!inp || !name) return;
      inp.value = name;
      inp.readOnly = true;
      const hint = document.getElementById('onlineNameHint');
      if (hint) hint.style.display = 'block';
    }

    let usernameCheckTimer = null;
    let usernameCheckSeq = 0;
    // Verifica enquanto digita se o nome é válido e está livre
    function onUsernameInput() {
      const status = document.getElementById('accNameStatus');
      const name = document.getElementById('accNameInput').value.trim();
      clearTimeout(usernameCheckTimer);
      if (!name) { status.textContent = '3 a 15 letras, números ou _ (sem espaços).'; status.style.color = ''; return; }
      if (!USERNAME_RE.test(name)) { status.textContent = 'Use 3 a 15 letras, números ou _ (sem espaços ou acentos).'; status.style.color = '#f87171'; return; }
      if (RESERVED_USERNAMES.includes(name.toLowerCase())) { status.textContent = 'Esse nome é reservado.'; status.style.color = '#f87171'; return; }
      if (authProfile && authProfile.display_name === name) { status.textContent = 'Este é o seu nome atual.'; status.style.color = ''; return; }
      status.textContent = 'Verificando...'; status.style.color = '';
      const seq = ++usernameCheckSeq;
      usernameCheckTimer = setTimeout(async () => {
        if (!sb) return;
        const { data, error } = await sb.rpc('is_username_available', { p_name: name });
        if (seq !== usernameCheckSeq) return;
        if (error) { status.textContent = ''; return; }
        status.innerHTML = data ? icon('check') + ' Disponível' : icon('x') + ' Já está em uso';
        status.style.color = data ? '#4ade80' : '#f87171';
      }, 400);
    }

    async function saveProfileEdits() {
      const msg = document.getElementById('accProfileMsg');
      if (!sb || !authUser) { msg.textContent = 'Sem conexão com o servidor.'; return false; }
      const name = document.getElementById('accNameInput').value.trim();
      if (!USERNAME_RE.test(name)) { msg.textContent = 'O usuário precisa ter de 3 a 15 letras, números ou _ (sem espaços ou acentos).'; return false; }
      if (RESERVED_USERNAMES.includes(name.toLowerCase())) { msg.textContent = 'Esse nome é reservado. Escolha outro.'; return false; }
      msg.textContent = 'Salvando...';
      const { error } = await sb.from('profiles').update({ display_name: name, avatar: selectedAvatar || null }).eq('id', authUser.id);
      if (error) {
        msg.textContent = error.code === '23505' ? 'Esse nome de usuário já está em uso. Escolha outro.'
          : error.code === '23514' ? 'Nome de usuário inválido ou reservado.'
          : 'Não foi possível salvar: ' + error.message;
        return false;
      }
      authProfile = { ...(authProfile || {}), id: authUser.id, display_name: name, avatar: selectedAvatar || null };
      renderAuthBar();
      msg.innerHTML = icon('check') + ' Perfil salvo!';
      return true;
    }

    function openAccountModal(hint) {
      setAuthMode(authMode);
      document.getElementById('accPasswordMsg') && (document.getElementById('accPasswordMsg').textContent = '');
      document.getElementById('accProfileMsg').textContent = hint || '';
      document.getElementById('accNameInput').value = (authProfile && authProfile.display_name) || '';
      onUsernameInput();
      selectedAvatar = (authProfile && AVATAR_KEYS.includes(authProfile.avatar)) ? authProfile.avatar : '';
      renderAvatarGrid();
      document.getElementById('accountModal').style.display = 'flex';
      renderAuthBar();
    }

    function closeAccountModal() {
      document.getElementById('accountModal').style.display = 'none';
    }

    async function ensureSignedIn() {
      if (!sb) return null;
      if (authUser) return authUser;
      let { data: { session } } = await sb.auth.getSession();
      if (session) {
        // Valida no servidor: se a conta foi apagada (ex.: limpeza do banco), descarta a sessão antiga
        const { error: stale } = await sb.auth.getUser();
        if (stale) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { } session = null; }
      }
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

    function friendlyAuthError(m) {
      m = m || '';
      if (/invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
      if (/at least|weak|password should/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
      if (/not confirmed/i.test(m)) return 'Esta conta está com confirmação pendente no servidor.';
      if (/database error|already|registered|unique|duplicate/i.test(m)) return 'Esta conta já existe. Use "Já tenho conta" para entrar.';
      if (/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
      return 'Erro: ' + m;
    }

    // ── Conta com USUÁRIO + SENHA (sem e-mail) ──
    // O Supabase exige um e-mail por trás; usamos um endereço interno derivado do id (nada é enviado a ele).
    const internalEmail = (id) => `${id}@users.azul.invalid`;

    let authMode = 'create';
    function setAuthMode(mode) {
      authMode = mode;
      document.getElementById('authModeCreate').classList.toggle('active', mode === 'create');
      document.getElementById('authModeLogin').classList.toggle('active', mode === 'login');
      document.getElementById('authUserWrap').style.display = mode === 'login' ? '' : 'none';
      document.querySelector('#authSubmitBtn .mp-title').textContent = mode === 'create' ? 'Criar conta' : 'Entrar';
      document.getElementById('authPasswordInput').autocomplete = mode === 'create' ? 'new-password' : 'current-password';
      document.getElementById('authModeHint').textContent = mode === 'create'
        ? 'A conta usa o nome de usuário escolhido acima, e o progresso de convidado (Elo e histórico) passa para ela. Não há recuperação de senha: anote a sua.'
        : 'Atenção: ao entrar numa conta existente, o progresso desta conta de convidado não é transferido.';
      document.getElementById('authEmailMsg').textContent = '';
    }

    async function submitAuthForm() {
      if (!sb) return;
      const msg = document.getElementById('authEmailMsg');
      const pw = document.getElementById('authPasswordInput').value || '';
      if (pw.length < 8) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
      if (pw.length > 72) { msg.textContent = 'A senha pode ter no máximo 72 caracteres.'; return; }
      msg.textContent = 'Aguarde...';

      if (authMode === 'login') {
        const username = (document.getElementById('authUserInput').value || '').trim();
        if (!USERNAME_RE.test(username)) { msg.textContent = 'Usuário ou senha incorretos.'; return; }
        const { data: email, error: lookupErr } = await sb.rpc('login_email_for', { p_username: username });
        if (lookupErr || !email) { msg.textContent = friendlyAuthError(lookupErr && lookupErr.message); return; }
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) { msg.textContent = friendlyAuthError(error.message); return; }
        document.getElementById('authPasswordInput').value = '';
        msg.innerHTML = icon('check') + ' Você entrou na sua conta.';
        return;
      }

      // Criar conta: usa o nome de usuário do campo acima (salva primeiro) e converte o convidado atual
      const typed = (document.getElementById('accNameInput').value || '').trim();
      if (isDefaultUsername(typed) || !typed) { msg.textContent = 'Escolha seu nome de usuário no campo acima antes de criar a conta.'; return; }
      if (!authUser || !authUser.is_anonymous) { msg.textContent = 'Você já está numa conta.'; return; }
      if (!(await saveProfileEdits())) { msg.textContent = 'Corrija o nome de usuário acima (veja a mensagem do perfil).'; return; }
      const { data, error } = await sb.auth.updateUser({ email: internalEmail(authUser.id), password: pw });
      if (error) { msg.textContent = friendlyAuthError(error.message); return; }
      const u = data && data.user;
      if (u && u.email && !u.is_anonymous) {
        authUser = u;
        document.getElementById('authPasswordInput').value = '';
        await loadProfile();
        renderAuthBar();
        msg.textContent = '';
      } else {
        msg.textContent = 'O servidor ainda exige confirmação por e-mail. No painel do Supabase, desligue "Confirm email".';
      }
    }

    async function changePassword() {
      const msg = document.getElementById('accPasswordMsg');
      const pw = document.getElementById('newPasswordInput').value || '';
      if (pw.length < 8 || pw.length > 72) { msg.textContent = 'A senha precisa ter de 8 a 72 caracteres.'; return; }
      msg.textContent = 'Aguarde...';
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) { msg.textContent = friendlyAuthError(error.message); return; }
      document.getElementById('newPasswordInput').value = '';
      msg.innerHTML = icon('check') + ' Senha alterada.';
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
        return (y.score - x.score) || (completedRows(y) - completedRows(x));
      });
      const placeOf = id => order.findIndex(p => p.id === id) + 1;
      const placement = placeOf(me.id);
      const won = placement === 1;

      try {
        const user = await ensureSignedIn();
        if (!user) { matchRecorded = false; return; }

        // Partida ranqueada: o resultado vai para o servidor, que só dá Elo se os DOIS lados relatarem o mesmo
        if (mode === 'online') {
          const opp = players.find(p => p.id !== me.id) || { score: 0 };
          const report = {
            my_score: Math.max(0, me.score | 0),
            opp_score: Math.max(0, opp.score | 0),
            my_rows: completedRows(me),
            opp_rows: opp.wall ? completedRows(opp) : 0,
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
      if (diff === 0) {
        showResultBanner(`Elo mantido em ${newElo} · <span class="${tier.cls}">${tier.name}</span>${newElo === 0 ? ' <span style="color:#94a3b8;font-weight:600;">(não cai abaixo de 0)</span>' : ''}`, 'info');
        return;
      }
      showResultBanner(`${diff > 0 ? icon('arrow-up') + ' +' : diff < 0 ? icon('arrow-down') + ' ' : ''}${diff} Elo <span style="color:#94a3b8;font-weight:600;">→ ${newElo} · <span class="${tier.cls}">${tier.name}</span></span>`, diff > 0 ? 'up' : diff < 0 ? 'down' : 'info');
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
        showResultBanner(icon('clock') + ' Confirmando o resultado com o oponente...', 'info');
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
      box.innerHTML = data.map((r, i) => {
        const tier = getEloTier(r.elo);
        return `
        <div class="lb-row ${authUser && r.user_id === authUser.id ? 'me' : ''}">
          <span class="lb-pos">${i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : `${i + 1}º`}</span>
          <div style="min-width:0;">
            <div class="lb-name">${AVATAR_KEYS.includes(r.avatar) ? icon(r.avatar) + ' ' : ''}${escapeHtml(r.display_name)}</div>
            <div class="lb-sub">${r.games} partidas · ${r.win_rate}% vitórias</div>
          </div>
          <div class="lb-stat">${r.elo}<div class="lb-sub ${tier.cls}" style="font-weight:800;">${tier.name}</div></div>
        </div>`;
      }).join('');
    }

