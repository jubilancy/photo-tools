# Generates sample inputs for the browser tests: uv run --with pillow e2e/make-samples.py
import os
import random
import struct
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

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
Image.new("RGB", (200, 50), (255, 0, 0)).save(f"{out}/mark-wide.png")
quad = Image.new("RGB", (40, 20))
for (x0, y0, colour) in [(0, 0, (255, 0, 0)), (20, 0, (0, 255, 0)), (0, 10, (0, 0, 255)), (20, 10, (255, 255, 0))]:
    quad.paste(colour, (x0, y0, x0 + 20, y0 + 10))
quad.save(f"{out}/quad.png")

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

# Photo-like texture for compression tests: blurred colour noise plus fine grain.
def natural(w, h):
    layers = []
    for seed_sigma, blur in ((90, 40), (70, 12), (40, 3)):
        n = Image.effect_noise((w, h), seed_sigma).filter(ImageFilter.GaussianBlur(blur))
        layers.append(n)
    r = ImageChops.add(layers[0], layers[1], 1.2, -30)
    g = ImageChops.add(layers[1], layers[2], 1.2, -30)
    b = ImageChops.add(layers[2], layers[0], 1.2, -30)
    img = Image.merge("RGB", (r, g, b))
    grain = Image.effect_noise((w, h), 14).convert("RGB")
    return ImageChops.add(img, grain, 1.0, -128)


nat = natural(1600, 1200)
nat.save(f"{out}/natural.jpg", quality=95)
nat.save(f"{out}/natural.png")

big = Image.linear_gradient("L").resize((10000, 8000)).convert("RGB")
big.save(f"{out}/huge.jpg", quality=70)
print("samples in", out)
