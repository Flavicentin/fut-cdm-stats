# Fut CDM — site de estatísticas

## Atualizar os dados
1. Na planilha "MVPs CDM", exporte as abas como CSV (Arquivo → Fazer download → .csv) para `dados/novos/`:
   `Médias`, `Honrarias`, `Over` e uma aba por mês (`MARÇO`, `ABRIL`, … `Outubro`). O nome do arquivo só precisa terminar com o nome da aba.
2. Gere o JSON do site:
   ```
   python scripts/importar_planilha.py 2026
   ```
   O script avisa se aparecer nome desconhecido ou se os meses somarem mais que a aba Médias.
3. Se a mesma pessoa aparecer com outro nome, adicione o apelido em `dados/apelidos.json`.

Regras: as médias só contam quem tem **10+ jogos**; a coluna BALLON DOR é ignorada; as notas da aba Over aparecem separadas como "Notas dos adms".

## Ver localmente
`python -m http.server 8765 -d site` e abra http://localhost:8765

## Publicar
Commit + push no GitHub: a Vercel publica sozinha (Root Directory = `site`).

Links úteis para mandar no grupo: `#jogador/roger`, `#comparar/roger/erick`, `#comparar/roger/erick/notas`, `#trofeus`, `#mes-a-mes`.
