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
- **Nunca** colocar no código a `secret key` (`sb_secret_…`) nem a senha do banco do Supabase. Só URL e chave publicável (`sb_publishable_…`).
- Só **Partida Ranqueada** (fila no servidor) vale Elo. Sala com código = "amigos" (histórico, sem Elo); bot = treino.
- Elo é calculado no servidor. O cliente não escreve em `profiles.elo` nem insere em `matches`. Resultado ranqueado: os DOIS jogadores chamam `report_ranked_result`; só vale se os relatos baterem (senão `disputed`). Se um só relatou, vale após 60s e com >= 10 jogadas; máx. 5 partidas por par a cada 24h.
- Migração de anfitrião: todos têm o estado completo; se o anfitrião some 10s, o convidado de menor índice presente assume (`hostEpoch` +1). O antigo, ao voltar, vê o `epoch` maior no Presence e vira convidado.
- Testar SQL localmente: Postgres 12 em /Library/PostgreSQL/12/bin com stub de `auth.uid()` e roles `anon`/`authenticated`; o schema roda 2x sem erro.
- Online: o **host** é a autoridade (estado, relógio, derrota por tempo). Mensagens do Realtime não têm ordem garantida — `RtConn.send` numera e o receptor reordena.
- Relógio: 5 min iniciais, +30 s por jogada confirmada, teto 5 min; tolerância de desconexão 5 min.
- `profiles.display_name` é o **nome de usuário**: único sem diferenciar maiúsculas, 3 a 15 letras/números/_, nomes reservados bloqueados (constraint + índice único no banco, `is_username_available` para a tela). Contas novas recebem `jogador########`. Em partidas online o nome do jogador é sempre o usuário (campo travado). 1 e-mail = 1 conta: o Supabase já barra e-mail repetido; o schema também barra variações (`+tag`, pontos do Gmail) via `email_norm`.
- Nome e avatar vêm do perfil (`profiles.display_name`/`avatar`, editados em Minha Conta); o jogo não sobrescreve o nome do perfil.
- Desempate (regra oficial): pontos iguais => mais linhas horizontais completas (`completedRows`); persistindo, vitória dividida (empate no Elo). Os relatos ranqueados incluem `my_rows`/`opp_rows` e o servidor confere.
- Elo começa em 0 (piso 0). Níveis: Bronze <100, Prata ≥100, Ouro ≥300, Platina ≥600, Diamante ≥1000.
- Segurança: nomes/textos da rede são dados, nunca HTML: use `escapeHtml`/`cleanName` (config.js) e `sanitizeIncomingState` (online.js). O anfitrião valida jogadas (`validateGuestAction`: vez, legalidade) e só deixa cada jogador abandonar/renomear a si mesmo; convidados só aceitam mensagens de quem é `host` no Presence. Script do Supabase com SRI e CSP em meta (script-src ainda tem 'unsafe-inline' por causa dos `onclick=` no HTML).
- Sem emojis na UI: use ícones SVG (`ICONS`/`icon('nome')` em config.js; no HTML `<span data-icon="nome"></span>`). Avatar do perfil = chave de ícone (`AVATAR_KEYS`, máx. 8 caracteres).
- Plano gratuito do Supabase: poucas mensagens Realtime (~2M/mês). Evite mensagens periódicas frequentes (relógio sincroniza a cada 30s, health check a cada 45s). E-mail embutido é muito limitado: configurar SMTP próprio para o link de "Salvar conta".
- Login: e-mail + senha (sem envio de e-mail). Convidado vira conta com `updateUser({email,password})`; exige **"Confirm email" desligado** no Supabase (Authentication > Sign In / Providers > Email). Sem e-mail não há recuperação de senha. Se ativar CAPTCHA no Supabase, o cliente precisa enviar `captchaToken` (hoje não envia).
- Ao testar com duas abas: o jogo salva a sessão em `beforeunload`; zere `isGameActive` e o storage antes de recarregar.
- Publicar = commit em `main` + merge/push em `gh-pages`, só quando o usuário pedir.
