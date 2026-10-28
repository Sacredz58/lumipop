#!/usr/bin/env python3
"""Store covers from the painted orb art: 1920x1080, 800x1200, 800x800 (CrazyGames sizes).

  python3 tools/make_covers.py <hd orb atlas, 320 px cells> <out dir>

The HD atlas is the same cut as vendor/orbs.png but at 320 px (make_orbs.py with CELL = 320).
The top-left corner stays calm: storefronts put their labels there.
"""
import base64, math, os, random, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
atlas = 'data:image/png;base64,' + base64.b64encode(open(ATLAS, 'rb').read()).decode()
font = 'data:font/woff;base64,' + base64.b64encode(open(os.path.join(ROOT, 'vendor', 'lumi.woff'), 'rb').read()).decode()
GLOW = ['#ff5a8a', '#ffb02e', '#3ee0a0', '#4cc8ff', '#a070ff', '#ff6ad5', '#ffffff', '#ffe38a', '#888', '#ff4d6d', '#ffd36b', '#ff7a2e', '#7fe0ff']


def orb(code, x, y, d, glow=0.55, rot=0, op=1.0, blur=0):
    col, row = code % 4, code // 4
    s = d / 320
    g = GLOW[code]
    return (f'<div class="o" style="left:{x - d / 2:.1f}px;top:{y - d / 2:.1f}px;width:{d:.1f}px;height:{d:.1f}px;'
            f'background-size:{1280 * s:.1f}px {1280 * s:.1f}px;background-position:-{col * 320 * s:.1f}px -{row * 320 * s:.1f}px;'
            f'filter:drop-shadow(0 0 {d * 0.16:.0f}px {g}{int(glow * 255):02x}){" blur(%.1fpx)" % blur if blur else ""};'
            f'transform:rotate({rot}deg);opacity:{op}"></div>')


