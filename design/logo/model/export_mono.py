#!/usr/bin/env python3
"""Monochrome Minemories logo: the canonical SVG, camera only (no tripod), in black and white.

Positive (white) for the solid camera faces, negative (see-through) for the lens glass, the dark
ring behind it and the button, so the icon keeps the camera's depth in one colour. Writes
minemories-logo-mono.svg and a white-on-transparent minemories-logo-mono.png next to the logo.
(The mod itself uses the hand-drawn 16 x 16 icon from export_pixel_icon.py: line art does not survive 16 px.)

Needs rsvg-convert and Pillow. Run from anywhere: python3 model/export_mono.py
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
LOGO = HERE.parent / "minemories-logo.svg"
OUT = HERE.parent

DROP = ("Neck", "TripodRing", "Hub", "Leg", "ButtonGlow")
# path id -> True (white / positive) or False (black / negative); anything else follows its default.
NEGATIVE = {
    "Lens-5", "Lens-6",
    "Lens-7", "Lens-8", "Lens-9", "Lens-11", "Lens-14", "Lens-15", "Lens-16", "Lens-17",
    "Button", "Button-2",
}
VIEW = (0, 14, 568, 474)  # x, y, width, height of the camera without its tripod
STROKE = 5


def mono_svg() -> str:
    paths = []
    for match in re.finditer(r'<path id="([^"]+)" d="([^"]+)"', LOGO.read_text()):
        name, d = match.groups()
        if name.startswith(DROP):
            continue
        fill = "#000" if name in NEGATIVE else "#fff"
        paths.append(
            f'<path d="{d}" fill="{fill}" stroke="#000" stroke-width="{STROKE}" stroke-linejoin="round"/>'
        )
    x, y, w, h = VIEW
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w}" height="{h}">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000"/>' + "".join(paths) + "</svg>"
    )


def raster(svg: Path, size: int) -> Image.Image:
    """White on transparent, centred in a square: the brightness of the drawing becomes opacity."""
    png = svg.with_suffix(".tmp.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-a", "-o", str(png), str(svg)], check=True)
    grey = Image.open(png).convert("L")
    png.unlink()
    image = Image.new("RGBA", grey.size, (255, 255, 255, 0))
    image.putalpha(grey)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def main() -> int:
    svg = OUT / "minemories-logo-mono.svg"
    svg.write_text(mono_svg())
    raster(svg, 512).save(OUT / "minemories-logo-mono.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
