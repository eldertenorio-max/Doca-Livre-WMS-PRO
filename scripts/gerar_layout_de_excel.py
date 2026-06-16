#!/usr/bin/env python3
"""Gera data/wms_layout_camaras.json a partir da planilha de endereçamento."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

ACOES_PLANILHA = {
    'ENVIO P/ MINAS': 'envio_mg',
    'RETRABALHO': 'retrabalho',
    'DESCARTE': 'descarte_perdas',
    'BLOQUEADOS': 'palete_bloqueado',
    'CAFE': 'cafe',
}

LABELS = {
    'envio_mg': 'ENVIO P/ MINAS',
    'retrabalho': 'RETRABALHO',
    'descarte_perdas': 'DESCARTE',
    'palete_bloqueado': 'BLOQUEADOS',
    'cafe': 'CAFE',
}


def _detectar_acao(descricao: str) -> str | None:
    d = (descricao or '').strip().upper()
    if not d:
        return None
    for chave, valor in ACOES_PLANILHA.items():
        if chave in d:
            return valor
    return None


def parsear_planilha(path: str) -> dict:
    import pandas as pd

    df = pd.read_excel(path, sheet_name=0, header=None)
    camara_atual = None
    por_camara: dict[int, list] = {}

    for _, row in df.iterrows():
        c0 = str(row[0]).strip() if pd.notna(row[0]) else ''
        m = re.match(r'CAMARA\s*(\d+)\s*-\s*RUA\s*([A-Z])', c0, re.I)
        if m:
            camara_atual = int(m.group(1))
            continue
        if c0.upper() == 'RUA':
            continue
        try:
            rua = str(row[0]).strip().upper()
            posicao = int(row[1])
            nivel = int(row[2])
        except (TypeError, ValueError):
            continue
        if not camara_atual:
            continue
        desc = str(row[4]).strip() if pd.notna(row[4]) else ''
        acao = _detectar_acao(desc)
        end = {'rua': rua, 'posicao': posicao, 'nivel': nivel}
        if acao:
            end['destino_acao'] = acao
            end['destino_label'] = LABELS.get(acao, acao)
        por_camara.setdefault(camara_atual, []).append(end)

    camaras = []
    for cod in sorted(por_camara):
        ends = por_camara[cod]
        ruas = sorted({e['rua'] for e in ends})
        niveis = max(e['nivel'] for e in ends)
        camaras.append({
            'codigo': cod,
            'descricao': f'Câmara {cod}',
            'ruas': ruas,
            'niveis': niveis,
            'total_posicoes': len(ends),
            'enderecos': ends,
        })

    return {
        'descricao': 'Layout físico CD Guarulhos — Endereçamento Novo (planilha)',
        'fonte': os.path.basename(path),
        'destinos_acao': LABELS,
        'camaras': camaras,
    }


def main():
    parser = argparse.ArgumentParser(description='Gera wms_layout_camaras.json da planilha Excel')
    default_xlsx = os.path.join(
        os.path.expanduser('~'), 'Desktop', 'DIEGO', 'Estoque', 'Endereçamento Novo.xlsx',
    )
    parser.add_argument('xlsx', nargs='?', default=default_xlsx)
    parser.add_argument(
        '--out',
        default=os.path.join(ROOT, 'data', 'wms_layout_camaras.json'),
    )
    args = parser.parse_args()
    if not os.path.isfile(args.xlsx):
        print('Arquivo não encontrado:', args.xlsx)
        sys.exit(1)
    data = parsear_planilha(args.xlsx)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total = sum(c['total_posicoes'] for c in data['camaras'])
    acoes = sum(
        1 for c in data['camaras'] for e in c['enderecos'] if e.get('destino_acao')
    )
    print(f'Layout gravado em {args.out}')
    print(f'Câmaras: {len(data["camaras"])} | Endereços: {total} | Com destino/ação: {acoes}')


if __name__ == '__main__':
    main()