def cover(W, H, seed):
    R = random.Random(seed)
    k = min(W, H)
    html = []
    # --- stars
    for _ in range(int(W * H / 5000)):
        x, y, r = R.random() * W, R.random() * H, R.random() * 1.6 + 0.4
        html.append(f'<i class="s" style="left:{x:.0f}px;top:{y:.0f}px;width:{r * 2:.1f}px;height:{r * 2:.1f}px;opacity:{R.random() * 0.6 + 0.2:.2f}"></i>')
    # --- hanging cluster (hex grid), kept out of the top-left label zone
    D = k * (0.135 if W > H else 0.16)
    rows = 3 if W == H else 4
    cols = int(W / D) + 2
    pal = [0, 1, 2, 3, 4, 5]
    hole = (W * 0.5, D * 0.5 + (rows - 1) * D * 0.866)          # where the shot pops a group
    for r in range(rows):
        for c in range(cols):
            x = -D * 0.25 + c * D + (r % 2) * D / 2
            y = D * 0.42 + r * D * 0.866
            if x < W * 0.4 and y < H * (0.2 if W > H else 0.12 if H > W else 0.18) + D * 0.3: continue   # label zone
            depth = (rows - r) / rows
            if r == rows - 1 and R.random() < 0.45: continue
            if math.hypot(x - hole[0], y - hole[1]) < D * 1.05: continue
            code = R.choice(pal)
            if R.random() < 0.07: code = R.choice([6, 10, 9, 7])
            html.append(orb(code, x, y, D, 0.45 + 0.2 * depth))
    # --- burst where the group popped
    bx, by = hole
    html.append(f'<div class="burst" style="left:{bx - D * 1.6:.0f}px;top:{by - D * 1.6:.0f}px;width:{D * 3.2:.0f}px;height:{D * 3.2:.0f}px"></div>')
    for i in range(16):
        a = i / 16 * math.tau + R.random() * 0.3
        rr = D * (0.7 + R.random() * 0.9)
        sz = D * (0.05 + R.random() * 0.06)
        html.append(f'<i class="sp" style="left:{bx + math.cos(a) * rr - sz / 2:.0f}px;top:{by + math.sin(a) * rr - sz / 2:.0f}px;width:{sz:.0f}px;height:{sz:.0f}px"></i>')
    # popping trio (scaled up, fading) and dropped orbs falling to the sides
    for i, (dx, dy) in enumerate([(-0.55, -0.2), (0.5, -0.35), (0.05, 0.45)]):
        html.append(orb(3, bx + dx * D, by + dy * D, D * 1.12, 0.9, op=0.55))
    # --- title (two lines on a tall cover)
    tall = H > W * 1.2
    ts = k * (0.25 if W > H else 0.3 if tall else 0.2)
    ty = H * (0.6 if W > H else 0.57 if tall else 0.6)
    words = '<span>Lumi</span><br><b>Pop</b>' if tall else '<span>Lumi</span> <b>Pop</b>'
    html.append(f'<div class="t" style="top:{ty - ts * (1.05 if tall else 0.62):.0f}px;font-size:{ts:.0f}px;line-height:{0.95 if tall else 1}">{words}</div>')
    tbox = (ty - ts * (1.1 if tall else 0.65), ty + ts * (0.95 if tall else 0.45))
    falls = [(0.08, 0.84), (0.2, 0.93), (0.8, 0.9), (0.93, 0.8)] if W > H else [(0.12, 0.86), (0.88, 0.9)] if tall else [(0.1, 0.88), (0.9, 0.86)]
    for fx, fy in falls:
        html.append(orb(R.choice(pal), fx * W, fy * H, D * 0.85, 0.7, rot=R.randint(-30, 30), op=0.9, blur=1.2))
    # --- shooter with aim dots
    sd = D * 1.25
    sx, sy = W * 0.5, H - sd * 0.75
    n = 9
    for i in range(1, n):
        t = i / n
        y = sy - sd * 0.6 - t * (sy - sd * 0.6 - by - D * 0.6)
        if tbox[0] < y < tbox[1]: continue
        html.append(f'<i class="d" style="left:{sx - 6:.0f}px;top:{y:.0f}px;opacity:{0.95 - t * 0.5:.2f}"></i>')
    html.append(f'<div class="ring" style="left:{sx - sd * 0.85:.0f}px;top:{sy - sd * 0.85:.0f}px;width:{sd * 1.7:.0f}px;height:{sd * 1.7:.0f}px"></div>')
    html.append(orb(3, sx, sy, sd, 0.95))
    html.append(orb(6, sx + sd * 1.15, sy + sd * 0.2, sd * 0.62, 0.7))
    body = '\n'.join(html)
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Lumi;src:url({font}) format("woff");font-weight:800}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{position:relative;background:
  radial-gradient(ellipse at 50% {int(hole[1] / H * 100)}%, rgba(120,80,255,.45), transparent 45%),
  radial-gradient(ellipse at 15% 85%, rgba(255,80,170,.28), transparent 45%),
  radial-gradient(ellipse at 90% 70%, rgba(60,200,255,.22), transparent 45%),
  linear-gradient(180deg,#0a0b24 0%,#1d1250 50%,#3a1868 100%)}}
.o{{position:absolute;background-image:url({atlas});background-repeat:no-repeat}}
.s{{position:absolute;border-radius:50%;background:#fff}}
.sp{{position:absolute;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #9ff}}
.burst{{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95) 0,rgba(140,230,255,.6) 18%,rgba(120,120,255,.18) 45%,transparent 70%)}}
.d{{position:absolute;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 14px 4px #7fd8ff}}
.ring{{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(120,200,255,.35),transparent 65%)}}
.t{{position:absolute;left:0;right:0;text-align:center;font-family:Lumi;font-weight:800;letter-spacing:-.03em;line-height:1;white-space:nowrap}}
.t span{{color:#fff;text-shadow:0 0 .12em #b7a2ff,0 .04em .0em #5a2fd0,0 .08em .2em rgba(20,0,60,.8)}}
.t b{{background:linear-gradient(180deg,#fff3c4 10%,#ffcc4d 45%,#ff7a59 95%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 .04em 0 #b8421f) drop-shadow(0 0 .14em rgba(255,170,80,.7))}}
</style></head><body>{body}</body></html>'''


with sync_playwright() as p:
    b = p.chromium.launch()
    # the 1080x1620 one is the opening frame of the portrait preview video (same art as the 800x1200 cover)
    for W, H, name, seed, dpr in [(1920, 1080, 'cover-landscape-1920x1080', 3, 1), (800, 1200, 'cover-portrait-800x1200', 5, 1),
                                  (800, 800, 'cover-square-800x800', 8, 1), (800, 1200, 'video-start-1080x1620', 5, 1.35)]:
        pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=dpr)
        pg.set_content(cover(W, H, seed)); pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(OUT, name + '.png'))
        pg.close(); print(name)
    b.close()
