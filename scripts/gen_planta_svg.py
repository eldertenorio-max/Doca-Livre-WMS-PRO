#!/usr/bin/env python3
"""Gera SVG de referência da planta 2D WMS."""
import pathlib

CELL = 14
GAP = 2
COL_W = CELL + GAP
LEVELS = 5


def rack_grid(cols, ox, oy):
    parts = []
    for c in range(cols):
        for lv in range(LEVELS):
            n = LEVELS - lv
            x = ox + c * COL_W
            y = oy + lv * (CELL + GAP)
            fill = "#90caf9" if n == 1 else "#0d47a1"
            parts.append(
                f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" '
                f'fill="{fill}" stroke="#ff9800" stroke-width="2"/>'
            )
    return "".join(parts)


def cam_card(x, rack_cols_l, rack_cols_r, cod, total, ruas, tipo, temp):
    rack_w_l = rack_cols_l * COL_W + 8 if rack_cols_l else 0
    rack_w_r = rack_cols_r * COL_W + 8 if rack_cols_r else 0
    cor_w = 74
    body_h = LEVELS * (CELL + GAP) + 12
    w = rack_w_l + cor_w + rack_w_r + 16
    card_h = 22 + body_h + 32
    cx_mid = 0
    parts = [f'<g transform="translate({x},60)">']
    parts.append(
        f'<rect width="{w}" height="{card_h}" fill="#fff" stroke="#ff9800" stroke-width="2"/>'
    )
    parts.append(
        f'<text x="{w/2}" y="15" text-anchor="middle" class="topo">'
        f"{total} Posições · níveis 1–5</text>"
    )
    parts.append(f'<line x1="0" y1="22" x2="{w}" y2="22" stroke="#ffe0b2"/>')
    y0 = 26
    lx = 4
    parts.append(
        f'<rect x="{lx}" y="{y0}" width="{rack_w_l}" height="{body_h}" '
        f'fill="#fff" stroke="#ff9800" stroke-width="3"/>'
    )
    if rack_cols_l:
        parts.append(rack_grid(rack_cols_l, lx + 4, y0 + 4))
    cx = lx + rack_w_l + 4
    cx_mid = cx + cor_w / 2
    parts.append(
        f'<rect x="{cx}" y="{y0}" width="{cor_w}" height="{body_h}" '
        f'fill="#fff" stroke="#ff9800" stroke-width="3"/>'
    )
    parts.append(
        f'<text x="{cx_mid}" y="{y0 + 16}" text-anchor="middle" class="cor-meta">CÂMARA FRIA</text>'
    )
    parts.append(
        f'<text x="{cx_mid}" y="{y0 + 28}" text-anchor="middle" class="cor-meta">ruas {ruas}</text>'
    )
    parts.append(
        f'<text x="{cx_mid}" y="{y0 + body_h / 2}" text-anchor="middle" class="cor-num">{cod}</text>'
    )
    ty = y0 + body_h / 2 + 38
    parts.append(
        f'<text x="{cx_mid}" y="{ty}" text-anchor="middle" class="cor-tipo" '
        f'transform="rotate(-90 {cx_mid} {ty})">{tipo}</text>'
    )
    if temp:
        parts.append(
            f'<text x="{cx_mid}" y="{y0 + body_h - 36}" text-anchor="middle" class="cor-temp">{temp}</text>'
        )
    parts.append(
        f'<rect x="{cx_mid - 18}" y="{y0 + body_h - 16}" width="36" height="10" '
        f'fill="#ffeb3b" stroke="#f9a825"/>'
    )
    rx = cx + cor_w + 4
    parts.append(
        f'<rect x="{rx}" y="{y0}" width="{rack_w_r}" height="{body_h}" '
        f'fill="#fff" stroke="#ff9800" stroke-width="3"/>'
    )
    if rack_cols_r:
        parts.append(rack_grid(rack_cols_r, rx + 4, y0 + 4))
    fy = y0 + body_h + 4
    parts.append(f'<rect y="{fy}" width="{w}" height="32" fill="#fafafa"/>')
    parts.append(f'<line x1="0" y1="{fy}" x2="{w}" y2="{fy}" stroke="#eee"/>')
    parts.append(
        f'<text x="{w/2}" y="{fy + 20}" text-anchor="middle" class="rodape">'
        f"0/{total} ocup. · 0% · clique p/ 3D</text>"
    )
    parts.append("</g>")
    return "".join(parts), w + 12


def main():
    cards = [
        (11, 148, "A/B", "Congelado", "-20", 15, 15),
        (12, 133, "C/D", "Congelado", "-20", 15, 14),
        (13, 142, "E/F", "Congelado", "-20", 15, 15),
        (21, 28, "G/H", "Refrigerado", "-18", 7, 7),
    ]
    x = 20
    body = []
    total_w = 40
    for cod, total, ruas, tipo, temp, cl, cr in cards:
        s, gw = cam_card(x, cl, cr, cod, total, ruas, tipo, temp)
        body.append(s)
        x += gw
        total_w = x + 20

    legenda_y = 460
    leg_items = [
        ("#90caf9", "Posição livre (vazia)"),
        ("#c62828", "Posição ocupada (palete)"),
        ("#ff9800", "Borda laranja — estrutura do rack"),
        ("#42a5f5", "ENVIO P/ MINAS"),
        ("#ffca28", "RETRABALHO"),
        ("#8d6e63", "DESCARTE"),
        ("#ab47bc", "AVARIA"),
        ("#7e57c2", "REENTREGAS"),
        ("#ffc107", "Entrada da câmara"),
    ]
    leg = ""
    lx = 20
    for c, lbl in leg_items:
        leg += (
            f'<rect x="{lx}" y="{legenda_y}" width="12" height="12" fill="{c}" '
            f'stroke="#f57c00" stroke-width="1"/>'
        )
        leg += f'<text x="{lx + 16}" y="{legenda_y + 10}" class="legenda">{lbl}</text>'
        lx += 138
    leg += (
        f'<text x="20" y="{legenda_y + 28}" class="legenda">'
        "Cada coluna = posição · quadrados 1–5 = níveis (1 embaixo, 5 em cima)</text>"
    )

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} 500" width="{total_w}" height="500">
<style>
.titulo{{font:700 22px Arial,sans-serif;fill:#1565c0}}
.topo{{font:700 11px Arial,sans-serif;fill:#1565c0}}
.cor-meta{{font:600 8px Arial,sans-serif;fill:#212121}}
.cor-num{{font:800 52px Arial,sans-serif;fill:#c62828}}
.cor-tipo{{font:700 11px Arial,sans-serif;fill:#1565c0}}
.cor-temp{{font:800 16px Arial,sans-serif;fill:#c62828}}
.rodape{{font:400 9px Arial,sans-serif;fill:#616161}}
.legenda{{font:400 10px Arial,sans-serif;fill:#424242}}
</style>
<rect width="{total_w}" height="500" fill="#f5f5f5"/>
<text x="{total_w/2}" y="28" text-anchor="middle" class="titulo">Planta 2D – Endereçamento WMS – CD Guarulhos</text>
{"".join(body)}
{leg}
</svg>"""

    out = pathlib.Path(__file__).resolve().parents[1] / "static" / "wms-planta-2d-referencia.svg"
    out.write_text(svg, encoding="utf-8")
    print("Gerado:", out)


if __name__ == "__main__":
    main()
