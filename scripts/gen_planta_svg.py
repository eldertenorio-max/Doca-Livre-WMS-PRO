#!/usr/bin/env python3
"""Gera SVG de referência da planta 2D WMS."""
import pathlib

LEVELS = 5
GAP = 2
COR_W = 108
TOP_H = 34
FOOT_H = 32
PAD = 4


def col_w(cell):
    return cell + GAP


def rack_w(cols, cell):
    return cols * col_w(cell) + 8 if cols else 0


def rack_grid(cols, cell, ox, oy, levels):
    parts = []
    cw = col_w(cell)
    for c in range(cols):
        for lv in range(levels):
            n = levels - lv
            x = ox + c * cw
            y = oy + lv * (cell + GAP)
            fill = "#90caf9" if n == 1 else "#0d47a1"
            parts.append(
                f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" '
                f'fill="{fill}" stroke="#ff9800" stroke-width="2"/>'
            )
        px = ox + c * cw + cell / 2
        py = oy + levels * (cell + GAP) + 2
        parts.append(
            f'<text x="{px}" y="{py + 8}" text-anchor="middle" class="col-pos">{c + 1}</text>'
        )
    return "".join(parts)


def cam_card(x, rack_cols_l, rack_cols_r, cod, total, ruas, tipo, temp, cell, levels, nivel_label):
    rw_l = rack_w(rack_cols_l, cell)
    rw_r = rack_w(rack_cols_r, cell)
    body_h = levels * (cell + GAP) + 22
    w = rw_l + COR_W + rw_r + PAD * 4
    card_h = TOP_H + body_h + FOOT_H
    parts = [f'<g transform="translate({x},56)">']
    parts.append(
        f'<rect width="{w}" height="{card_h}" fill="#fff" stroke="#ff9800" stroke-width="2"/>'
    )
    parts.append(
        f'<rect width="{w}" height="{TOP_H}" fill="#fff"/>'
    )
    parts.append(
        f'<text x="{w/2}" y="{TOP_H - 12}" text-anchor="middle" class="topo">'
        f"{total} Posições · níveis {nivel_label}</text>"
    )
    parts.append(f'<line x1="0" y1="{TOP_H}" x2="{w}" y2="{TOP_H}" stroke="#ffe0b2"/>')

    y0 = TOP_H + PAD
    lx = PAD
    parts.append(
        f'<rect x="{lx}" y="{y0}" width="{rw_l}" height="{body_h}" '
        f'fill="#fff" stroke="#ff9800" stroke-width="3"/>'
    )
    if rack_cols_l:
        parts.append(rack_grid(rack_cols_l, cell, lx + 4, y0 + 4, levels))

    cx = lx + rw_l + PAD
    cx_mid = cx + COR_W / 2
    parts.append(f'<rect x="{cx}" y="{y0}" width="{COR_W}" height="{body_h}" fill="#fff"/>')
    parts.append(
        f'<line x1="{cx}" y1="{y0}" x2="{cx + COR_W}" y2="{y0}" stroke="#ff9800" stroke-width="3"/>'
    )
    parts.append(
        f'<line x1="{cx}" y1="{y0 + body_h}" x2="{cx + COR_W}" y2="{y0 + body_h}" '
        f'stroke="#ff9800" stroke-width="3"/>'
    )
    parts.append(
        f'<text x="{cx_mid}" y="{y0 + 18}" text-anchor="middle" class="cor-meta">CÂMARA FRIA</text>'
    )
    parts.append(
        f'<text x="{cx_mid}" y="{y0 + 32}" text-anchor="middle" class="cor-meta">ruas {ruas}</text>'
    )
    num_y = y0 + body_h * 0.46
    parts.append(
        f'<text x="{cx_mid}" y="{num_y}" text-anchor="middle" class="cor-num">{cod}</text>'
    )
    tipo_y = y0 + body_h * 0.66
    parts.append(
        f'<text x="{cx_mid}" y="{tipo_y}" text-anchor="middle" class="cor-tipo" '
        f'transform="rotate(-90 {cx_mid} {tipo_y})">{tipo}</text>'
    )
    if temp:
        temp_y = y0 + body_h * 0.82
        parts.append(
            f'<text x="{cx_mid}" y="{temp_y}" text-anchor="middle" class="cor-temp">{temp}</text>'
        )
    parts.append(
        f'<rect x="{cx_mid - 22}" y="{y0 + body_h - 18}" width="44" height="14" '
        f'rx="1" fill="#ffeb3b" stroke="#f9a825" stroke-width="1"/>'
    )

    rx = cx + COR_W + PAD
    parts.append(
        f'<rect x="{rx}" y="{y0}" width="{rw_r}" height="{body_h}" '
        f'fill="#fff" stroke="#ff9800" stroke-width="3"/>'
    )
    if rack_cols_r:
        parts.append(rack_grid(rack_cols_r, cell, rx + 4, y0 + 4, levels))

    fy = TOP_H + body_h + PAD
    parts.append(f'<rect y="{fy}" width="{w}" height="{FOOT_H}" fill="#fafafa"/>')
    parts.append(f'<line x1="0" y1="{fy}" x2="{w}" y2="{fy}" stroke="#eee"/>')
    parts.append(
        f'<text x="{w/2}" y="{fy + 20}" text-anchor="middle" class="rodape">'
        f"0/{total} ocup. · 0% · clique p/ 3D</text>"
    )
    parts.append("</g>")
    return "".join(parts), w + 10


