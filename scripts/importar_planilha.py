"""Importa a planilha "MVPs CDM" (abas exportadas em CSV) para site/data/<temporada>.json.

Arquivos lidos em dados/novos/ (o nome só precisa terminar com o nome da aba):
  ... - Médias.csv      jogos, gols e assistências da temporada (total oficial)
  ... - Honrarias.csv   prêmios acumulados (BALLON DOR é ignorado)
  ... - Over.csv        notas dos adms
  ... - MARÇO.csv ...   uma aba por mês, prêmios marcados com emojis

Nomes diferentes para a mesma pessoa ficam em dados/apelidos.json.

Uso: python scripts/importar_planilha.py [temporada]
"""
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "dados" / "novos"
SAIDA = RAIZ / "site" / "data"

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

# Coluna da planilha -> chave no JSON
HONRAS = {
    "Top3 G (S)": "top3g_s", "Top3 A (S)": "top3a_s", "Artilheiro (S)": "art_s", "Garçom (S)": "gar_s",
    "Duplo-Duplo (S)": "dd_s", "Masterclass (S)": "mc_s", "MVP (S)": "mvp_s", "Gartilheiro (S)": "gart_s",
    "TOTW": "totw",
    "Top3 G (M)": "top3g_m", "Top3 A (M)": "top3a_m", "Artilheiro (M)": "art_m", "Garçom (M)": "gar_m",
    "Gartilheiro (M)": "gart_m", "Duplo-Duplo (M)": "dd_m", "Masterclass (M)": "mc_m", "MVP (M)": "mvp_m",
    "POTM": "potm",
}
OVER = {"Pace": "pac", "Finalização": "fin", "Passe": "pas", "Drible": "dri", "Defesa": "def", "Fisico": "fis", "OverAll": "ovr"}


def sem_acento(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def slug(nome):
    return re.sub(r"[^a-z0-9]+", "-", sem_acento(nome).lower()).strip("-")


def limpar(nome):
    return re.sub(r"\s+", " ", nome).strip()


def carregar_apelidos():
    arq = RAIZ / "dados" / "apelidos.json"
    mapa = {}
    if arq.exists():
        for oficial, outros in json.loads(arq.read_text(encoding="utf-8")).items():
            for n in [oficial, *outros]:
                mapa[slug(n)] = oficial
    return mapa


APELIDOS = carregar_apelidos()


def oficial(nome):
    nome = limpar(nome)
    return APELIDOS.get(slug(nome), nome)


def ler(sufixo):
    arqs = [p for p in ENTRADA.glob("*.csv") if slug(p.stem).endswith(slug(sufixo))]
    if not arqs:
        sys.exit(f"Arquivo da aba '{sufixo}' não encontrado em {ENTRADA}")
    with arqs[0].open(encoding="utf-8-sig", newline="") as f:
        return [{limpar(k or ""): (v or "").strip() for k, v in linha.items()}
                for linha in csv.DictReader(f) if limpar(linha.get("Jogadores") or "")]


def inteiro(v):
    v = v.replace(",", ".").strip()
    return int(float(v)) if v else 0


def contar(celula):
    """'🥇🥇' -> 2, '✔️✔️✔️' -> 3, '3' -> 3, '' -> 0."""
    celula = celula.strip()
    if not celula:
        return 0
    if re.fullmatch(r"\d+", celula):
        return int(celula)
    return sum(1 for c in celula if not c.isspace() and unicodedata.category(c) not in ("Mn", "Cf")
               and c not in "️‍")


def honras_da_linha(linha, conversor):
    return {chave: n for col, chave in HONRAS.items() if (n := conversor(linha.get(col, "")))}


def main():
    temporada = sys.argv[1] if len(sys.argv) > 1 else str(date.today().year)
    avisos = []
    jogadores = {}

    def jogador(nome):
        nome = oficial(nome)
        j = jogadores.setdefault(slug(nome), {"id": slug(nome), "nome": nome, "partidas": 0, "gols": 0, "assist": 0})
        return j

    for l in ler("Médias"):
        j = jogador(l["Jogadores"])
        j.update(partidas=inteiro(l["Jogos:"]), gols=inteiro(l["Gols:"]), assist=inteiro(l["Assist:"]))
        if inteiro(l["G+A:"]) != j["gols"] + j["assist"]:
            avisos.append(f"Médias: G+A de {j['nome']} não bate com gols + assist.")

    for l in ler("Honrarias"):
        h = honras_da_linha(l, inteiro)
        if h:
            jogador(l["Jogadores"])["honras"] = h

    for l in ler("Over"):
        notas = {k: inteiro(l.get(col, "")) for col, k in OVER.items() if l.get(col)}
        if notas:
            jogador(l["Jogadores"])["over"] = notas

    # Meses
    meses = []
    for p in sorted(ENTRADA.glob("*.csv")):
        aba = slug(p.stem.rsplit("-", 1)[-1])
        if aba not in MESES:
            continue
        linhas = ler(p.stem.rsplit("-", 1)[-1].strip())
        lista = []
        for l in linhas:
            nome = oficial(l["Jogadores"])
            g, a = inteiro(l.get("Gols", "")), inteiro(l.get("Assist", ""))
            h = honras_da_linha(l, contar)
            if not (g or a or h):
                continue
            item = {"id": slug(nome), "gols": g, "assist": a}
            if slug(nome) not in jogadores:
                item["nome"] = nome
                item["convidado"] = True
            if h:
                item["honras"] = h
            lista.append(item)
        meses.append({"mes": f"{temporada}-{MESES[aba]:02d}", "jogadores": lista})
    meses.sort(key=lambda m: m["mes"])

    # Conferências
    soma = defaultdict(lambda: [0, 0])
    for m in meses:
        for i in m["jogadores"]:
            soma[i["id"]][0] += i["gols"]
            soma[i["id"]][1] += i["assist"]
    difs = []
    for j in jogadores.values():
        if j["partidas"] and tuple(soma[j["id"]]) != (j["gols"], j["assist"]):
            g, a = soma[j["id"]]
            if g > j["gols"] or a > j["assist"]:
                difs.append(f"{j['nome']}: meses {g}G/{a}A > temporada {j['gols']}G/{j['assist']}A")
    if difs:
        avisos.append("Meses somam MAIS que a aba Médias (levar aos adms):\n    " + "\n    ".join(difs))
    convidados = sorted({i["nome"] for m in meses for i in m["jogadores"] if i.get("convidado")})
    if convidados:
        avisos.append("Só aparecem nos meses (tratados como convidados): " + ", ".join(convidados))

    SAIDA.mkdir(parents=True, exist_ok=True)
    destino = SAIDA / f"{temporada}.json"
    destino.write_text(json.dumps({
        "temporada": temporada,
        "atualizado_em": date.today().isoformat(),
        "jogadores": sorted(jogadores.values(), key=lambda j: j["nome"].casefold()),
        "meses": meses,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "temporadas.json").write_text(json.dumps(
        sorted({p.stem for p in SAIDA.glob("[0-9]*.json")}, reverse=True)), encoding="utf-8")

    for a in avisos:
        print("AVISO:", a)
    print(f"{len(jogadores)} jogadores, {len(meses)} meses -> {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
