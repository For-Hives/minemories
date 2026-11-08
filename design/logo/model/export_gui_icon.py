#!/usr/bin/env python3
"""The mod's menu icon: the full-colour logo without its tripod, 32 x 32, drawn at 16 x 16.

Reads the canonical SVG, drops the tripod (and the soft glow), renders it with rsvg-convert and
writes assets/minemories/textures/gui/icon.png (with a .mcmeta asking for smooth scaling).
Needs rsvg-convert and Pillow.
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
LOGO = HERE.parent / "minemories-logo.svg"
TEXTURE = HERE.parents[2] / "mod/shared/common/src/main/resources/assets/minemories/textures/gui/icon.png"
DROP = ("Neck", "TripodRing", "Hub", "Leg", "ButtonGlow")
VIEW = (0, 14, 568, 474)
SIZE = 32
RENDER = 256


def main() -> int:
    body = "".join(
        match.group(0)
        for match in re.finditer(r"<path id=\"([^\"]+)\"[^>]*/>", LOGO.read_text())
        if not match.group(1).startswith(DROP)
    )
    x, y, w, h = VIEW
    svg = HERE / "gui-icon.tmp.svg"
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w}" height="{h}">{body}</svg>')
    png = HERE / "gui-icon.tmp.png"
    subprocess.run(["rsvg-convert", "-w", str(RENDER), "-a", "-o", str(png), str(svg)], check=True)
    image = Image.open(png).convert("RGBA")
    svg.unlink()
    png.unlink()
    canvas = Image.new("RGBA", (RENDER, RENDER), (0, 0, 0, 0))
    canvas.alpha_composite(image, (0, (RENDER - image.height) // 2))
    TEXTURE.parent.mkdir(parents=True, exist_ok=True)
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(TEXTURE)
    TEXTURE.with_name(TEXTURE.name + ".mcmeta").write_text('{"texture":{"blur":true}}\n')
    return 0


if __name__ == "__main__":
    sys.exit(main())
