#!/usr/bin/env python3
"""
Generate the PWA app icons for Show mode.

Font-free on purpose: no lettering means no font dependency and nothing to
render differently on another machine. The mark is two fanned cards, which is
legible at 48px on a home screen, which is the only size that actually matters.

Run: python3 scripts/build_icons.py   (cwd = vendor-starter-hub)
"""
from PIL import Image, ImageDraw

ORANGE = (184, 83, 44, 255)     # --color-sticker, light mode
CREAM = (250, 249, 245, 255)    # --color-paper, light mode
INK = (26, 25, 23, 255)         # --color-ink, light mode

SS = 4  # supersample factor; drawn big then downscaled so edges are clean


def card(size, w, h, radius, angle, fill, outline=None):
    """One rounded card, rotated, on its own transparent layer."""
    pad = max(w, h)
    layer = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = layer.size[0] / 2, layer.size[1] / 2
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline,
                        width=max(2, int(size * 0.012)))
    return layer.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))


def build(px, safe=1.0):
    """safe < 1 shrinks the mark so a maskable crop cannot cut it."""
    size = px * SS
    img = Image.new("RGBA", (size, size), ORANGE)

    # Full-bleed background, so the icon still reads when a launcher applies
    # its own mask. The mark itself stays inside the safe circle.
    cw = int(size * 0.30 * safe)
    ch = int(size * 0.42 * safe)
    r = int(cw * 0.14)

    back = card(size, cw, ch, r, 14, CREAM)
    front = card(size, cw, ch, r, -8, CREAM, outline=INK)

    for layer, dx, dy in ((back, -int(size * 0.07), 0), (front, int(size * 0.05), int(size * 0.02))):
        off = layer.size[0] // 2 - size // 2
        img.alpha_composite(layer, dest=(0, 0), source=(off - dx, off - dy, off - dx + size, off - dy + size))

    return img.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    # 192 and 512 are what Android and Chrome ask for; 180 is the iOS
    # apple-touch-icon, which ignores the manifest entirely.
    build(192).save("public/icons/icon-192.png")
    build(512).save("public/icons/icon-512.png")
    build(180).save("public/icons/apple-touch-icon.png")
    # Maskable: content pulled inside the central 80% so a circle crop is safe.
    build(512, safe=0.72).save("public/icons/maskable-512.png")
    print("wrote 4 icons to public/icons/")
