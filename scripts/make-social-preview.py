"""Render docs/social-preview.png (1280x640, GitHub's link-card size) from REAL captured output.

  NO_COLOR=1 node bin/altcheck.js notion > docs/demo-output.txt
  python3 scripts/make-social-preview.py      # needs Pillow
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = (ROOT / "docs/demo-output.txt").read_text().rstrip("\n").split("\n")
W, H = 1280, 640
BG, FG, DIM, ACCENT = (24, 26, 33), (220, 223, 228), (130, 136, 150), (122, 162, 247)
VERDICT = {"VIABLE": (115, 201, 145), "RISKY": (229, 192, 123), "AVOID": (239, 113, 122)}
MENLO = "/System/Library/Fonts/Menlo.ttc"
title_f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 64, index=1)
tag_f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
mono = ImageFont.truetype(MENLO, 19)
CW = mono.getbbox("M")[2]

# Keep the rows that carry the story: verdict lines and their first reason, Outline/Huly/BoostNote first.
picks = []
for i, line in enumerate(LINES):
    word = line.split(" ", 1)[0]
    if word in VERDICT and any(k in line for k in ("AppFlowy", "outline/outline", "hcengineering", "BoostNote")):
        picks.append(line)
        nxt = LINES[i + 1] if i + 1 < len(LINES) else ""
        if nxt.strip().startswith("↳"):
            picks.append(nxt)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
d.text((64, 52), "altcheck", font=title_f, fill=FG)
d.text((64, 134), "Open-source alternatives, without the abandonware.", font=tag_f, fill=ACCENT)
d.text((64, 196), "$ npx altcheck notion", font=mono, fill=DIM)
y = 240
for line in picks:
    line = line[:95]
    word = line.split(" ", 1)[0]
    if word in VERDICT:
        d.text((64, y), word, font=mono, fill=VERDICT[word])
        d.text((64 + CW * len(word), y), line[len(word):], font=mono, fill=FG)
    else:
        d.text((64, y), line, font=mono, fill=DIM)
    y += 30
d.text((64, H - 64), "CLI + MCP server  ·  MIT  ·  github.com/AziizBg/altcheck", font=tag_f, fill=DIM)
out = ROOT / "docs/social-preview.png"
img.save(out, optimize=True)
print(out, out.stat().st_size // 1024, "KB")
