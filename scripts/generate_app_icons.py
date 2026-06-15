"""Gera PNGs do ícone do app (PWA / tela inicial / barra de tarefas)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'static' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

BG = '#f0f2f5'
BLUE = '#0ea5e9'


def draw_icon(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = int(size * 0.1875)
    box = size - pad * 2
    radius = int(size * 0.137)
    d.rounded_rectangle([pad, pad, pad + box, pad + box], radius=radius, fill=BLUE)

    def sx(v):
        return int(pad + box * v)

    line_w = max(3, int(size * 0.039))
    # linhas de movimento
    for y_ratio, x_len in ((0.44, 0.44), (0.31, 0.31), (0.57, 0.38)):
        y = sx(y_ratio)
        x0 = sx(0.25)
        x1 = sx(0.25 + x_len)
        d.line([(x0, y), (x1, y)], fill='#ffffff', width=line_w)

    # caixa
    bx0, by0 = sx(0.47), sx(0.30)
    bx1, by1 = sx(0.74), sx(0.53)
    br = max(2, int(size * 0.029))
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=br, outline='#ffffff', width=max(2, int(size * 0.029)))

    return img


def main():
    sizes = {
        'favicon-32x32.png': 32,
        'apple-touch-icon.png': 180,
        'icon-192.png': 192,
        'icon-512.png': 512,
    }
    for name, sz in sizes.items():
        draw_icon(sz).save(OUT / name, format='PNG', optimize=True)
        print('ok', name)

    # favicon.ico multi-size
    ico_sizes = [16, 32, 48]
    ico_imgs = [draw_icon(s) for s in ico_sizes]
    ico_imgs[0].save(
        OUT / 'favicon.ico',
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_imgs[1:],
    )
    print('ok favicon.ico')


if __name__ == '__main__':
    main()
