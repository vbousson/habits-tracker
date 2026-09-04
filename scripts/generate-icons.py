#!/usr/bin/env python3
"""Generate the PWA icon set.

The icons are committed to the repository so that no build step depends on
Python; this script exists so they can be regenerated reproducibly whenever the
brand colour or the mark changes.

    python3 scripts/generate-icons.py

Requires Pillow (`pip install Pillow`). Everything is drawn at 8x and
downsampled with LANCZOS, which is what keeps the 16px and 48px renderings
crisp.

The mark — "l'éclipse": a thick ivory crescent cradling a single amber disc, on
an indigo tile. Read it as the evening and the one point of light you add to it;
the app is a nightly ritual, and the mark is the moment you sit down to it. It
is deliberately abstract, so it does not depend on the product's final name
(see docs/BRANDING.md), and deliberately built from two large shapes only:
anything thinner than about a tenth of the canvas turns to mush in a 16px
favicon. There is no text and no fine detail.

Geometry is expressed in unit coordinates of the *mark box*, which is then
scaled and centred on the canvas — so a single set of numbers drives every
output size. The mark's farthest point from the box centre is 0.57 units
(the far edge of the amber disc), which is what caps the maskable mark ratio:
0.57 * MARK_MASKABLE stays inside the 0.40-radius safe circle.

Outputs (all under public/icons/):
    icon-192.png            192x192  rounded tile, PWA install
    icon-512.png            512x512  same, high resolution
    icon-512-maskable.png   512x512  full-bleed, mark inside the 80% safe circle
    apple-touch-icon.png    180x180  full-bleed (iOS applies its own rounding)
    favicon-32.png           32x32   browser tab
    favicon.ico             16/32/48 multi-resolution
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

# --- Brand -----------------------------------------------------------------
# The tile is the light-theme `--accent` from src/ui/styles.css (#7550d9),
# spread into a shallow vertical gradient so the icon has some depth at 512px
# without introducing any detail that could break at 16px.
TILE_TOP = (127, 92, 224, 255)  # #7f5ce0
TILE_BOTTOM = (88, 54, 192, 255)  # #5836c0
IVORY = (253, 251, 247, 255)  # the crescent — warm white, not pure #fff
AMBER = (242, 179, 74, 255)  # the point of light

SS = 8  # supersampling factor
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"

# --- Mark geometry, in unit coordinates of the mark box --------------------
# The crescent is one disc minus another; the amber disc sits in its mouth.
CRESCENT = (0.50, 0.50, 0.50)  # cx, cy, r  — the ivory disc
CRESCENT_CUT = (0.66, 0.32, 0.42)  # cx, cy, r  — subtracted from it
LIGHT = (0.70, 0.30, 0.28)  # cx, cy, r  — the amber disc

# Side of the mark box as a fraction of the canvas, per output.
MARK_TILE = 0.66  # rounded any-purpose tiles
MARK_MASKABLE = 0.62  # 0.57 * 0.62 = 0.35 < 0.40, safely inside the circle
MARK_APPLE = 0.62  # iOS crops less aggressively than a maskable launcher
MARK_FAVICON = 0.78  # the mark has to survive 16px, so barely any padding

TILE_RADIUS = 0.22  # corner radius of the rounded tile, as a fraction of the side


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    """A one-pixel-wide gradient stretched to `size`: cheap and smooth."""
    strip = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        strip.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4)),
        )
    return strip.resize((size, size), Image.Resampling.NEAREST)


def _disc(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill: tuple) -> None:
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)


def draw_mark(img: Image.Image, offset: float, side: float) -> None:
    """Draw the mark into `img`, its unit box placed at `offset` with `side`."""
    n = img.size[0]

    def pt(u: float, v: float) -> tuple[float, float]:
        return offset + u * side, offset + v * side

    # The amber disc goes down first; the crescent is composited over it, so the
    # two shapes always meet on an exact edge rather than an anti-aliased seam.
    cx, cy = pt(LIGHT[0], LIGHT[1])
    _disc(ImageDraw.Draw(img), cx, cy, LIGHT[2] * side, AMBER)

    # The crescent: an ivory disc with a second disc punched out of it. Punching
    # via an alpha mask (rather than painting the tile colour back on) keeps the
    # mark correct on the transparent corners of a rounded tile.
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    cx, cy = pt(CRESCENT[0], CRESCENT[1])
    _disc(ImageDraw.Draw(layer), cx, cy, CRESCENT[2] * side, IVORY)

    cut = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    cx, cy = pt(CRESCENT_CUT[0], CRESCENT_CUT[1])
    _disc(ImageDraw.Draw(cut), cx, cy, CRESCENT_CUT[2] * side, (0, 0, 0, 255))
    layer.paste((0, 0, 0, 0), (0, 0), cut.split()[3])

    img.alpha_composite(layer)


def render(size: int, *, rounded: bool, mark_ratio: float) -> Image.Image:
    """Render one icon.

    rounded    -- rounded-square tile with transparent corners (any-purpose
                  icons and favicons) versus full-bleed (maskable / iOS, where
                  the platform applies its own mask).
    mark_ratio -- side of the mark box as a fraction of the canvas.
    """
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    tile = vertical_gradient(n, TILE_TOP, TILE_BOTTOM)

    if rounded:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, n - 1, n - 1), radius=round(n * TILE_RADIUS), fill=255
        )
        img.paste(tile, (0, 0), mask)
    else:
        img.paste(tile, (0, 0))

    side = n * mark_ratio
    draw_mark(img, (n - side) / 2, side)

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    written: list[pathlib.Path] = []

    def save(img: Image.Image, name: str) -> None:
        path = OUT / name
        img.save(path)
        written.append(path)

    # Any-purpose icons: rounded tile.
    save(render(192, rounded=True, mark_ratio=MARK_TILE), "icon-192.png")
    save(render(512, rounded=True, mark_ratio=MARK_TILE), "icon-512.png")

    # Maskable: the launcher may crop to a circle of 80% diameter, so the mark
    # must stay well inside that.
    save(render(512, rounded=False, mark_ratio=MARK_MASKABLE), "icon-512-maskable.png")

    # iOS applies its own squircle mask to a full-bleed square.
    save(render(180, rounded=False, mark_ratio=MARK_APPLE), "apple-touch-icon.png")

    # Favicons: less padding, the mark has to survive 16px.
    favicon = render(64, rounded=True, mark_ratio=MARK_FAVICON)
    save(favicon.resize((32, 32), Image.Resampling.LANCZOS), "favicon-32.png")
    favicon.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    written.append(OUT / "favicon.ico")

    for path in written:
        print(f"  {path.relative_to(OUT.parent.parent)}  ({path.stat().st_size} B)")


if __name__ == "__main__":
    main()
