#!/usr/bin/env python3
"""Gera data/wms_produtos_planejamento.tsv a partir da fonte tabulada."""
from __future__ import annotations

import csv
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTE = os.path.join(ROOT, 'data', 'wms_produtos_planejamento_fonte.tsv')
SAIDA = os.path.join(ROOT, 'data', 'wms_produtos_planejamento.tsv')

HEADER_OUT = [
    'sku', 'descricao', 'medida_cx', 'cubagem', 'peso_cx', 'padrao_plt', 'conversao', 'categoria',
    'pedido_med_abril', 'pedido_max_abril', 'media_5_dias',
    'estoque_ideal_max', 'estoque_ideal_med', 'estoque_ideal_min',
    'dias_estoque_max', 'dias_estoque_med', 'dias_estoque_min',
    'posicoes_max', 'posicoes_med', 'posicoes_min',
]


def _num(s):
    if s is None:
        return ''
    t = str(s).strip()
    if not t:
        return ''
    t = t.replace(',', '.').upper().replace(' KG', '').replace('CX', '').strip()
    try:
        if '.' in t:
            return str(float(t))
        return str(int(float(t)))
    except Exception:
        return ''


def _int(s):
    v = _num(s)
    if v == '':
        return ''
    try:
        return str(int(float(v)))
    except Exception:
        return ''


def parse_row(parts):
    while len(parts) < 25:
        parts.append('')
    sku = parts[0].strip()
    if not sku or not re.match(r'\d{2}\.\d{2}\.\d{4}', sku):
        return None
    return {
        'sku': sku,
        'descricao': parts[1].strip(),
        'medida_cx': parts[2].strip(),
        'cubagem': _num(parts[3]),
        'peso_cx': _num(parts[4]),
        'padrao_plt': parts[5].strip(),
        'conversao': _int(parts[6]),
        'categoria': (parts[7].strip().upper()[:1] or 'C'),
        'pedido_med_abril': _int(parts[8]),
        'pedido_max_abril': _int(parts[9]),
        'media_5_dias': _int(parts[10]),
        'estoque_ideal_max': _int(parts[11]),
        'estoque_ideal_med': _int(parts[12]),
        'estoque_ideal_min': _int(parts[13]),
        'dias_estoque_max': _int(parts[14]),
        'dias_estoque_med': _int(parts[15]),
        'dias_estoque_min': _int(parts[16]),
        'posicoes_max': _int(parts[17]),
        'posicoes_med': _int(parts[18]),
        'posicoes_min': _int(parts[19]),
    }


def main():
    if not os.path.isfile(FONTE):
        raise SystemExit(f'Fonte não encontrada: {FONTE}')
    rows = []
    with open(FONTE, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n\r')
            if not line.strip():
                continue
            if line.lower().startswith('sku\t'):
                continue
            parts = line.split('\t')
            r = parse_row(parts)
            if r:
                rows.append(r)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=HEADER_OUT, delimiter='\t')
        w.writeheader()
        w.writerows(rows)
    print(f'Gerado {len(rows)} produtos em {SAIDA}')


if __name__ == '__main__':
    main()
