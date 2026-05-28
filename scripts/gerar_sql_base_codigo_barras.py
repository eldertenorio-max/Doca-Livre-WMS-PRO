#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Gera supabase/import_base_codigo_barras_atual.sql a partir do TSV."""
from __future__ import annotations

import json
import os
import sys
import uuid

_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_base, 'scripts'))
from importar_base_codigo_barras_tsv import _ler_linhas  # noqa: E402


def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"


def esc_json(d):
    return esc(json.dumps(d, ensure_ascii=False)) + '::jsonb'


def main():
    tsv = os.path.join(_base, 'data', 'base_codigo_barras_atual.tsv')
    out = os.path.join(_base, 'supabase', 'import_base_codigo_barras_atual.sql')
    rows = _ler_linhas(tsv)
    ds = str(uuid.uuid4())
    lines = [
        '-- =============================================================================',
        '-- Atualiza base_codigo_barras com lista atual (FILIAL / SKU / EAN / DUN)',
        '-- Cole no SQL Editor do Supabase (producao) e execute UMA vez.',
        f'-- Registros: {len(rows)} | Dataset: {ds}',
        '-- =============================================================================',
        '',
        'BEGIN;',
        '',
        'INSERT INTO public.excel_datasets (dataset_id, arquivo_nome, ativo, importado_por)',
        f"VALUES ('{ds}'::uuid, 'base_codigo_barras_atual.tsv', TRUE, 'import_base_codigo_barras_atual.sql');",
        '',
        'UPDATE public.excel_datasets',
        'SET ativo = FALSE',
        f"WHERE dataset_id <> '{ds}'::uuid;",
        '',
        'INSERT INTO public.base_codigo_barras',
        '  (dataset_id, row_index, codigo_interno, ean, dun, descricao, unidade, peso, data)',
        'VALUES',
    ]
    vals = []
    for i, r in enumerate(rows, 1):
        vals.append(
            f"  ('{ds}'::uuid, {i}, {esc(r['codigo_interno'])}, {esc(r['ean'])}, {esc(r['dun'])}, "
            f"{esc(r['descricao'])}, {esc(r['unidade'])}, NULL, {esc_json(r['data'])})"
        )
    lines.append(',\n'.join(vals) + ';')
    lines += [
        '',
        'COMMIT;',
        '',
        '-- Verificacao (opcional):',
        f"-- SELECT COUNT(*) FROM public.base_codigo_barras WHERE dataset_id = '{ds}'::uuid;",
        f"-- SELECT dataset_id, arquivo_nome, ativo FROM public.excel_datasets WHERE dataset_id = '{ds}'::uuid;",
    ]
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(f'Gerado: {out} ({len(rows)} registros, {os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
