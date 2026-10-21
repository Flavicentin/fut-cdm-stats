# Fut CDM — site de estatísticas

Site público: https://fut-cdm.vercel.app · Admin: https://fut-cdm.vercel.app/admin.html

## Como funciona
- **Site (`site/`)**: HTML, CSS e JavaScript sem build. A Vercel publica sozinha a cada push (Root Directory = `site`).
- **Dados**: banco Postgres no Supabase. O site lê a view `v_temporada_json`; se o Supabase falhar, usa `site/data/2026.json` como reserva.
- **Fotos**: bucket `fotos-jogadores` no Supabase Storage (enviadas pelo admin, aba Fotos).

## Admin (só adms)
- **Partidas**: sortear os 4 times (sorteio puro), deixar a próxima partida agendada, anotar gols e assistências ao vivo e encerrar. Ao encerrar, soma no mês e na temporada (+1 jogo) e calcula MVP, time da semana e as outras honrarias; sai o relatório para o grupo.
- **Temporada / Mês / Honrarias / Notas Over**: editar ou colar a aba da planilha. Toda mudança vai para **Revisões** e só entra no site depois que outro adm aprova.
- **Fotos**: enviar várias de uma vez (nome do arquivo = nome ou apelido do jogador), trocar ou remover.
- **Admins**: pedidos de acesso, adms e pré-aprovados.

## Banco
- `supabase/migrations/`: todas as mudanças de estrutura, em ordem (já aplicadas no projeto).
- `supabase/seed/2026.sql`: carga inicial da temporada 2026 (já aplicada).
- `supabase/testes/`: teste com dados fantasmas e scripts de limpeza.

## Scripts (Python)
- `scripts/importar_planilha.py 2026`: lê as abas da planilha exportadas em CSV para `dados/novos/` e gera `site/data/2026.json`. Apelidos em `dados/apelidos.json`.
- `scripts/json_para_seed.py 2026`: gera o SQL de carga do banco a partir do JSON.
- `scripts/conferir_supabase.py 2026`: compara o banco com o JSON.

Regras: as médias só contam quem tem **10+ jogos**; a coluna BALLON DOR é ignorada; as notas da aba Over aparecem separadas como "Notas dos adms".

## Ver localmente
`python -m http.server 8765 -d site` e abra http://localhost:8765

Links úteis para mandar no grupo: `#jogador/roger`, `#comparar/roger/erick`, `#comparar/roger/erick/notas`, `#trofeus`, `#mes-a-mes`, `?temporada=2026`.
