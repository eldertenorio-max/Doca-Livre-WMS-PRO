"""
Configuração ÚNICA — etiqueta Zebra ZD220 60×40 mm (longarina, palete, ZPL, HTML).

Altere somente aqui. Driver Windows deve espelhar estes valores:
  Largura 60 mm · Altura 40 mm · Rotação 0° (Retrato)
  Chrome: margens Nenhuma · escala 100%

Não use @page landscape — conflita com o driver em retrato.
"""

ETIQUETA_ZEBRA_ZD220 = {
    'modelo': 'ZD220',
    'dpi': 203,
    'largura_mm': 60,
    'altura_mm': 40,
    'driver_largura_mm': 60,
    'driver_altura_mm': 40,
    'driver_rotacao': '0° Retrato',
    'chrome_margens': 'Nenhuma',
    'chrome_escala': '100%',
    # CSS @page — sem "landscape" (alinhado ao driver retrato 60×40)
    'page_css': '60mm 40mm',
    'grid_top_pct': 34,
    'grid_mid_pct': 42,
    'grid_bot_pct': 24,
}


def ctx_etiqueta_zebra():
    """Contexto Jinja para todos os templates de etiqueta WMS."""
    z = ETIQUETA_ZEBRA_ZD220
    w, h = z['largura_mm'], z['altura_mm']
    return {
        'etq_zebra': z,
        'etq_largura_mm': w,
        'etq_altura_mm': h,
        'etq_page_size': z['page_css'],
        'etq_driver_hint': (
            f"Driver {z['modelo']} → Largura <strong>{z['driver_largura_mm']} mm</strong> · "
            f"Altura <strong>{z['driver_altura_mm']} mm</strong> · "
            f"Rotação <strong>{z['driver_rotacao']}</strong>. "
            f"Chrome: margens <strong>{z['chrome_margens']}</strong> · "
            f"escala <strong>{z['chrome_escala']}</strong>."
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
