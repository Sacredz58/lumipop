#!/usr/bin/env python3
"""Glue the cover and the recorded clips into a silent preview video (CrazyGames: 15-20 s, no sound,
the static cover as the opening frame, no black bars).

  python3 tools/make_preview.py <cover png> <frames dir from make_video.py> <out.mp4>
"""
import json, os, subprocess, sys
from PIL import Image

COVER, FRAMES, OUT = sys.argv[1:4]
meta = json.load(open(os.path.join(FRAMES, 'clips.json')))
fps = meta['fps']
W, H = Image.open(os.path.join(FRAMES, 'c0_0000.jpg')).size
HOLD, FIRST_FADE, FADE = 1.2, 0.4, 0.3

args = ['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', str(fps), '-t', str(HOLD), '-i', COVER]
for i, _ in enumerate(meta['clips']):
    args += ['-framerate', str(fps), '-i', os.path.join(FRAMES, f'c{i}_%04d.jpg')]
norm = ''.join(f'[{i}:v]scale={W}:{H}:flags=lanczos,setsar=1,fps={fps},format=yuv420p,settb=AVTB[v{i}];' for i in range(len(meta['clips']) + 1))
chain, length, last = '', HOLD, 'v0'
for i, (_, frames) in enumerate(meta['clips'], 1):
    d = FIRST_FADE if i == 1 else FADE
    chain += f'[{last}][v{i}]xfade=transition=fade:duration={d}:offset={length - d:.3f}[x{i}];'
    length += frames / fps - d; last = f'x{i}'
args += ['-filter_complex', norm + chain.rstrip(';'), '-map', f'[{last}]', '-an',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]
subprocess.run(args, check=True)
print(f'{OUT}: {W}x{H}, {length:.1f} s, {os.path.getsize(OUT) / 1e6:.1f} MB')
