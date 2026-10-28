#!/usr/bin/env python3
"""Cut the three skin sheets (6 orbs each, 3x2) into vendor/skins.png:
row 0 candy, row 1 gems, row 2 planets; column = colour index 0-5.

  python3 tools/make_skins.py tools/skin-candy.png tools/skin-gems.png tools/skin-planets.png
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL, OUT = 128, os.path.join(ROOT, 'vendor', 'skins.png')
rng = np.random.default_rng(7)


def circle_ransac(pts):
    """Robust circle through edge points: a planet ring or a fuse are outliers."""
    best, bi = None, -1
    for _ in range(600):
        p = pts[rng.choice(len(pts), 3, replace=False)]
        (x1, y1), (x2, y2), (x3, y3) = p
        d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
        if abs(d) < 1e-6: continue
        ux = ((x1**2 + y1**2) * (y2 - y3) + (x2**2 + y2**2) * (y3 - y1) + (x3**2 + y3**2) * (y1 - y2)) / d
        uy = ((x1**2 + y1**2) * (x3 - x2) + (x2**2 + y2**2) * (x1 - x3) + (x3**2 + y3**2) * (x2 - x1)) / d
        r = np.hypot(x1 - ux, y1 - uy)
        inl = np.abs(np.hypot(pts[:, 0] - ux, pts[:, 1] - uy) - r) < 2.5
        if inl.sum() > bi: bi, best = inl.sum(), (ux, uy, r, inl)
    ux, uy, r, inl = best
    q = pts[inl]                                   # least-squares refine on inliers
    A = np.c_[2 * q[:, 0], 2 * q[:, 1], np.ones(len(q))]
    b = (q ** 2).sum(1)
    cx, cy, c = np.linalg.lstsq(A, b, rcond=None)[0]
    return cx, cy, np.sqrt(c + cx**2 + cy**2)


def orbs_in(path):
    src = Image.open(path).convert('RGB'); a = np.asarray(src).astype(np.float32); lum = a.max(2)
    mask = ndimage.binary_fill_holes(ndimage.binary_opening(lum > 40, iterations=3))
    lab, _ = ndimage.label(mask)
    found = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) < 20000: continue
        m = lab[sl] == i
        edge = m & ~ndimage.binary_erosion(m)
        ys, xs = np.nonzero(edge)
        cx, cy, r = circle_ransac(np.c_[xs + sl[1].start, ys + sl[0].start].astype(float))
        # tighten to the glass: steepest brightness drop just inside the glow edge
        yy, xx = np.mgrid[int(cy - r) - 2:int(cy + r) + 3, int(cx - r) - 2:int(cx + r) + 3]
        rr = np.hypot(xx - cx, yy - cy); sub = lum[yy.clip(0, lum.shape[0] - 1), xx.clip(0, lum.shape[1] - 1)]
        radii = np.arange(int(r * 0.85), int(r * 1.01))
        prof = np.array([sub[(rr >= q) & (rr < q + 1)].mean() for q in radii])
        found.append((cx, cy, float(radii[np.argmin(np.gradient(prof))]) * 1.01))
    found.sort(key=lambda o: (round(o[1] / 200), o[0]))
    assert len(found) == 6, f'{path}: expected 6 orbs, found {len(found)}'
    return src, found


atlas = Image.new('RGBA', (CELL * 6, CELL * 3), (0, 0, 0, 0))
S = CELL * 4
mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).ellipse((4, 4, S - 4, S - 4), fill=255)
mask = mask.resize((CELL, CELL), Image.LANCZOS)
for row, path in enumerate(sys.argv[1:4]):
    src, orbs = orbs_in(path)
    for col, (cx, cy, r) in enumerate(orbs):
        cell = src.crop((int(round(cx - r)), int(round(cy - r)), int(round(cx + r)), int(round(cy + r)))).resize((CELL, CELL), Image.LANCZOS).convert('RGBA')
        cell.putalpha(mask)
        atlas.paste(cell, (col * CELL, row * CELL))
        print(f'{os.path.basename(path)} #{col}: centre ({cx:.0f},{cy:.0f}) r {r:.1f}')
atlas.save(OUT, optimize=True)
print('atlas', OUT, os.path.getsize(OUT) // 1024, 'KB')
