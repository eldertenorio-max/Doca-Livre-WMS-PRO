#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Importa base_codigo_barras a partir de TSV (FILIAL, SEQ. SKU, DESCRIÇÃO, EAN, UND EAN, DUN, UND DUN).
Cria novo dataset ativo e desativa importações anteriores.

Uso (PowerShell):
  $env:DATABASE_URL = "postgresql://..."
  $env:PGSSLMODE = "require"
  python scripts/importar_base_codigo_barras_tsv.py
  python scripts/importar_base_codigo_barras_tsv.py data/base_codigo_barras_atual.tsv
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    print("Erro: psycopg nao instalado. Execute: pip install psycopg[binary]")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_base, '.env'))
except ImportError:
    _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VAZIOS = frozenset({'', '-', 'N/A', 'NA', 'N/A.', 'N/A '})

COL_ALIASES = {
    'filial': ('filial',),
    'codigo_interno': ('seq. sku(s)', 'seq sku', 'seq. sku', 'codigo', 'codigo_interno', 'sku'),
    'descricao': ('descricao', 'descrição', 'descricao produto'),
    'ean': ('ean',),
    'und_ean': ('und ean', 'und_ean'),
    'dun': ('dun',),
    'und_dun': ('und dun', 'und_dun'),
}


def _norm_header(h: str) -> str:
    return re.sub(r'\s+', ' ', (h or '').strip().lower())


def _map_headers(fieldnames: list[str]) -> dict[str, str]:
    norm = {_norm_header(h): h for h in fieldnames if h}
    out = {}
    for key, aliases in COL_ALIASES.items():
        for a in aliases:
            if a in norm:
                out[key] = norm[a]
                break
    missing = [k for k in COL_ALIASES if k not in out and k != 'filial']
    if 'codigo_interno' not in out or 'descricao' not in out:
        raise ValueError(f'Cabeçalho inválido. Colunas encontradas: {fieldnames}')
    return out


def _vazio(val) -> bool:
    s = str(val or '').strip().upper()
    return s in VAZIOS or s == 'N/A'


def _codigo_barras(val) -> str | None:
    if _vazio(val):
        return None
    digits = re.sub(r'\D', '', str(val).strip())
    return digits if len(digits) >= 8 else None


def _sku(val) -> str | None:
    if _vazio(val):
        return None
    s = str(val).strip().rstrip('*').strip()
    return s or None


def _unidade(und_ean, und_dun) -> str | None:
    for v in (und_ean, und_dun):
        if not _vazio(v):
            return str(v).strip()
    return None


def _ler_linhas(caminho: str) -> list[dict]:
    with open(caminho, 'r', encoding='utf-8-sig', newline='') as f:
        sample = f.read(4096)
        f.seek(0)
        delim = '\t' if '\t' in sample.split('\n')[0] else ','
        reader = csv.DictReader(f, delimiter=delim)
        if not reader.fieldnames:
            raise ValueError('Arquivo sem cabeçalho')
        colmap = _map_headers(list(reader.fieldnames))
        rows = []
        for i, raw in enumerate(reader, start=2):
            filial = str(raw.get(colmap.get('filial', ''), '') or '').strip() if 'filial' in colmap else ''
            codigo_interno = _sku(raw.get(colmap['codigo_interno']))
            descricao = str(raw.get(colmap['descricao']) or '').strip()
            ean = _codigo_barras(raw.get(colmap['ean']))
            dun = _codigo_barras(raw.get(colmap['dun']))
            und_ean = str(raw.get(colmap.get('und_ean', ''), '') or '').strip()
            und_dun = str(raw.get(colmap.get('und_dun', ''), '') or '').strip()
            if not codigo_interno and not descricao and not ean and not dun:
                continue
            if not codigo_interno and not ean and not dun:
                print(f'  Linha {i}: ignorada (sem SKU e sem código de barras)')
                continue
            unidade = _unidade(und_ean, und_dun)
            data = {
                'filial': filial or None,
                'und_ean': None if _vazio(und_ean) else und_ean,
                'und_dun': None if _vazio(und_dun) else und_dun,
                'fonte': 'import_tsv',
                'linha_arquivo': i,
            }
            rows.append({
                'codigo_interno': codigo_interno,
                'ean': ean,
                'dun': dun,
                'descricao': descricao or None,
                'unidade': unidade,
                'peso': None,
                'data': data,
            })
        return _ajustar_ean_duplicados(rows)


def _ajustar_ean_duplicados(rows: list[dict]) -> list[dict]:
    """Se o mesmo EAN aparece em mais de uma linha (ex.: PT e KG), mantém EAN só na primeira;
    nas demais com DUN, remove EAN para a bipagem pelo DUN resolver a variante correta."""
    por_ean: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        e = r.get('ean')
        if e:
            por_ean.setdefault(e, []).append(i)
    for _ean, indices in por_ean.items():
        if len(indices) < 2:
            continue
        for j in indices[1:]:
            if rows[j].get('dun'):
                rows[j]['ean'] = None
    return rows


def main():
    db_url = os.environ.get('DATABASE_URL', '').strip()
    if not db_url:
        print('Erro: configure DATABASE_URL (ou .env na raiz do projeto)')
        sys.exit(1)

    default_tsv = os.path.join(_base, 'data', 'base_codigo_barras_atual.tsv')
    caminho = sys.argv[1] if len(sys.argv) > 1 else default_tsv
    if not os.path.isfile(caminho):
        print(f'Erro: arquivo não encontrado: {caminho}')
        sys.exit(1)

    print(f'Lendo: {caminho}')
    linhas = _ler_linhas(caminho)
    print(f'Linhas válidas: {len(linhas)}')

    sslmode = os.environ.get('PGSSLMODE', 'require')
    nome_arquivo = os.path.basename(caminho)

    with psycopg.connect(db_url, sslmode=sslmode, row_factory=dict_row) as conn:
        row = conn.execute(
            """INSERT INTO public.excel_datasets (arquivo_nome, importado_em, ativo, importado_por)
               VALUES (%s, NOW(), TRUE, %s)
               RETURNING dataset_id""",
            (nome_arquivo, 'importar_base_codigo_barras_tsv.py'),
        ).fetchone()
        dataset_id = row['dataset_id']
        print(f'Novo dataset: {dataset_id}')

        conn.execute(
            'UPDATE public.excel_datasets SET ativo = FALSE WHERE dataset_id != %s',
            (dataset_id,),
        )

        inseridos = 0
        for idx, item in enumerate(linhas, start=1):
            conn.execute(
                """INSERT INTO public.base_codigo_barras
                   (dataset_id, row_index, codigo_interno, ean, dun, descricao, unidade, peso, data)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)""",
                (
                    dataset_id,
                    idx,
                    item['codigo_interno'],
                    item['ean'],
                    item['dun'],
                    item['descricao'],
                    item['unidade'],
                    item['peso'],
                    json.dumps(item['data'], ensure_ascii=False),
                ),
            )
            inseridos += 1
            if inseridos % 100 == 0:
                print(f'  Inseridos: {inseridos}...')
                conn.commit()

        conn.commit()
        print(f'\nConcluído: {inseridos} registros no dataset {dataset_id}')
        print('Datasets antigos foram desativados; apenas este fica ativo.')


if __name__ == '__main__':
    main()
