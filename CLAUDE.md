# Azul — jogo de tabuleiro web (HTML/CSS/JS puro, sem build)

Publicado no GitHub Pages (branch `gh-pages`; `main` é a fonte). Para testar localmente use um servidor:
`python3 -m http.server 8000` (abrir o `index.html` por duplo clique não funciona).

## Mapa dos arquivos
`index.html` só tem a estrutura (modais, tabuleiro). Os scripts são clássicos e compartilham o escopo global;
**a ordem das tags `<script>` importa** (config → chat → online-state → account → online → matchmaking → game-setup → bot → turns → ui).

| Arquivo | Conteúdo |
|---|---|
| `css/style.css` | Todos os estilos |
| `js/config.js` | Constantes do jogo (cores, parede, penalidades) |
| `js/chat.js` | Chat da partida online |
| `js/online-state.js` | Variáveis de estado do online (host/convidado) |
| `js/account.js` | Supabase: login convidado/e-mail, perfil, Elo, ranking, `recordMatchResult` |
| `js/online.js` | Relógio de ação, sala via Supabase Realtime (`RtConn`), migração de anfitrião, mensagens host↔convidado, abandono, menus de sala |
| `js/matchmaking.js` | Fila de Partida Ranqueada (`find_ranked_match`), busca e entrada na sala |
| `js/game-setup.js` | Sacola, `initGame`, rodadas |
| `js/bot.js` | IA dos bots (fácil/médio/difícil) |
| `js/turns.js` | Jogadas, pontuação de rodada, bônus finais, `endGame` |
| `js/ui.js` | Renderização, restauração de sessão, `window.onload` |
| `supabase/schema.sql` | Tabelas, RLS e funções (`record_match`, `get_leaderboard`). Rodar no SQL Editor; é idempotente |

