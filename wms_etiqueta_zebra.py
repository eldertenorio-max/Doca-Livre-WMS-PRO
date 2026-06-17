"""
Configuração ÚNICA — etiqueta Zebra ZD220 60×40 mm (longarina, palete, ZPL, HTML).

Altere somente aqui. Driver Windows deve espelhar estes valores:
  Largura 60 mm · Altura 40 mm · Rotação 0° (Retrato)
  Chrome: margens Nenhuma · escala 100% · Gráficos de fundo LIGADO

No Windows o Chrome ignora @page em mm — use polegadas (page_css_in).
Luz amarela piscando = tamanho errado no driver ou no diálogo do Chrome.
"""

_MM_IN = 25.4
_W_MM = 60
_H_MM = 40
_W_IN = round(_W_MM / _MM_IN, 2)   # 2.36
_H_IN = round(_H_MM / _MM_IN, 2)   # 1.57

ETIQUETA_ZEBRA_ZD220 = {
    'modelo': 'ZD220',
    'dpi': 203,
    'largura_mm': _W_MM,
    'altura_mm': _H_MM,
    'largura_in': _W_IN,
    'altura_in': _H_IN,
    'driver_largura_mm': _W_MM,
    'driver_altura_mm': _H_MM,
    'driver_rotacao': '0° Retrato',
    'chrome_margens': 'Nenhuma',
    'chrome_escala': '100%',
    'chrome_graficos_fundo': 'Ligado',
    # @page — polegadas primeiro (driver Zebra no Windows)
    'page_css_in': f'{_W_IN}in {_H_IN}in',
    'page_css_mm': f'{_W_MM}mm {_H_MM}mm',
    'page_css': f'{_W_IN}in {_H_IN}in',
    'grid_top_pct': 34,
    'grid_mid_pct': 42,
    'grid_bot_pct': 24,
}


def ctx_etiqueta_zebra():
    """Contexto Jinja para todos os templates de etiqueta WMS."""
    z = ETIQUETA_ZEBRA_ZD220
    w, h = z['largura_mm'], z['altura_mm']
    scale = 3
    return {
        'etq_zebra': z,
        'etq_largura_mm': w,
        'etq_altura_mm': h,
        'etq_largura_in': z['largura_in'],
        'etq_altura_in': z['altura_in'],
        'etq_preview_scale': scale,
        'etq_largura_screen_mm': w * scale,
        'etq_altura_screen_mm': h * scale,
        'etq_page_size': z['page_css'],
        'etq_page_size_in': z['page_css_in'],
        'etq_page_size_mm': z['page_css_mm'],
        'etq_driver_hint': (
            f"Botão <strong>Imprimir</strong> envia <strong>ZPL</strong> via Browser Print ({z['modelo']}). "
            f"Instale <a href=\"https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html\" "
            f"target=\"_blank\" rel=\"noopener\">Browser Print</a>, defina a ZD220 em Default Devices e aceite "
            f"<a href=\"https://localhost:9101/ssl_support\" target=\"_blank\" rel=\"noopener\">certificado SSL</a>."
        ),
    }


def zpl_dimensoes_mm():
    z = ETIQUETA_ZEBRA_ZD220
    return z['largura_mm'], z['altura_mm']


def zpl_longarina_grid_mm():
    """Linhas horizontais do grid longarina (mm), derivadas dos percentuais."""
    z = ETIQUETA_ZEBRA_ZD220
    h, w = z['altura_mm'], z['largura_mm']
    y2 = round(h * z['grid_top_pct'] / 100, 1)
    y3 = round(h * (z['grid_top_pct'] + z['grid_mid_pct']) / 100, 1)
    return y2, y3, round(w / 4, 1)
