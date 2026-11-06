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
- Nome e avatar vêm do perfil (`profiles.display_name`/`avatar`, editados em Minha Conta); o jogo não sobrescreve o nome do perfil.
- Desempate (regra oficial): pontos iguais => mais linhas horizontais completas (`completedRows`); persistindo, vitória dividida (empate no Elo). Os relatos ranqueados incluem `my_rows`/`opp_rows` e o servidor confere.
- Elo começa em 0 (piso 0). Níveis: Bronze <100, Prata ≥100, Ouro ≥300, Platina ≥600, Diamante ≥1000.
- Ao testar com duas abas: o jogo salva a sessão em `beforeunload`; zere `isGameActive` e o storage antes de recarregar.
- Publicar = commit em `main` + merge/push em `gh-pages`, só quando o usuário pedir.
