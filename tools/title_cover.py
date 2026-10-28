#!/usr/bin/env python3
"""Put the "Lumi Pop" title (game font) over a generated cover illustration.

  python3 tools/title_cover.py <art.png> <out.png> <W> <H> <title centre y, 0..1> [two-line]

The art is cropped to the W:H ratio (`--x` / `--y` 0..1 slide the crop) and scaled; `--tx` moves the title sideways.
"""
import base64, os, sys, argparse
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('art'); ap.add_argument('out'); ap.add_argument('W', type=int); ap.add_argument('H', type=int); ap.add_argument('ty', type=float)
ap.add_argument('--two', action='store_true'); ap.add_argument('--x', type=float, default=0.5); ap.add_argument('--size', type=float, default=0.2)
ap.add_argument('--y', type=float, default=0.0); ap.add_argument('--tx', type=float, default=0.5)
ap.add_argument('--main', default=''); ap.add_argument('--sub', default=''); ap.add_argument('--notitle', action='store_true')
a = ap.parse_args()

im = Image.open(a.art).convert('RGB')
w, h = im.size
if w / h > a.W / a.H:
    cw = round(h * a.W / a.H); x0 = round((w - cw) * a.x); box = (x0, 0, x0 + cw, h)
else:
    ch = round(w * a.H / a.W); y0 = round((h - ch) * a.y); box = (0, y0, w, y0 + ch)
crop = im.crop(box).resize((a.W, a.H), Image.LANCZOS)
tmp = a.out + '.bg.png'; crop.save(tmp)
bg = 'data:image/png;base64,' + base64.b64encode(open(tmp, 'rb').read()).decode()
font = 'data:font/woff;base64,' + base64.b64encode(open(os.path.join(ROOT, 'vendor', 'lumi.woff'), 'rb').read()).decode()
k = min(a.W, a.H); ts = k * a.size
words = '<span>Lumi</span><br><b>Pop</b>' if a.two else '<span>Lumi</span> <b>Pop</b>'
if a.main:   # a localised name: big white word, smaller gold subtitle under it
    words = f'<span>{a.main}</span>' + (f'<b class="sub">{a.sub}</b>' if a.sub else '')
if a.notitle: words = ''
html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Lumi;src:url({font}) format("woff");font-weight:800}}
html,body{{margin:0;width:{a.W}px;height:{a.H}px;overflow:hidden;background:#0a0b24 url({bg}) 0 0/100% 100%}}
.t{{position:absolute;left:{a.tx * a.W}px;top:{a.ty * a.H}px;transform:translate(-50%,-50%);text-align:center;font-family:Lumi;font-weight:800;
  font-size:{ts:.0f}px;letter-spacing:-.03em;line-height:.95;white-space:nowrap}}
.t span{{color:#fff;text-shadow:0 0 .12em #b7a2ff,0 .045em 0 #5a2fd0,0 .09em .22em rgba(20,0,60,.85)}}
.t b{{background:linear-gradient(180deg,#fff3c4 10%,#ffcc4d 45%,#ff7a59 95%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 .045em 0 #b8421f) drop-shadow(0 .06em .14em rgba(20,0,60,.8)) drop-shadow(0 0 .14em rgba(255,170,80,.6))}}
.t b.sub{{font-size:.36em;letter-spacing:.03em;display:block;line-height:1.1;margin-top:.02em}}
</style></head><body><div class="t">{words}</div></body></html>'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': a.W, 'height': a.H})
    pg.set_content(html); pg.wait_for_timeout(400); pg.screenshot(path=a.out); b.close()
os.remove(tmp)
print(a.out, f'crop {box}, scale {a.W / (box[2] - box[0]):.2f}x')
