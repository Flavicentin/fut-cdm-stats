"""Confere se o Supabase devolve os mesmos dados que site/data/<temporada>.json.

Usa só a chave publishable (leitura pública) de site/js/config.js.
Uso: python scripts/conferir_supabase.py [temporada]
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def config():
    js = (RAIZ / "site" / "js" / "config.js").read_text(encoding="utf-8")
    return re.search(r"supabaseUrl:\s*'([^']+)'", js)[1], re.search(r"supabaseKey:\s*'([^']+)'", js)[1]


def normalizar(dados):
    """Ordena listas e remove 'nome' dos itens mensais de quem é do elenco (o JSON só traz para convidados)."""
    elenco = {j["id"] for j in dados["jogadores"]}
    jogadores = sorted(({k: v for k, v in j.items()} for j in dados["jogadores"]), key=lambda j: j["id"])
    meses = []
    for m in sorted(dados["meses"], key=lambda m: m["mes"]):
        itens = []
        for i in m["jogadores"]:
            i = dict(i)
            if i["id"] in elenco:
                i.pop("nome", None)
            itens.append(i)
        meses.append({"mes": m["mes"], "jogadores": sorted(itens, key=lambda i: i["id"])})
    return {"temporada": dados["temporada"], "atualizado_em": dados["atualizado_em"], "jogadores": jogadores, "meses": meses}


def main():
    temporada = sys.argv[1] if len(sys.argv) > 1 else str(date.today().year)
    url, chave = config()
    req = urllib.request.Request(f"{url}/rest/v1/v_temporada_json?select=dados&temporada=eq.{temporada}", headers={"apikey": chave})
    linhas = json.load(urllib.request.urlopen(req))
    if not linhas:
        sys.exit(f"Temporada {temporada} não existe no Supabase.")
    remoto = normalizar(linhas[0]["dados"])
    local = normalizar(json.loads((RAIZ / "site" / "data" / f"{temporada}.json").read_text(encoding="utf-8")))

    difs = []
    if remoto["atualizado_em"] != local["atualizado_em"]:
        difs.append(f"atualizado_em: supabase {remoto['atualizado_em']} x local {local['atualizado_em']}")
    rj, lj = {j["id"]: j for j in remoto["jogadores"]}, {j["id"]: j for j in local["jogadores"]}
    for i in sorted(rj.keys() | lj.keys()):
        if rj.get(i) != lj.get(i):
            difs.append(f"jogador {i}: supabase {rj.get(i)} x local {lj.get(i)}")
    rm, lm = {m["mes"]: m for m in remoto["meses"]}, {m["mes"]: m for m in local["meses"]}
    for m in sorted(rm.keys() | lm.keys()):
        if rm.get(m) != lm.get(m):
            difs.append(f"mês {m} diferente")

    if difs:
        print("DIFERENÇAS:\n  " + "\n  ".join(difs))
        sys.exit(1)
    print(f"OK: {len(rj)} jogadores e {len(rm)} meses iguais ao JSON local.")


if __name__ == "__main__":
    main()
