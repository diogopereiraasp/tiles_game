# Testes do Azul

Tudo roda com um comando, sem navegador e sem tocar em nenhum banco seu:

```bash
node tests/run-all.js            # tudo (leva ~1 min)
BATTERY=800 node tests/run-all.js  # bateria oficial do bot (>= 800 partidas; mais lenta)
SKIP_SQL=1 node tests/run-all.js   # sem SQL (não precisa de Postgres)
```

| Arquivo | O que cobre |
|---|---|
| `sw.test.js` | Lógica do service worker (rede primeiro, cache offline, não intercepta Supabase/POST) |
| `sync.test.js` | `stateVer`/`RESYNC`, revanche, abandono após fim normal, escolha de coluna (avançado), sorteio de quem começa |
| `game.test.js` | Reembaralhamento determinístico, partidas completas 2/3/4 jogadores normal e avançado (100 peças conservadas), bateria bot v4 x v1 |
| `sql/run.sh` | Sobe um Postgres **temporário**, roda `supabase/schema.sql` 2x e os testes `record_match_elo.sql` e `rate_limit.sql` |

- `harness.js` carrega os scripts do jogo num contexto isolado do Node (sem DOM).
- SQL precisa de `initdb`/`pg_ctl`/`psql` (Postgres 12+); defina `PG_BIN=/caminho/bin` se não achar sozinho. Sem Postgres o grupo é pulado.
- Não cobre: partida online real com duas contas/aparelhos, bloqueio de tela no celular, service worker no navegador (o navegador embutido do app não suporta). Isso continua sendo teste manual.
- Dica: depois de mudar uma regra, quebre-a de propósito e confira que algum teste falha.
