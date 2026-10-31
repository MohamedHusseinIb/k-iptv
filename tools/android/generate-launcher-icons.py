"""Regenerates the Android launcher icons.

The icon is a flat-screen TV carrying a play glyph, which reads as "IPTV" at
launcher size far better than a bare play triangle does.

Every raster is drawn on a supersampled canvas and reduced with LANCZOS, so
the 48 px mdpi icon stays clean. Run from the repo root:

    python tools/android/generate-launcher-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parents[2] / "android/app/src/main/res"

# Legacy icon edge length per density bucket. The adaptive foreground is the
# 108 dp canvas for the same bucket, hence the separate table.
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

SUPERSAMPLE = 4

GRADIENT_TOP = (59, 130, 246)
GRADIENT_BOTTOM = (124, 58, 237)
BEZEL = (255, 255, 255, 255)
SCREEN = (17, 24, 39, 255)
GLYPH = (255, 255, 255, 255)

# Fraction of the canvas taken by the TV. The adaptive foreground must keep
# its content inside the centre 66 of 108 dp, so it uses the smaller value.
TV_WIDTH_FULL_BLEED = 0.62
TV_WIDTH_ROUND = 0.56
TV_WIDTH_ADAPTIVE = 0.46


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / max(size - 1, 1)
        draw.line(
            [(0, y), (size, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)),
        )
    return image


def draw_tv(
    draw: ImageDraw.ImageDraw, size: int, width: float, monochrome: bool
) -> None:
    """Draws the TV centred on a square canvas of `size`."""
    w = size * width
    bezel_h = w * 0.68
    neck_h = w * 0.075
    base_h = w * 0.055
    total_h = bezel_h + neck_h + base_h

    cx = size / 2
    top = (size - total_h) / 2

    draw.rounded_rectangle(
        [cx - w / 2, top, cx + w / 2, top + bezel_h],
        radius=w * 0.10,
        fill=BEZEL,
    )

    inset = w * 0.065
    screen = [
        cx - w / 2 + inset,
        top + inset,
        cx + w / 2 - inset,
        top + bezel_h - inset,
    ]
    # Punching the screen out keeps the single-colour themed icon readable as
    # a TV rather than a solid slab.
    draw.rounded_rectangle(
        screen,
        radius=w * 0.055,
        fill=(0, 0, 0, 0) if monochrome else SCREEN,
    )

    # Play glyph, optically centred: a triangle's visual centre sits left of
    # its bounding box, so the box is nudged right.
    glyph_h = (screen[3] - screen[1]) * 0.46
    glyph_w = glyph_h * 0.88
    gx = cx - glyph_w * 0.40
    gy = (screen[1] + screen[3]) / 2
    draw.polygon(
        [
            (gx, gy - glyph_h / 2),
            (gx, gy + glyph_h / 2),
            (gx + glyph_w, gy),
        ],
        fill=GLYPH,
    )

    neck_w = w * 0.11
    draw.rectangle(
        [cx - neck_w / 2, top + bezel_h, cx + neck_w / 2, top + bezel_h + neck_h],
        fill=BEZEL,
    )

    base_w = w * 0.44
    draw.rounded_rectangle(
        [cx - base_w / 2, top + bezel_h + neck_h, cx + base_w / 2, top + total_h],
        radius=base_h / 2,
        fill=BEZEL,
    )


def render(size: int, mode: str) -> Image.Image:
    s = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    if mode in ("legacy", "round"):
        background = vertical_gradient(s, GRADIENT_TOP, GRADIENT_BOTTOM)
        mask = Image.new("L", (s, s), 0)
        mask_draw = ImageDraw.Draw(mask)
        if mode == "legacy":
            mask_draw.rounded_rectangle(
                [0, 0, s - 1, s - 1], radius=s * 0.22, fill=255
            )
        else:
            mask_draw.ellipse([0, 0, s - 1, s - 1], fill=255)
        canvas.paste(background.convert("RGBA"), (0, 0), mask)

    width = {"legacy": TV_WIDTH_FULL_BLEED, "round": TV_WIDTH_ROUND}.get(
        mode, TV_WIDTH_ADAPTIVE
    )

    draw_tv(ImageDraw.Draw(canvas), s, width, monochrome=(mode == "monochrome"))

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    written = 0
    for bucket, size in LEGACY_SIZES.items():
        directory = RES / f"mipmap-{bucket}"
        directory.mkdir(parents=True, exist_ok=True)
        render(size, "legacy").save(directory / "ic_launcher.png")
        render(size, "round").save(directory / "ic_launcher_round.png")
        written += 2

    for bucket, size in FOREGROUND_SIZES.items():
        directory = RES / f"mipmap-{bucket}"
        render(size, "foreground").save(directory / "ic_launcher_foreground.png")
        render(size, "monochrome").save(directory / "ic_launcher_monochrome.png")
        written += 2

    print(f"wrote {written} icons under {RES}")


if __name__ == "__main__":
    main()
