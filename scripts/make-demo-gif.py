"""Render docs/demo.gif from REAL captured output (docs/demo-output.txt). No terminal recorder needed.

  NO_COLOR=1 node bin/altcheck.js notion > docs/demo-output.txt
  python3 scripts/make-demo-gif.py      # needs Pillow + ffmpeg

Nothing is invented: every output line comes from the capture file.
"""
import pathlib, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = (ROOT / "docs/demo-output.txt").read_text().rstrip("\n").split("\n")
COMMAND = "npx altcheck notion"
FONT = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 15)
CW = FONT.getbbox("M")[2]  # monospace cell width
LH = 21                    # line height
PAD = 18
COLS = max(len(COMMAND) + 2, *(len(l) for l in LINES)) + 1
W = PAD * 2 + CW * COLS
H = PAD * 2 + LH * (len(LINES) + 2)
BG, FG, DIM, PROMPT = (24, 26, 33), (220, 223, 228), (130, 136, 150), (122, 162, 247)
VERDICT = {"VIABLE": (115, 201, 145), "RISKY": (229, 192, 123), "AVOID": (239, 113, 122), "UNKNOWN": DIM}
FPS = 20


def frame(cmd_chars, shown, cursor=True):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    y = PAD
    d.text((PAD, y), "$ ", font=FONT, fill=PROMPT)
    typed = COMMAND[:cmd_chars]
    d.text((PAD + CW * 2, y), typed, font=FONT, fill=FG)
    if cursor and shown == 0:
        x = PAD + CW * (2 + len(typed))
        d.rectangle([x, y + 2, x + CW - 1, y + LH - 4], fill=FG)
    for i, line in enumerate(LINES[:shown]):
        y = PAD + LH * (i + 1)
        word = line.split(" ", 1)[0]
        if word in VERDICT:
            d.text((PAD, y), word, font=FONT, fill=VERDICT[word])
            d.text((PAD + CW * len(word), y), line[len(word):], font=FONT, fill=FG)
        elif line.strip().startswith("↳"):
            d.text((PAD, y), line, font=FONT, fill=DIM)
        else:
            d.text((PAD, y), line, font=FONT, fill=FG)
    return img


def main():
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is required")
    frames = []
    frames += [frame(0, 0)] * 8                                   # idle cursor
    for i in range(1, len(COMMAND) + 1):                          # typing
        frames += [frame(i, 0)] * 2
    frames += [frame(len(COMMAND), 0, cursor=False)] * 30         # ~1.5 s: live GitHub checks
    for n in range(1, len(LINES) + 1):                            # output streams in
        frames += [frame(len(COMMAND), n, cursor=False)] * 2
    frames += [frame(len(COMMAND), len(LINES), cursor=False)] * (FPS * 7)  # hold 7 s
    with tempfile.TemporaryDirectory() as tmp:
        for i, f in enumerate(frames):
            f.save(f"{tmp}/f{i:04d}.png")
        out = ROOT / "docs/demo.gif"
        pal = f"{tmp}/pal.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/f%04d.png",
                        "-vf", "palettegen=max_colors=96:stats_mode=full", pal], check=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/f%04d.png", "-i", pal,
                        "-lavfi", "paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", str(out)], check=True)
        print(f"{out} {W}x{H}, {len(frames)} frames, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
