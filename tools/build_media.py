#!/usr/bin/env python3
"""Turn source captures into the optimised media the site ships.

Run once whenever the source material changes; the output in assets/media is
committed, so the site itself still has no build step.

    python tools/build_media.py <folder of raw captures>

Expects the raw folder to hold the files fetched from the project repos
(pottimea.gif, taxicat.gif, debunking-readme, warehouse1.png, taxi_*.png) and
any live-build screenshots named shot-<project>.png.
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "media")


def kb(path):
    return f"{os.path.getsize(path) / 1024:.0f} KB"


def still(src, name, width, quality=80, crop=None):
    im = Image.open(src).convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.size[0] > width:
        im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path, "WEBP", quality=quality, method=6)
    print(f"  {name:<28} {im.size[0]}x{im.size[1]}  {kb(path)}")


def animation(src, name, width, step=1, quality=55, poster_frame=0, crop=None, max_frames=None):
    """Animated WebP plus a still poster, so nothing moves until asked to."""
    im = Image.open(src)
    dur = im.info.get("duration", 70) * step
    frames = []
    for i in range(0, im.n_frames, step):
        im.seek(i)
        f = im.convert("RGB")
        if crop:
            f = f.crop(crop)
        if f.size[0] != width:
            f = f.resize((width, round(f.size[1] * width / f.size[0])), Image.LANCZOS)
        frames.append(f)
        if max_frames and len(frames) >= max_frames:
            break
    path = os.path.join(OUT, name + ".webp")
    frames[0].save(path, "WEBP", save_all=True, append_images=frames[1:], duration=dur,
                   loop=0, quality=quality, method=4, minimize_size=True)
    poster = os.path.join(OUT, name + "-poster.webp")
    frames[min(poster_frame, len(frames) - 1)].save(poster, "WEBP", quality=82, method=6)
    print(f"  {name + '.webp':<28} {frames[0].size[0]}x{frames[0].size[1]}  "
          f"{len(frames)} frames @ {dur} ms  {kb(path)}  (poster {kb(poster)})")


def phone_trio(src, name, picks, crop):
    """Three screens from a portrait phone capture, side by side, so a tall
    recording still fills a landscape card."""
    from PIL import ImageDraw
    im = Image.open(src)
    W, H, pw = 960, 600, 232
    ph = round(pw * (crop[3] - crop[1]) / (crop[2] - crop[0]))
    sheet = Image.new("RGB", (W, H), (16, 14, 24))
    gap = (W - 3 * pw) // 4
    for i, frame in enumerate(picks):
        im.seek(min(frame, im.n_frames - 1))
        f = im.convert("RGB").crop(crop).resize((pw, ph), Image.LANCZOS)
        mask = Image.new("L", (pw, ph), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), 16, fill=255)
        x, y = gap + i * (pw + gap), (H - ph) // 2
        ImageDraw.Draw(sheet).rounded_rectangle((x - 3, y - 3, x + pw + 2, y + ph + 2), 19, fill=(58, 53, 80))
        sheet.paste(f, (x, y), mask)
    path = os.path.join(OUT, name)
    sheet.save(path, "WEBP", quality=84, method=6)
    print(f"  {name:<28} {W}x{H}  {kb(path)}")


def taxi_sheet(raw):
    """Pack the real Taxi Cat sprites the arcade cabinet uses into one image.

    Layout, all in pixels:
      row 0, y=0    cat run cycle, 8 frames of 33x66 per skin, 5 skins stacked
      taxis, y=330  56x96 each, left to right
      booms, y=426  explosion frames in 128x128 cells
    """
    skins = ["cat", "gold_cat", "pink_cat", "white_cat", "neon_cat"]
    taxis = ["taxi", "orange_taxi", "green_taxi", "teal_taxi", "pink_taxi", "purple_taxi",
             "red_taxi", "blue_taxi"]
    booms = ["l0_sprite_13", "l0_sprite_14", "l0_sprite_15", "l0_sprite_16", "l0_sprite_19",
             "l0_sprite_21"]
    sheet = Image.new("RGBA", (768, 554), (0, 0, 0, 0))
    for r, skin in enumerate(skins):
        for i in range(8):
            f = Image.open(os.path.join(raw, f"taxi_{skin}_run{i}.png")).convert("RGBA")
            sheet.paste(f, (i * 33, r * 66))
    for i, t in enumerate(taxis):
        f = Image.open(os.path.join(raw, f"taxi_{t}.png")).convert("RGBA")
        if f.size != (56, 96):      # the original yellow taxi was drawn at a smaller size
            f = f.resize((56, 96), Image.NEAREST)
        sheet.paste(f, (i * 56, 330))
    for i, b in enumerate(booms):
        f = Image.open(os.path.join(raw, f"taxi_{b}.png")).convert("RGBA")
        sheet.paste(f, (i * 128 + (128 - f.size[0]) // 2, 426 + (128 - f.size[1]) // 2))
    path = os.path.join(OUT, "taxicat-sprites.png")
    sheet.save(path, optimize=True)
    print(f"  {'taxicat-sprites.png':<28} {sheet.size[0]}x{sheet.size[1]}  {kb(path)}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    raw = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    j = lambda n: os.path.join(raw, n)

    print("gameplay")
    if os.path.exists(j("pottimea.gif")):
        animation(j("pottimea.gif"), "pottimea", 640, step=1, quality=52, poster_frame=4)
    if os.path.exists(j("taxicat.gif")):
        # trim the phone status bar and app title bar off the capture
        animation(j("taxicat.gif"), "taxicat", 208, step=2, quality=60, poster_frame=24,
                  crop=(0, 30, 208, 450))
        phone_trio(j("taxicat.gif"), "taxicat-trio.webp", picks=(0, 78, 173), crop=(0, 30, 208, 450))

    print("stills")
    if os.path.exists(j("debunking-readme")):
        still(j("debunking-readme"), "debunking.webp", 960)
    if os.path.exists(j("warehouse1.png")):
        still(j("warehouse1.png"), "warehouse.webp", 960)
    for shot in sorted(glob.glob(j("shot-*.png"))):
        name = os.path.basename(shot)[5:-4]
        still(shot, f"{name}.webp", 960)

    print("sprites")
    if os.path.exists(j("taxi_cat_run0.png")):
        taxi_sheet(raw)


if __name__ == "__main__":
    main()
