#!/usr/bin/env python3
"""Generate the PWA icon set for habits-tracker.

The icons are committed to the repository so that no build step depends on
Python; this script exists so they can be regenerated reproducibly whenever the
brand colour or the mark changes.

    python3 scripts/generate-icons.py

Requires Pillow (`pip install Pillow`). Everything is drawn at 4x and
downsampled with LANCZOS, which is what keeps the 48px rendering crisp.

The mark: a rounded square in the app's accent blue with a single thick white
check. Deliberately free of fine detail — anything smaller than a few percent of
the canvas turns to mush in a launcher icon.

Outputs (all under public/icons/):
    icon-192.png            192x192  maskable-safe rounded tile, PWA install
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
# Kept in sync with `--accent` in src/ui/styles.css.
ACCENT = (61, 111, 216, 255)  # #3d6fd8
ACCENT_DEEP = (45, 88, 184, 255)  # subtle vertical gradient, bottom stop
WHITE = (255, 255, 255, 255)

SS = 4  # supersampling factor
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"

# Check geometry, expressed in unit coordinates of the *mark* box.
CHECK = ((0.10, 0.52), (0.38, 0.80), (0.90, 0.22))
CHECK_WIDTH = 0.155


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


def draw_check(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    """Thick, round-capped check inside `box` (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    points = [(x0 + px * w, y0 + py * h) for px, py in CHECK]
    width = round(CHECK_WIDTH * w)
    draw.line(points, fill=WHITE, width=width, joint="curve")
    # PIL has no round line caps: stamp a disc at every vertex.
    r = width / 2
    for x, y in points:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)


def render(size: int, *, rounded: bool, mark_ratio: float) -> Image.Image:
    """Render one icon.

    rounded    -- rounded-square tile with transparent corners (any-purpose
                  icons and favicons) versus full-bleed (maskable / iOS, where
                  the platform applies its own mask).
    mark_ratio -- side of the check's bounding box as a fraction of the canvas.
    """
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    tile = vertical_gradient(n, ACCENT, ACCENT_DEEP)

    if rounded:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, n - 1, n - 1), radius=round(n * 0.22), fill=255
        )
        img.paste(tile, (0, 0), mask)
    else:
        img.paste(tile, (0, 0))

    side = n * mark_ratio
    off = (n - side) / 2
    # Optical centring: a check reads low, so lift it a hair.
    draw_check(ImageDraw.Draw(img), (off, off - n * 0.015, off + side, off + side - n * 0.015))

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    written: list[pathlib.Path] = []

    def save(img: Image.Image, name: str) -> None:
        path = OUT / name
        img.save(path)
        written.append(path)

    # Any-purpose icons: rounded tile, generous mark.
    save(render(192, rounded=True, mark_ratio=0.54), "icon-192.png")
    save(render(512, rounded=True, mark_ratio=0.54), "icon-512.png")

    # Maskable: the launcher may crop to a circle of 80% diameter, so the mark
    # must stay well inside that. 0.40 leaves comfortable room on every shape.
    save(render(512, rounded=False, mark_ratio=0.40), "icon-512-maskable.png")

    # iOS applies its own squircle mask to a full-bleed square.
    save(render(180, rounded=False, mark_ratio=0.50), "apple-touch-icon.png")

    # Favicons: less padding, the mark has to survive 16px.
    favicon = render(64, rounded=True, mark_ratio=0.66)
    save(favicon.resize((32, 32), Image.Resampling.LANCZOS), "favicon-32.png")
    favicon.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    written.append(OUT / "favicon.ico")

    for path in written:
        print(f"  {path.relative_to(OUT.parent.parent)}  ({path.stat().st_size} B)")


if __name__ == "__main__":
    main()
