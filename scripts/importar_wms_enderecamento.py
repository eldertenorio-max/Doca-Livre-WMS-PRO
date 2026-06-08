#!/usr/bin/env python3
"""
Sincroniza WMS endereçamento SEM planilha Excel:
  1. Produtos + categoria A/B/C/D (TSV em data/)
  2. Layout de endereços + distribuição por categoria (JSON + zoneamento)

Uso:
  $env:DATABASE_URL = "postgresql://postgres:...@db....supabase.co:5432/postgres"
  $env:PGSSLMODE = "require"
  python -u scripts/importar_wms_enderecamento.py
  python -u scripts/importar_wms_enderecamento.py --force-layout
"""
from __future__ import annotations

import argparse
import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from wms_enderecamento import ensure_wms_schema, _seed_wms_defaults, gerar_layout_enderecos


def _url():
    u = (os.environ.get('DATABASE_URL') or '').strip()
    if not u:
        raise RuntimeError('Defina DATABASE_URL')
    return u


def get_conn():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(_url(), sslmode=os.environ.get('PGSSLMODE', 'require'), row_factory=dict_row)


class PgConn:
    def __init__(self, c):
        self._c = c
        self.kind = 'pg'

    def execute(self, sql, params=()):
        if '?' in sql:
            sql = sql.replace('?', '%s')
        return self._c.execute(sql, params or ())

    def commit(self):
        self._c.commit()

    def rollback(self):
        self._c.rollback()

    def close(self):
        self._c.close()


def importar_produtos(conn, tsv_path):
    if not os.path.isfile(tsv_path):
        print('TSV não encontrado:', tsv_path)
        return 0
    n = 0
    with open(tsv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            sku = (row.get('sku') or '').strip()
            if not sku:
                continue
            cub = row.get('cubagem') or None
            peso = row.get('peso_cx') or None
            conv = row.get('conversao') or None
            try:
                cub = float(str(cub).replace(',', '.')) if cub else None
            except Exception:
                cub = None
            try:
                peso = float(str(peso).replace(',', '.')) if peso else None
            except Exception:
                peso = None
            try:
                conv = int(float(conv)) if conv else None
            except Exception:
                conv = None
            conn.execute(
                '''INSERT INTO public.wms_produto_enderecamento
                   (sku, descricao, medida_cx, cubagem, peso_cx, padrao_plt, conversao, categoria)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (sku) DO UPDATE SET
                     descricao = EXCLUDED.descricao,
                     medida_cx = EXCLUDED.medida_cx,
                     cubagem = EXCLUDED.cubagem,
                     peso_cx = EXCLUDED.peso_cx,
                     padrao_plt = EXCLUDED.padrao_plt,
                     conversao = EXCLUDED.conversao,
                     categoria = EXCLUDED.categoria,
                     atualizado_em = NOW()''',
                (
                    sku,
                    row.get('descricao'),
                    row.get('medida_cx'),
                    cub,
                    peso,
                    row.get('padrao_plt'),
                    conv,
                    (row.get('categoria') or 'C').strip().upper()[:1],
                ),
            )
            n += 1
    conn.commit()
    print(f'Produtos importados/atualizados: {n}')
    return n


def main():
    parser = argparse.ArgumentParser(description='WMS: produtos + layout por categoria (sem Excel)')
    parser.add_argument(
        '--tsv',
        default=os.path.join(ROOT, 'data', 'wms_produtos_categoria.tsv'),
    )
    parser.add_argument(
        '--force-layout',
        action='store_true',
        help='Recalcula distribuição de categorias em todos os endereços',
    )
    args = parser.parse_args()

    raw = get_conn()
    conn = PgConn(raw)
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)
    importar_produtos(conn, args.tsv)
    layout = gerar_layout_enderecos(conn, force=args.force_layout)
    print('Layout:', layout)
    conn.close()
    print('Concluído (sem Excel).')


if __name__ == '__main__':
    main()
