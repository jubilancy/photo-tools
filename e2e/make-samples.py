# Generates sample inputs for the browser tests: uv run --with pillow e2e/make-samples.py
import os
import random
import struct
import sys

from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else ".e2e-samples"
os.makedirs(out + "/dup", exist_ok=True)


def gradient(w, h, mode="RGB"):
    # Fast gradient: build one row and one column, then compose.
    img = Image.new(mode, (w, h))
    px = Image.linear_gradient("L").resize((w, h))
    r = px
    g = px.transpose(Image.Transpose.ROTATE_90).resize((w, h))
    b = Image.linear_gradient("L").transpose(Image.Transpose.FLIP_TOP_BOTTOM).resize((w, h))
    return Image.merge("RGB", (r, g, b)) if mode == "RGB" else img


def exif_orientation(value):
    # Little-endian TIFF with a single Orientation entry.
    tiff = b"II*\x00\x08\x00\x00\x00" + struct.pack("<H", 1) + struct.pack("<HHIHH", 0x0112, 3, 1, value, 0) + b"\x00\x00\x00\x00"
    return b"Exif\x00\x00" + tiff


photo = gradient(1200, 800)
ImageDraw.Draw(photo).rectangle((100, 100, 500, 400), fill=(220, 30, 30))
photo.save(f"{out}/photo.jpg", quality=92)
photo.save(f"{out}/dup/photo.jpg", quality=60)
photo.save(f"{out}/photo.png")
photo.save(f"{out}/photo.webp", quality=85)

Image.new("RGB", (1, 1), (200, 100, 50)).save(f"{out}/tiny.png")

t = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
d = ImageDraw.Draw(t)
d.ellipse((50, 50, 350, 250), fill=(255, 0, 0, 255))
d.rectangle((0, 0, 100, 100), fill=(0, 0, 255, 128))
t.save(f"{out}/transparent.png")

# Stored pixels are 600x400; EXIF orientation 6 means it must display as 400x600.
r = gradient(600, 400)
ImageDraw.Draw(r).rectangle((0, 0, 100, 100), fill=(255, 255, 0))
r.save(f"{out}/rotated-exif.jpg", quality=92, exif=exif_orientation(6))

random.seed(1)
with open(f"{out}/corrupt.jpg", "wb") as f:
    f.write(b"\xff\xd8\xff\xe0" + bytes(random.randrange(256) for _ in range(500)))
open(f"{out}/empty.png", "wb").close()

big = Image.linear_gradient("L").resize((10000, 8000)).convert("RGB")
big.save(f"{out}/huge.jpg", quality=70)
print("samples in", out)