## Regras importantes
- **Nunca** colocar no código a `secret key` (`sb_secret_…`) nem a senha do banco do Supabase. Só URL e chave publicável (`sb_publishable_…`). Se a chave publicável for apagada/recriada no painel (Project Settings > API Keys), atualize `SUPABASE_PUBLISHABLE_KEY` em js/account.js: sem isso o jogo inteiro retorna 401.
- Só **Partida Ranqueada** (fila no servidor) vale Elo. Sala com código = "amigos" (histórico, sem Elo); bot = treino.
- Elo é calculado no servidor. O cliente não escreve em `profiles.elo` nem insere em `matches`. Resultado ranqueado: os DOIS jogadores chamam `report_ranked_result`; só vale se os relatos baterem (senão `disputed`). Se um só relatou: saída/tempo esgotado vale na hora quando o adversário está sem sinal de vida há 40s (`ping_ranked_match`, a cada 20s; >= 4 jogadas); fim normal espera 60s (>= 10 jogadas); máx. 5 partidas por par a cada 24h.
- Migração de anfitrião: todos têm o estado completo; se o anfitrião some 10s, o convidado de menor índice presente assume (`hostEpoch` +1). O antigo, ao voltar, vê o `epoch` maior no Presence e vira convidado.
- Testar SQL localmente: Postgres 12 em /Library/PostgreSQL/12/bin com stub de `auth.uid()` e roles `anon`/`authenticated`; o schema roda 2x sem erro.
- Online: o **host** é a autoridade (estado, relógio, derrota por tempo). Mensagens do Realtime não têm ordem garantida — `RtConn.send` numera e o receptor reordena.
- Relógio: 3 min iniciais, +15 s por jogada confirmada, teto 3 min (constantes `CLOCK_*` em js/online.js); tolerância de desconexão 5 min (`DISCONNECT_GRACE_PERIOD_MS`).
- `profiles.display_name` é o **nome de usuário**: único sem diferenciar maiúsculas, 3 a 15 letras/números/_, nomes reservados bloqueados (constraint + índice único no banco, `is_username_available` para a tela). Contas novas recebem `jogador########`. Em partidas online o nome do jogador é sempre o usuário (campo travado). Contas não têm e-mail real (`email_norm` fica inofensivo).
- O jogador só tem **nome de usuário** (sem avatar nem foto): vem do perfil (`profiles.display_name`, editado em Minha Conta); o jogo não sobrescreve o nome do perfil.
- Desempate (regra oficial): pontos iguais => mais linhas horizontais completas (`completedRows`); persistindo, vitória dividida (empate no Elo). Os relatos ranqueados incluem `my_rows`/`opp_rows` e o servidor confere.
- Elo começa em 0 (piso 0). Níveis: Bronze <100, Prata ≥100, Ouro ≥300, Platina ≥600, Diamante ≥1000.
- Segurança: nomes/textos da rede são dados, nunca HTML: use `escapeHtml`/`cleanName` (config.js) e `sanitizeIncomingState` (online.js). O anfitrião valida jogadas (`validateGuestAction`: vez, legalidade) e só deixa cada jogador abandonar/renomear a si mesmo; convidados só aceitam mensagens de quem é `host` no Presence. Script do Supabase com SRI e CSP em meta (script-src ainda tem 'unsafe-inline' por causa dos `onclick=` no HTML).
- Sem emojis na UI: use ícones SVG (`ICONS`/`icon('nome')` em config.js; no HTML `<span data-icon="nome"></span>`).
- Plano gratuito do Supabase: poucas mensagens Realtime (~2M/mês). Evite mensagens periódicas frequentes (relógio sincroniza a cada 30s, health check a cada 45s). E-mail embutido é muito limitado: configurar SMTP próprio para o link de "Salvar conta".
- Login: **usuário + senha**, **sem convidado**. Jogar online (ranqueada e amigos) exige conta; bot e "mesmo aparelho" funcionam sem conta. O Supabase exige e-mail, então cada conta usa um endereço interno aleatório `<uuid>@users.azul.invalid` (nada é enviado). Cadastro: `signUp({ email interno, password, options.data.username })`; o trigger `handle_new_user` recusa usuário repetido/inválido/reservado. Login: RPC `login_email_for(usuario)` devolve o e-mail interno. Exige **"Confirm email" desligado**; desligue também "Allow anonymous sign-ins" (o cliente não usa e as funções online rejeitam anônimos via `require_real_user`). Sem e-mail não há recuperação de senha. Se ativar CAPTCHA no Supabase, o cliente precisa enviar `captchaToken` (hoje não envia).
- Ícone do site: `favicon.svg` (azulejo azul com "A"), `favicon-32.png`, `favicon.ico` e `apple-touch-icon.png`, todos referenciados no `<head>` do index.html.
- Chat: mensagem de outro jogador com o chat fechado mostra o alerta grande `#chatAlert` (6 s, toque abre o chat; vibra no celular). Texto sempre via `textContent`.
- Bot (js/bot.js): `botGenerateCandidates` (jogadas legais) → `botChooseMove(idx, engine)` → `botPlayTurn` (executa, com try/catch e modo 'safe' de emergência + vigia `botArmWatchdog`: o bot nunca pode travar na vez dele). Motores do nível Difícil: 'v1' (heurística) e 'v2'/'v3' (antecipam a melhor resposta do oponente via `botSimApply`/`botWithState`); pesos `BOT_LOOKAHEAD_K/W/W3`. **Qualquer mudança no bot deve ser medida**: partidas bot x bot sem DOM (stubs de render/animação/`waitMs`, alternando quem joga primeiro, pontuação final oficial) com >= 800 partidas por configuração (ruído ~±1,5 pt); rode **uma bateria por vez** (duas ao mesmo tempo corrompem o estado global).
- Tema: paleta chumbo (cinza-azulado) definida em variáveis no topo de css/style.css (`--bg-canvas/card/header/recess/hover`, `--border-*`, `--text-*`, `--tile-surface`, usado SÓ nas fábricas: discos e centro); evite cores escuras fixas no CSS, use as variáveis. A peça preta precisa de contraste com `--tile-surface`.
- Efeito 3D das peças: classe `body.fx3d` (CSS no fim de css/style.css), ligado por padrão; botão "3D" no cabeçalho e no menu (`toggleFx3d`, escolha salva em `localStorage['azul_fx3d']`).
- Animação de pegar peças: `flyPickedTiles` (ui.js) clona as peças de origem e as anima até o card do jogador (as sobras da fábrica voam para o centro); chamada ANTES do `renderAll()` em `pickFromFactory/pickFromCenter` (vale para bot e jogadas remotas); respeita `prefers-reduced-motion`.
- Ao testar com duas abas: o jogo salva a sessão em `beforeunload`; zere `isGameActive` e o storage antes de recarregar.
- Publicar = commit em `main` + merge/push em `gh-pages`, só quando o usuário pedir.
