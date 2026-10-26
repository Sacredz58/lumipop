#!/usr/bin/env python3
"""Prepare the background loop: loudness to -16 LUFS, MP3 160 kbps, and a fingerprint of the first
0.19 s so the game can find the exact loop start in any browser (MP3 decoders add different delays).

  python3 tools/make_music.py path/to/loop.wav
"""
import base64, json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, 'vendor')
SR, TARGET_LUFS, STRIDE, N = 44100, -16.0, 8, 1024

src = sys.argv[1]
# measure integrated loudness
out = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
lufs = float([l for l in out.splitlines() if l.strip().startswith('I:')][-1].split()[1])
gain = TARGET_LUFS - lufs
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-af', f'volume={gain:.2f}dB', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
length = len(x) / SR
peak = float(np.abs(x).max())
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-codec:a', 'libmp3lame', '-b:a', '160k', os.path.join(VENDOR, 'music.mp3')], input=x.tobytes(), check=True)
mono = x.mean(1)[: STRIDE * N: STRIDE]
ref = np.clip(np.round(mono / max(1e-6, np.abs(mono).max()) * 32767), -32767, 32767).astype('<i2')
meta = {'url': 'music.mp3', 'len': length, 'stride': STRIDE, 'sr': SR, 'ref': base64.b64encode(ref.tobytes()).decode()}
json.dump(meta, open(os.path.join(VENDOR, 'music.json'), 'w'))
print(f'loudness {lufs:.1f} -> {TARGET_LUFS} LUFS (gain {gain:+.1f} dB), peak {20*np.log10(peak):.1f} dBFS, loop {length:.4f} s, '
      f'mp3 {os.path.getsize(os.path.join(VENDOR, "music.mp3"))/1024:.0f} KB')
