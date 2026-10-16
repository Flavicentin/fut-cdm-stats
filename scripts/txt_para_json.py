"""Converte os rankings em dados/*.txt para site/data/<temporada>.json.

Só partidas, gols e assistências são guardados; G+A e médias são
recalculados no site e aqui apenas conferidos contra os .txt.

Uso: python scripts/txt_para_json.py [temporada]
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"
SAIDA = RAIZ / "site" / "data"

BASE = {
    "partidas": "partidas jogadas.txt",
    "gols": "gols.txt",
    "assist": "assistencias.txt",
}
CONFERENCIA = {
    "gols + assistencias.txt": lambda j: j["gols"] + j["assist"],
    "media de gols por jogo.txt": lambda j: j["gols"] / j["partidas"],
    "media de assist por jogo.txt": lambda j: j["assist"] / j["partidas"],
    "media de gols + assistencias por jogo.txt": lambda j: (j["gols"] + j["assist"]) / j["partidas"],
}

LINHA = re.compile(r"^\s*\d+\.\s*(.+?)\s*[—–-]\s*([\d.,]+)\s*$")


def slug(nome):
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def ler_ranking(arquivo):
    """Retorna {nome: valor}, desfazendo empates como 'Leo, Flavio e Bona'."""
    valores = {}
    for n, linha in enumerate((DADOS / arquivo).read_text(encoding="utf-8").splitlines(), 1):
        if not linha.strip():
            continue
        m = LINHA.match(linha)
        if not m:
            sys.exit(f"{arquivo}:{n}: linha não reconhecida: {linha!r}")
        nomes, valor = m.groups()
        valor = float(valor.replace(",", "."))
        for nome in re.split(r",\s*|\s+e\s+", nomes):
            valores[nome.strip()] = valor
    return valores


def main():
    temporada = sys.argv[1] if len(sys.argv) > 1 else str(date.today().year)
    base = {campo: ler_ranking(arq) for campo, arq in BASE.items()}

    nomes = set().union(*(v.keys() for v in base.values()))
    avisos = []
    jogadores = []
    for nome in sorted(nomes, key=str.casefold):
        faltando = [c for c in BASE if nome not in base[c]]
        if faltando:
            avisos.append(f"{nome}: sem {', '.join(faltando)}")
            continue
        jogadores.append({
            "id": slug(nome),
            "nome": nome,
            **{c: int(base[c][nome]) for c in BASE},
        })

    por_nome = {j["nome"]: j for j in jogadores}
    for arquivo, calc in CONFERENCIA.items():
        for nome, valor in ler_ranking(arquivo).items():
            j = por_nome.get(nome)
            if j is None:
                avisos.append(f"{arquivo}: {nome} não está nos rankings base")
            elif abs(calc(j) - valor) > 0.051:
                avisos.append(f"{arquivo}: {nome} = {valor}, calculado {calc(j):.2f}")

    SAIDA.mkdir(parents=True, exist_ok=True)
    destino = SAIDA / f"{temporada}.json"
    destino.write_text(json.dumps({
        "temporada": temporada,
        "atualizado_em": date.today().isoformat(),
        "jogadores": jogadores,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    (SAIDA / "temporadas.json").write_text(json.dumps(
        sorted({p.stem for p in SAIDA.glob("[0-9]*.json")}, reverse=True)), encoding="utf-8")

    for a in avisos:
        print("AVISO:", a)
    print(f"{len(jogadores)} jogadores -> {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
