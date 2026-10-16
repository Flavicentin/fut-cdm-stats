"""Gera o SQL de carga do Supabase a partir de site/data/<temporada>.json e dados/apelidos.json.

Substitui por completo os dados da temporada (estatísticas, honrarias, notas e meses);
jogadores e apelidos são inseridos/atualizados (upsert). Rode o resultado no SQL Editor.

Uso: python scripts/json_para_seed.py [temporada]   ->  supabase/seed/<temporada>.sql
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NOTAS = ["pac", "fin", "pas", "dri", "def", "fis", "ovr"]


def slug(nome):
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def valores(linhas):
    return ",\n  ".join("(" + ", ".join(q(v) for v in l) + ")" for l in linhas)


def main():
    temporada = sys.argv[1] if len(sys.argv) > 1 else str(date.today().year)
    dados = json.loads((RAIZ / "site" / "data" / f"{temporada}.json").read_text(encoding="utf-8"))
    apelidos = json.loads((RAIZ / "dados" / "apelidos.json").read_text(encoding="utf-8"))

    # Jogadores: elenco + convidados que só aparecem nos meses
    jogadores = {j["id"]: j["nome"] for j in dados["jogadores"]}
    for m in dados["meses"]:
        for i in m["jogadores"]:
            jogadores.setdefault(i["id"], i.get("nome", i["id"]))

    sql = [f"-- Carga da temporada {temporada} gerada por scripts/json_para_seed.py", "begin;", ""]
    sql.append(f"insert into public.temporadas (id, nome) values ({q(temporada)}, {q('Temporada ' + temporada)}) on conflict (id) do nothing;")
    # Limpa a temporada (honrarias, notas e meses caem em cascata)
    sql.append(f"delete from public.meses where temporada_id = {q(temporada)};")
    sql.append(f"delete from public.estatisticas_temporada where temporada_id = {q(temporada)};")

    sql.append("\ninsert into public.jogadores (id, nome) values\n  "
               + valores(sorted(jogadores.items()))
               + "\non conflict (id) do update set nome = excluded.nome;")

    linhas_apelidos = []
    for oficial, outros in apelidos.items():
        alvo = slug(oficial)
        if alvo not in jogadores:
            continue
        for a in outros:
            if slug(a) != alvo:
                linhas_apelidos.append((slug(a), a, alvo))
    if linhas_apelidos:
        sql.append("\ninsert into public.apelidos (slug, apelido, jogador_id) values\n  "
                   + valores(linhas_apelidos)
                   + "\non conflict (slug) do update set apelido = excluded.apelido, jogador_id = excluded.jogador_id;")

    sql.append("\ninsert into public.estatisticas_temporada (temporada_id, jogador_id, partidas, gols, assist) values\n  "
               + valores([(temporada, j["id"], j["partidas"], j["gols"], j["assist"]) for j in dados["jogadores"]]) + ";")

    honras = [(temporada, j["id"], k, n) for j in dados["jogadores"] for k, n in (j.get("honras") or {}).items() if n]
    if honras:
        sql.append("\ninsert into public.honrarias_temporada (temporada_id, jogador_id, tipo_id, quantidade) values\n  "
                   + valores(honras) + ";")

    notas = [(temporada, j["id"], *[j["over"].get(k) for k in NOTAS]) for j in dados["jogadores"] if j.get("over")]
    if notas:
        sql.append("\ninsert into public.notas_over (temporada_id, jogador_id, " + ", ".join(NOTAS) + ") values\n  "
                   + valores(notas) + ";")

    for m in dados["meses"]:
        mes = m["mes"] + "-01"
        sql.append(f"\n-- {m['mes']}")
        sql.append(f"insert into public.meses (temporada_id, mes) values ({q(temporada)}, {q(mes)});")
        if m["jogadores"]:
            sql.append("insert into public.estatisticas_mes (temporada_id, mes, jogador_id, gols, assist) values\n  "
                       + valores([(temporada, mes, i["id"], i["gols"], i["assist"]) for i in m["jogadores"]]) + ";")
        hm = [(temporada, mes, i["id"], k, n) for i in m["jogadores"] for k, n in (i.get("honras") or {}).items() if n]
        if hm:
            sql.append("insert into public.honrarias_mes (temporada_id, mes, jogador_id, tipo_id, quantidade) values\n  "
                       + valores(hm) + ";")

    sql.append(f"\nupdate public.temporadas set atualizado_em = {q(dados['atualizado_em'] + ' 12:00-03')} where id = {q(temporada)};")
    sql.append("\ncommit;\n")

    destino = RAIZ / "supabase" / "seed" / f"{temporada}.sql"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("\n".join(sql), encoding="utf-8")
    print(f"{len(jogadores)} jogadores, {len(dados['meses'])} meses -> {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
