#!/usr/bin/env python3
"""
Sincroniza WMS endereçamento:
  1. Produtos + categoria A/B/C/D + planejamento (TSV em data/)
  2. Layout de endereços a partir de data/wms_layout_camaras.json
     (gerar da planilha: python scripts/gerar_layout_de_excel.py \"caminho/Endereçamento Novo.xlsx\")

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


def _parse_float(v):
    if v is None or str(v).strip() == '':
        return None
    try:
        return float(str(v).replace(',', '.'))
    except Exception:
        return None


def _parse_int(v):
    if v is None or str(v).strip() == '':
        return None
    try:
        return int(float(str(v).replace(',', '.')))
    except Exception:
        return None


def importar_produtos(conn, tsv_path):
    if not os.path.isfile(tsv_path):
        print('TSV não encontrado:', tsv_path)
        return 0
    n = 0
    with open(tsv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        fields = reader.fieldnames or []
        has_plan = 'posicoes_med' in fields
        for row in reader:
            sku = (row.get('sku') or '').strip()
            if not sku:
                continue
            cat = (row.get('categoria') or 'C').strip().upper()[:1]
            base = (
                sku,
                row.get('descricao'),
                row.get('medida_cx'),
                _parse_float(row.get('cubagem')),
                _parse_float(row.get('peso_cx')),
                row.get('padrao_plt'),
                _parse_int(row.get('conversao')),
                cat,
            )
            if has_plan:
                conn.execute(
                    '''INSERT INTO public.wms_produto_enderecamento
                       (sku, descricao, medida_cx, cubagem, peso_cx, padrao_plt, conversao, categoria,
                        pedido_med_abril, pedido_max_abril, media_5_dias,
                        estoque_ideal_max, estoque_ideal_med, estoque_ideal_min,
                        dias_estoque_max, dias_estoque_med, dias_estoque_min,
                        posicoes_max, posicoes_med, posicoes_min)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT (sku) DO UPDATE SET
                         descricao = EXCLUDED.descricao,
                         medida_cx = EXCLUDED.medida_cx,
                         cubagem = EXCLUDED.cubagem,
                         peso_cx = EXCLUDED.peso_cx,
                         padrao_plt = EXCLUDED.padrao_plt,
                         conversao = EXCLUDED.conversao,
                         categoria = EXCLUDED.categoria,
                         pedido_med_abril = EXCLUDED.pedido_med_abril,
                         pedido_max_abril = EXCLUDED.pedido_max_abril,
                         media_5_dias = EXCLUDED.media_5_dias,
                         estoque_ideal_max = EXCLUDED.estoque_ideal_max,
                         estoque_ideal_med = EXCLUDED.estoque_ideal_med,
                         estoque_ideal_min = EXCLUDED.estoque_ideal_min,
                         dias_estoque_max = EXCLUDED.dias_estoque_max,
                         dias_estoque_med = EXCLUDED.dias_estoque_med,
                         dias_estoque_min = EXCLUDED.dias_estoque_min,
                         posicoes_max = EXCLUDED.posicoes_max,
                         posicoes_med = EXCLUDED.posicoes_med,
                         posicoes_min = EXCLUDED.posicoes_min,
                         atualizado_em = NOW()''',
                    base + (
                        _parse_int(row.get('pedido_med_abril')),
                        _parse_int(row.get('pedido_max_abril')),
                        _parse_int(row.get('media_5_dias')),
                        _parse_int(row.get('estoque_ideal_max')),
                        _parse_int(row.get('estoque_ideal_med')),
                        _parse_int(row.get('estoque_ideal_min')),
                        _parse_int(row.get('dias_estoque_max')),
                        _parse_int(row.get('dias_estoque_med')),
                        _parse_int(row.get('dias_estoque_min')),
                        _parse_int(row.get('posicoes_max')),
                        _parse_int(row.get('posicoes_med')),
                        _parse_int(row.get('posicoes_min')),
                    ),
                )
            else:
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
                    base,
                )
            n += 1
    conn.commit()
    print(f'Produtos importados/atualizados: {n}')
    try:
        from wms_enderecamento import _sync_all_produtos_estoque_cache
        synced = _sync_all_produtos_estoque_cache(conn)
        conn.commit()
        print(f'Cache estoque real WMS recalculado: {synced} SKUs')
    except Exception as e:
        print('Aviso: não foi possível recalcular estoque real:', e)
    return n


def main():
    parser = argparse.ArgumentParser(description='WMS: produtos + layout por categoria (sem Excel)')
    default_tsv = os.path.join(ROOT, 'data', 'wms_produtos_planejamento.tsv')
    if not os.path.isfile(default_tsv):
        default_tsv = os.path.join(ROOT, 'data', 'wms_produtos_categoria.tsv')
    parser.add_argument('--tsv', default=default_tsv)
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
