# Fut CDM — site de estatísticas

## Atualizar os dados
1. Edite os rankings em `dados/*.txt` (formato `1. Nome — valor`, empates como `Leo e Pietro`).
   Só `partidas jogadas.txt`, `gols.txt` e `assistencias.txt` são usados; os outros servem para conferência.
2. Gere o JSON: `python scripts/txt_para_json.py 2026`
   Se algum número não bater entre os arquivos, o script avisa.

## Ver localmente
`python -m http.server 8765 -d site` e abra http://localhost:8765

## Publicar
- **Netlify:** arraste a pasta `site/` em https://app.netlify.com/drop
- **Vercel:** `npx vercel site --prod`

Links úteis para mandar no grupo: `#jogador/roger`, `#comparar/roger/erick`.
