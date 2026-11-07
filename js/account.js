    // ── Supabase: Auth + Histórico + Ranking ──
    // Apenas a URL e a chave PUBLICÁVEL podem ficar aqui (o código é público no GitHub Pages).
    // A segurança dos dados é garantida pelas políticas RLS em supabase/schema.sql.
    const SUPABASE_URL = 'https://cbhjtbjrbtkelpsmqsly.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0g8-G_O9S-8mb586khzXQA_R_gX5dox';
    const sb = (window.supabase && window.supabase.createClient)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          realtime: { params: { eventsPerSecond: 30 } }
        })
      : null;
    let authUser = null;
    let authProfile = null;
    let matchRecorded = false;
    let leaderboardTab = 'online';

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
      const loggedIn = !!authUser;
      const name = (authProfile && authProfile.display_name) || '';
      const elo = (loggedIn && authProfile && typeof authProfile.elo === 'number') ? authProfile.elo : null;
      const tier = elo !== null ? getEloTier(elo) : null;
      const sub = $('pcSub');

      if (!sb) {
        $('pcName').textContent = 'Offline';
        sub.textContent = 'Ranking indisponível'; sub.className = 'pc-sub';
      } else if (!loggedIn) {
        $('pcName').textContent = 'Entrar ou criar conta';
        sub.innerHTML = icon('alert') + ' Necessário para jogar online'; sub.className = 'pc-sub warn';
      } else {
        $('pcName').textContent = name || '...';
        sub.innerHTML = icon('check') + ' Conectado'; sub.className = 'pc-sub';
      }
      $('pcElo').textContent = elo !== null ? elo : '—';
      $('pcTier').textContent = tier ? tier.name : 'Elo';
      $('pcTier').className = 'pc-tier ' + (tier ? tier.cls : '');

      $('accName').textContent = name;
      $('accElo').textContent = elo !== null ? `${elo} Elo · ${tier.name}` : '';
      $('accOutBox').style.display = loggedIn ? 'none' : '';
      $('accInBox').style.display = loggedIn ? '' : 'none';
      applyProfileNameToInputs();
    }

    const USERNAME_RE = /^[A-Za-z0-9_]{3,15}$/;
    const RESERVED_USERNAMES = ['admin', 'administrador', 'azul', 'bot', 'suporte', 'moderador', 'sistema', 'jogador', 'voce'];

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
    // Verifica enquanto digita se o nome é válido e está livre (inputId/statusId: campo do perfil ou do cadastro)
    function checkUsernameField(inputId, statusId, skipAvailability) {
      const status = document.getElementById(statusId);
      const name = document.getElementById(inputId).value.trim();
      clearTimeout(usernameCheckTimer);
      if (!name || skipAvailability) { status.textContent = skipAvailability ? '' : '3 a 15 letras, números ou _ (sem espaços).'; status.style.color = ''; return; }
      if (!USERNAME_RE.test(name)) { status.textContent = 'Use 3 a 15 letras, números ou _ (sem espaços ou acentos).'; status.style.color = '#f87171'; return; }
      if (RESERVED_USERNAMES.includes(name.toLowerCase())) { status.textContent = 'Esse nome é reservado.'; status.style.color = '#f87171'; return; }
      if (authProfile && authProfile.display_name === name) { status.textContent = 'Este é o seu nome atual.'; status.style.color = ''; return; }
      status.textContent = 'Verificando...'; status.style.color = '';
      const seq = ++usernameCheckSeq;
      usernameCheckTimer = setTimeout(async () => {
        if (!sb) return;
        const { data, error } = await sb.rpc('is_username_available', { p_name: name });
        if (seq !== usernameCheckSeq || document.getElementById(inputId).value.trim() !== name) return;
        if (error) { status.textContent = ''; return; }
        status.innerHTML = data ? icon('check') + ' Disponível' : icon('x') + ' Já está em uso';
        status.style.color = data ? '#4ade80' : '#f87171';
      }, 400);
    }
    function onUsernameInput() { checkUsernameField('accNameInput', 'accNameStatus', false); }
    function onAuthUserInput() { checkUsernameField('authUserInput', 'authUserStatus', authMode === 'login'); }

    async function saveProfileEdits() {
      const msg = document.getElementById('accProfileMsg');
      if (!sb || !authUser) { msg.textContent = 'Sem conexão com o servidor.'; return false; }
      const name = document.getElementById('accNameInput').value.trim();
      if (!USERNAME_RE.test(name)) { msg.textContent = 'O usuário precisa ter de 3 a 15 letras, números ou _ (sem espaços ou acentos).'; return false; }
      if (RESERVED_USERNAMES.includes(name.toLowerCase())) { msg.textContent = 'Esse nome é reservado. Escolha outro.'; return false; }
      msg.textContent = 'Salvando...';
      const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', authUser.id);
      if (error) {
        msg.textContent = error.code === '23505' ? 'Esse nome de usuário já está em uso. Escolha outro.'
          : error.code === '23514' ? 'Nome de usuário inválido ou reservado.'
          : 'Não foi possível salvar: ' + error.message;
        return false;
      }
      authProfile = { ...(authProfile || {}), id: authUser.id, display_name: name };
      renderAuthBar();
      msg.innerHTML = icon('check') + ' Nome salvo!';
      return true;
    }

    // Ação a executar depois que a pessoa entrar (ex.: abrir a fila ranqueada)
    let pendingAfterLogin = null;

    // Jogar online exige conta: se não houver login, abre a tela de entrar/criar conta
    function requireLogin(hint, after) {
      if (authUser) return true;
      pendingAfterLogin = after || null;
      openAccountModal(hint);
      return false;
    }

    function openAccountModal(hint) {
      document.getElementById('accountModal').style.display = 'flex';
      document.getElementById('accPasswordMsg').textContent = '';
      document.getElementById('accProfileMsg').textContent = '';
      if (authUser) {
        document.getElementById('accNameInput').value = (authProfile && authProfile.display_name) || '';
        onUsernameInput();
      } else {
        setAuthMode(authMode);
        if (hint) document.getElementById('authEmailMsg').textContent = hint;
      }
      renderAuthBar();
    }

    function closeAccountModal() {
      document.getElementById('accountModal').style.display = 'none';
      pendingAfterLogin = null;
      if (!isGameActive && !isScoringAnimationActive) document.getElementById('mainMenuModal').style.display = 'flex';
    }

    // Depois de entrar/criar conta: fecha a tela e continua o que a pessoa queria fazer
    function finishLogin() {
      document.getElementById('accountModal').style.display = 'none';
      const next = pendingAfterLogin;
      pendingAfterLogin = null;
      if (next) next(); else if (!isGameActive) document.getElementById('mainMenuModal').style.display = 'flex';
    }

    function friendlyAuthError(m) {
      m = m || '';
      if (/invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
      if (/at least|weak|password should/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
      if (/not confirmed/i.test(m)) return 'Esta conta está com confirmação pendente no servidor.';
      if (/database error|username_unavailable|already|registered|unique|duplicate/i.test(m)) return 'Esse nome de usuário já está em uso ou não é permitido. Escolha outro.';
      if (/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
      return 'Erro: ' + m;
    }

    // ── Conta com USUÁRIO + SENHA (sem e-mail, sem convidado) ──
    // O Supabase exige um e-mail por trás; usamos um endereço interno aleatório (nada é enviado a ele).
    const newInternalEmail = () => {
      const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      return `${id}@users.azul.invalid`;
    };

    let authMode = 'create';
    function setAuthMode(mode) {
      authMode = mode;
      document.getElementById('authModeCreate').classList.toggle('active', mode === 'create');
      document.getElementById('authModeLogin').classList.toggle('active', mode === 'login');
      document.querySelector('#authSubmitBtn .mp-title').textContent = mode === 'create' ? 'Criar conta' : 'Entrar';
      document.getElementById('authPasswordInput').autocomplete = mode === 'create' ? 'new-password' : 'current-password';
      document.getElementById('authModeHint').textContent = mode === 'create'
        ? 'Não há recuperação de senha: anote a sua.'
        : '';
      document.getElementById('authEmailMsg').textContent = '';
      onAuthUserInput();
    }

    // Estado de carregamento do formulário de conta (botão com spinner, campos travados)
    let authBusy = false;
    function setAuthBusy(busy, label) {
      authBusy = busy;
      const btn = document.getElementById('authSubmitBtn');
      const title = btn.querySelector('.mp-title');
      if (busy) {
        title.innerHTML = '<span class="btn-spinner"></span>' + escapeHtml(label);
      } else {
        title.textContent = authMode === 'create' ? 'Criar conta' : 'Entrar';
      }
      btn.classList.toggle('loading', busy);
      btn.disabled = busy;
      ['authUserInput', 'authPasswordInput', 'authModeCreate', 'authModeLogin'].forEach(id => { document.getElementById(id).disabled = busy; });
    }

    async function submitAuthForm() {
      if (authBusy) return;
      setAuthBusy(true, authMode === 'create' ? 'Criando sua conta...' : 'Entrando...');
      try { await submitAuthFormInner(); } finally { setAuthBusy(false); }
    }

    async function submitAuthFormInner() {
      if (!sb) return;
      const msg = document.getElementById('authEmailMsg');
      const username = (document.getElementById('authUserInput').value || '').trim();
      const pw = document.getElementById('authPasswordInput').value || '';
      if (!USERNAME_RE.test(username)) {
        msg.textContent = authMode === 'login' ? 'Usuário ou senha incorretos.' : 'O usuário precisa ter de 3 a 15 letras, números ou _ (sem espaços ou acentos).';
        return;
      }
      if (pw.length < 8) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
      if (pw.length > 72) { msg.textContent = 'A senha pode ter no máximo 72 caracteres.'; return; }
      msg.textContent = '';

      if (authMode === 'login') {
        const { data: email, error: lookupErr } = await sb.rpc('login_email_for', { p_username: username });
        if (lookupErr || !email) { msg.textContent = friendlyAuthError(lookupErr && lookupErr.message); return; }
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) { msg.textContent = friendlyAuthError(error.message); return; }
        await onLoggedIn(data.user);
        return;
      }

      // Criar conta
      if (RESERVED_USERNAMES.includes(username.toLowerCase())) { msg.textContent = 'Esse nome é reservado. Escolha outro.'; return; }
      const { data: free } = await sb.rpc('is_username_available', { p_name: username });
      if (free === false) { msg.textContent = 'Esse nome de usuário já está em uso. Escolha outro.'; return; }
      const { data, error } = await sb.auth.signUp({ email: newInternalEmail(), password: pw, options: { data: { username } } });
      if (error) { msg.textContent = friendlyAuthError(error.message); return; }
      if (!data.session) { msg.textContent = 'O servidor ainda exige confirmação por e-mail. No painel do Supabase, desligue "Confirm email".'; return; }
      await onLoggedIn(data.user);
    }

    async function onLoggedIn(user) {
      authUser = user;
      document.getElementById('authPasswordInput').value = '';
      document.getElementById('authUserInput').value = '';
      document.getElementById('authEmailMsg').textContent = '';
      onAuthUserInput();
      await loadProfile();
      renderAuthBar();
      try { await sb.rpc('settle_my_ranked_matches'); } catch (e) { }
      finishLogin();
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
      setAuthMode('login');
    }

    // Sessão: só contas com login. Sessões anônimas antigas (convidado) e contas apagadas são descartadas.
    async function initAuth() {
      if (!sb) { renderAuthBar(); return; }
      let { data: { session } } = await sb.auth.getSession();
      if (session && session.user.is_anonymous) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { } session = null; }
      if (session) {
        const { error: stale } = await sb.auth.getUser();
        if (stale) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { } session = null; }
      }
      authUser = session ? session.user : null;
      if (authUser) {
        try { await sb.rpc('settle_my_ranked_matches'); } catch (e) { }
        await loadProfile();
      }
      renderAuthBar();
    }
    const authReady = initAuth();
    async function ensureSignedIn() { await authReady; return authUser; } // devolve o usuário logado ou null

    if (sb) {
      sb.auth.onAuthStateChange((_event, session) => {
        authUser = (session && !session.user.is_anonymous) ? session.user : null;
        // fora do callback para não travar o cliente
        setTimeout(async () => { await loadProfile(); renderAuthBar(); }, 0);
      });
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
          handleRankedResult(Array.isArray(rdata) ? rdata[0] : rdata, rankedId, 0, endReason);
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
    function handleRankedResult(row, matchId, attempt, endReason) {
      if (!row) return;
      if (row.r_status === 'done' && typeof row.r_elo_after === 'number') {
        const diff = row.r_elo_after - row.r_elo_before;
        authProfile = { ...(authProfile || {}), elo: row.r_elo_after };
        showEloChange(diff, row.r_elo_after);
        renderAuthBar();
      } else if (row.r_status === 'pending') {
        // Saída/tempo esgotado: o servidor liquida assim que confirma que o adversário sumiu (poucos segundos)
        const left = endReason === 'abandon' || endReason === 'timeout';
        showResultBanner(icon('clock') + (left ? ' Validando o resultado: o oponente saiu...' : ' Confirmando o resultado com o oponente...'), 'info');
        if (attempt < 30) {
          setTimeout(async () => {
            const { data, error } = await sb.rpc('get_ranked_result', { p_match_id: matchId });
            if (!error) handleRankedResult(Array.isArray(data) ? data[0] : data, matchId, attempt + 1, endReason);
          }, left ? 3000 : 5000);
        } else {
          showResultBanner('O resultado será confirmado em instantes. Você pode jogar de novo.', 'info');
        }
      } else if (row.r_status === 'disputed') {
        showResultBanner('Resultado divergente entre os jogadores: partida sem Elo.', 'info');
      } else if (row.r_status === 'void') {
        showResultBanner('Partida curta demais (poucas jogadas) ou repetida demais contra o mesmo oponente: sem Elo.', 'info');
      }
    }


    function openLeaderboardModal() {
      document.getElementById('leaderboardModal').style.display = 'flex';
      switchLeaderboardTab(leaderboardTab);
    }

    // "Como jogar": aparece sozinho na primeira visita; depois de "Entendi" fica salvo no navegador (e o botão do menu reabre)
    const HOWTO_KEY = 'azul_howto_seen_v1';
    function openHowToModal() { document.getElementById('howToModal').style.display = 'flex'; }
    function closeHowToModal() {
      document.getElementById('howToModal').style.display = 'none';
      try { localStorage.setItem(HOWTO_KEY, '1'); } catch (e) { }
    }
    function showHowToIfFirstVisit() {
      let seen = false;
      try { seen = localStorage.getItem(HOWTO_KEY) === '1'; } catch (e) { }
      if (!seen) openHowToModal();
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
            <div class="lb-name">${escapeHtml(r.display_name)}</div>
            <div class="lb-sub">${r.games} partidas · ${r.win_rate}% vitórias</div>
          </div>
          <div class="lb-stat">${r.elo}<div class="lb-sub ${tier.cls}" style="font-weight:800;">${tier.name}</div></div>
        </div>`;
      }).join('');
    }

