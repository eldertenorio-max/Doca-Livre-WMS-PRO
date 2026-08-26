"""
Máscara canônica de endereço WMS + dígito verificador de bipagem.

Formato WMS (igual nos três sistemas):  CC-RUA-PP-N
  ex.: 12-C-14-1   (câmara 12, rua C, coluna 14, nível 1)
       06-1-02-3   (Plus: câmara 6, rua 1, coluna 2, nível 3)

Bipagem da longarina (não é o endereço em si):  C.COL.NIV*DV
  ex.: 12.14.1*47
O DV não é sequencial — impede bipagem de memória / “bipagem cega”.
Etiquetas antigas (12.14.1 / 12.14.1.1) continuam válidas.
"""
from __future__ import annotations

import re
from typing import Any

# Câmara 2 dígitos, rua letras ou número, posição 2 dígitos, nível 1–2 dígitos.
CANONICAL_RE = re.compile(
    r'^(\d{1,2})-([A-Z0-9]{1,3})-(\d{1,2})-(\d{1,2})$',
    re.I,
)
# Plus interno: C6-R1-N3-P2
PLUS_ID_RE = re.compile(r'^C(\d+)-R(\d+)-N(\d+)-P(\d+)$', re.I)
# Voz: C6-R1-C2-N3
PLUS_VOICE_RE = re.compile(r'^C(\d+)-R(\d+)-C(\d+)-N(\d+)$', re.I)
# Bip 3 partes + DV opcional: 12.14.1 ou 12.14.1*47
BIP3_RE = re.compile(r'^(\d+)\.(\d+)\.(\d+)(?:\*(\d{2}))?$')
# Bip legado 4 partes: 12.14.1.1
BIP4_RE = re.compile(r'^(\d+)\.(\d+)\.(\d+)\.(\d+)$')


def codigo_endereco(camara: Any, rua: Any, posicao: Any, nivel: Any) -> str:
    """Máscara única: 12-C-14-1 / 06-1-02-3."""
    rua_s = str(rua or '').strip().upper() or 'R'
    return f'{int(camara):02d}-{rua_s}-{int(posicao):02d}-{int(nivel)}'


def digito_verificador(camara: Any, rua: Any, posicao: Any, nivel: Any) -> str:
    """Dois dígitos 00–96, não sequenciais (hash da posição + rua)."""
    s = f'{int(camara):02d}{str(rua or "").strip().upper()}{int(posicao):02d}{int(nivel)}'
    acc = 0
    for i, ch in enumerate(s):
        acc = (acc * 33 + ord(ch) + i * 7) % 97
    return f'{acc:02d}'


def barcode_longarina(camara: Any, posicao: Any, nivel: Any, rua: Any = None) -> str:
    """Código de barras CODE128 da longarina, com DV. Ex.: 12.14.1*47."""
    base = f'{int(camara)}.{int(posicao)}.{int(nivel)}'
    rua_s = str(rua or '').strip().upper()
    if not rua_s:
        return base
    return f'{base}*{digito_verificador(camara, rua_s, posicao, nivel)}'


def barcode_longarina_base(bc: str) -> str:
    """Remove DV e 4ª parte legada — compara só câmara.coluna.nível."""
    raw = (bc or '').strip().replace(' ', '')
    if '*' in raw:
        raw = raw.split('*', 1)[0]
    parts = raw.split('.')
    if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
        return f'{int(parts[0])}.{int(parts[1])}.{int(parts[2])}'
    return raw


def parse_codigo_wms(texto: str) -> dict | None:
    """Lê máscara canônica, Plus interno ou voz. Sem validar DV."""
    up = (texto or '').strip().upper().replace(' ', '')
    if not up:
        return None
    if '*' in up:
        up = up.split('*', 1)[0]
    # Exibição 12.C.14.1 (não confundir com bip 12.14.1 nem legado 12.14.1.1)
    m_disp = re.match(r'^(\d{1,2})\.([A-Z][A-Z0-9]{0,2})\.(\d{1,2})\.(\d{1,2})$', up)
    if m_disp:
        up = f'{int(m_disp.group(1)):02d}-{m_disp.group(2).upper()}-{int(m_disp.group(3)):02d}-{int(m_disp.group(4))}'
    m = CANONICAL_RE.match(up)
    if m:
        return {
            'camara': int(m.group(1)),
            'rua': m.group(2).upper(),
            'posicao': int(m.group(3)),
            'nivel': int(m.group(4)),
        }
    m = PLUS_ID_RE.match(up)
    if m:
        return {
            'camara': int(m.group(1)),
            'rua': str(int(m.group(2))),
            'posicao': int(m.group(4)),
            'nivel': int(m.group(3)),
        }
    m = PLUS_VOICE_RE.match(up)
    if m:
        return {
            'camara': int(m.group(1)),
            'rua': str(int(m.group(2))),
            'posicao': int(m.group(3)),
            'nivel': int(m.group(4)),
        }
    return None


def parse_bip(texto: str) -> dict:
    """
    Interpreta bipagem ou código WMS.

    Retorno:
      ok, codigo_wms?, camara, rua?, posicao, nivel, dv?, dv_ok?, erro?, legado?, apto?
    """
    raw = (texto or '').strip()
    if not raw:
        return {'ok': False, 'erro': 'Código vazio.'}
    compact = raw.replace(' ', '').upper()

    m4 = BIP4_RE.match(compact)
    if m4:
        cam, pos, niv, apto = (int(x) for x in m4.groups())
        return {
            'ok': True,
            'camara': cam,
            'rua': None,
            'apto': apto,
            'posicao': pos,
            'nivel': niv,
            'codigo_wms': None,
            'legado': True,
            'dv': None,
            'dv_ok': True,
            'erro': None,
        }

    m3 = BIP3_RE.match(compact)
    if m3:
        return {
            'ok': True,
            'camara': int(m3.group(1)),
            'rua': None,
            'posicao': int(m3.group(2)),
            'nivel': int(m3.group(3)),
            'codigo_wms': None,
            'legado': m3.group(4) is None,
            'dv': m3.group(4),
            'dv_ok': True,
            'erro': None,
        }

    base, dv_txt = compact, None
    if '*' in compact:
        base, dv_txt = compact.split('*', 1)

    wms = parse_codigo_wms(base)
    if not wms:
        return {'ok': False, 'erro': 'Código de endereço não reconhecido.'}

    esperado = digito_verificador(wms['camara'], wms['rua'], wms['posicao'], wms['nivel'])
    dv_ok = True if not dv_txt else dv_txt == esperado
    return {
        'ok': dv_ok,
        'camara': wms['camara'],
        'rua': wms['rua'],
        'posicao': wms['posicao'],
        'nivel': wms['nivel'],
        'codigo_wms': codigo_endereco(**wms),
        'legado': False,
        'dv': dv_txt,
        'dv_ok': dv_ok,
        'erro': None if dv_ok else 'Dígito verificador inválido. Bipe a etiqueta da posição, não digite de memória.',
    }


def validar_dv_se_presente(camara, rua, posicao, nivel, dv: str | None) -> bool:
    if not dv:
        return True
    return dv == digito_verificador(camara, rua, posicao, nivel)
