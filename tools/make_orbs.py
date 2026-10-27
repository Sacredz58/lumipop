#!/usr/bin/env python3
"""Cut the orb sprite sheet into a 4x4 atlas of 128 px cells (vendor/orbs.png).

  python3 tools/make_orbs.py tools/orbs-sheet.png

Sheet order (row by row): coral, amber, mint, ice-blue, amethyst, fuchsia, rainbow, supernova,
stone, bomb, star, fire, lightning, ice shell. Atlas cells use the game's orb codes:
0-5 colours, 6 rainbow, 7 supernova, 8 stone, 9 bomb, 10 star, 11 fire, 12 lightning, 13 ice shell.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL, OUT = 128, os.path.join(ROOT, 'vendor', 'orbs.png')

src = Image.open(sys.argv[1]).convert('RGB')
a = np.asarray(src).astype(np.float32)
lum = a.max(2)
mask = ndimage.binary_fill_holes(ndimage.binary_opening(lum > 40, iterations=3))
lab, _ = ndimage.label(mask)
boxes = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    if (y1 - y0) * (x1 - x0) < 20000: continue
    if (x1 - x0) > 1.6 * (y1 - y0):                      # two glows touching: split in half
        m = (x0 + x1) // 2
        boxes += [(y0, y1, x0, m), (y0, y1, m, x1)]
    else:
        boxes.append((y0, y1, x0, x1))
boxes.sort(key=lambda b: (round(b[0] / 150), b[2]))
assert len(boxes) == 14, f'expected 14 orbs, found {len(boxes)}'

def fit(b):
    """Centre from the box (width wins: the bomb fuse sticks out on top), then the glass edge
    = the steepest drop of mean brightness along the radius."""
    y0, y1, x0, x1 = b
    w = x1 - x0; cx = (x0 + x1) / 2; r0 = w / 2
    cy = y1 - r0 if (y1 - y0) > w * 1.04 else (y0 + y1) / 2
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    rr = np.hypot(xx - cx, yy - cy)
    radii = np.arange(int(r0 * 0.8), int(r0 * 1.02))
    prof = np.array([lum[(rr >= r) & (rr < r + 1)].mean() for r in radii])
    edge = radii[np.argmin(np.gradient(prof))]
    return cx, cy, float(edge)

atlas = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
for code, b in enumerate(boxes):
    cx, cy, r = fit(b)
    r *= 1.01
    box = (int(round(cx - r)), int(round(cy - r)), int(round(cx + r)), int(round(cy + r)))
    crop = src.crop(box).resize((CELL, CELL), Image.LANCZOS).convert('RGBA')
    S = CELL * 4                                             # antialiased circular mask
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse((4, 4, S - 4, S - 4), fill=255)
    m = m.resize((CELL, CELL), Image.LANCZOS)
    px = np.asarray(crop).copy()
    alpha = np.asarray(m).astype(np.float32)
    if code == 13:                                           # ice shell: brightness becomes opacity
        rgb = px[..., :3].astype(np.float32)
        l = rgb.max(2)
        alpha = alpha * np.clip((l - 30) / 170, 0, 1) * 0.95
        px[..., :3] = np.clip(rgb * 255 / np.maximum(l[..., None], 1), 0, 255)
    px[..., 3] = alpha.astype(np.uint8)
    cell = Image.fromarray(px)
    atlas.paste(cell, ((code % 4) * CELL, (code // 4) * CELL))
    print(f'code {code:2d}: centre ({cx:.0f},{cy:.0f}) radius {r:.1f}')
atlas.save(OUT, optimize=True)
print('atlas', OUT, os.path.getsize(OUT) // 1024, 'KB')