def legend_bar(total_w, card_bottom):
    leg_y = card_bottom + 20
    bar_h = 38
    items = [
        ("#90caf9", "Posição livre (vazia)"),
        ("#c62828", "Posição ocupada (palete)"),
        ("#ff9800", "Borda laranja — estrutura do rack"),
        ("#42a5f5", "ENVIO P/ MINAS"),
        ("#ffca28", "RETRABALHO"),
        ("#8d6e63", "DESCARTE"),
        ("#ab47bc", "AVARIA"),
        ("#7e57c2", "REENTREGAS"),
        ("#ffc107", "Entrada da câmara"),
        ("", "Cada coluna = posição · quadrados 1–5 = níveis (1 embaixo, 5 em cima)"),
    ]
    parts = [
        f'<rect x="12" y="{leg_y}" width="{total_w - 24}" height="{bar_h}" '
        f'fill="#fff" stroke="#e0e0e0" rx="4"/>'
    ]
    slots = [18, 148, 278, 388, 488, 578, 648, 728, 818, 918]
    for i, (color, lbl) in enumerate(items):
        lx = slots[i] if i < len(slots) else 18 + i * 100
        if color:
            parts.append(
                f'<rect x="{lx}" y="{leg_y + 13}" width="12" height="12" fill="{color}" '
                f'stroke="#f57c00" stroke-width="1"/>'
            )
            parts.append(f'<text x="{lx + 16}" y="{leg_y + 23}" class="legenda">{lbl}</text>')
        else:
            parts.append(f'<text x="{lx}" y="{leg_y + 23}" class="legenda">{lbl}</text>')
    return "".join(parts), leg_y + bar_h + 10


def main():
    cards = [
        (11, 148, "A/B", "Congelado", "−20", 15, 15, 11, 5, "1–5"),
        (12, 133, "C/D", "Congelado", "−20", 15, 14, 11, 5, "1–5"),
        (13, 142, "E/F", "Congelado", "−20", 15, 15, 11, 5, "1–5"),
        (21, 28, "G/H", "Refrigerado", "−18", 7, 7, 10, 2, "1–2"),
    ]
    x = 16
    body = []
    max_bottom = 0
    for cod, total, ruas, tipo, temp, cl, cr, cell, levels, nivel_label in cards:
        s, gw = cam_card(x, cl, cr, cod, total, ruas, tipo, temp, cell, levels, nivel_label)
        body.append(s)
        card_h = TOP_H + levels * (cell + GAP) + 22 + FOOT_H + PAD
        max_bottom = max(max_bottom, 56 + card_h)
        x += gw

    total_w = x + 16
    leg, svg_h = legend_bar(total_w, max_bottom)

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {svg_h}" width="{total_w}" height="{svg_h}">
<style>
.titulo{{font:700 22px Arial,sans-serif;fill:#1565c0}}
.topo{{font:700 11px Arial,sans-serif;fill:#1565c0}}
.cor-meta{{font:600 8px Arial,sans-serif;fill:#212121}}
.cor-num{{font:800 56px Arial,sans-serif;fill:#c62828}}
.cor-tipo{{font:700 14px Arial,sans-serif;fill:#1565c0}}
.cor-temp{{font:800 22px Arial,sans-serif;fill:#c62828}}
.rodape{{font:400 9px Arial,sans-serif;fill:#616161}}
.legenda{{font:400 9px Arial,sans-serif;fill:#424242}}
.col-pos{{font:700 7px Arial,sans-serif;fill:#546e7a}}
</style>
<rect width="{total_w}" height="{svg_h}" fill="#f5f5f5"/>
<text x="{total_w/2}" y="28" text-anchor="middle" class="titulo">Planta 2D – Endereçamento WMS – CD Guarulhos</text>
{"".join(body)}
{leg}
</svg>"""

    out = pathlib.Path(__file__).resolve().parents[1] / "static" / "wms-planta-2d-referencia.svg"
    out.write_text(svg, encoding="utf-8")
    w11 = rack_w(15, 11) * 2 + COR_W + PAD * 4
    w21 = rack_w(7, 10) * 2 + COR_W + PAD * 4
    print(f"Gerado: {out}")
    print(f"Ratio cam21/cam11: {w21/w11:.1%} (meta ~40%)")


if __name__ == "__main__":
    main()
