#!/usr/bin/env python3
"""Make scene_background.png from a Poly Haven HDRI (CC0) and report the sun direction.

  python3 bg_from_hdri.py mall_parking_lot_4k.hdr [--clean-mall]

1. Reads the .hdr (OpenCV), finds the brightest texel -> sun azimuth (deg from +X toward +Z, the three.js
   equirect convention) and elevation. Paste these into SUN_DIR in labyrinth_renderer.js.
2. Tone-maps with ACES (median sky -> mid grey x1.6) to an sRGB PNG (scene_background.png): the outdoor
   backdrop and the PMREM reflection source.
3. --clean-mall: for 'mall_parking_lot' only. Paints out the branded mall (real trademarks) by extending the
   sky row above it and keying in the tree line cloned from x-1850 px, feathered at the seams.
"""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

src = sys.argv[1]
img = cv2.imread(src, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32)
H, W = img.shape[:2]
L = img @ [0.2126, 0.7152, 0.0722]
y, x = np.unravel_index(np.argmax(L), L.shape)
sun = {'azimuth_deg': round((x / W) * 360 - 180, 2), 'elevation_deg': round(90 - (y / H) * 180, 2), 'px': [int(x), int(y)]}
exp = 0.18 / np.median(L) * 1.6; v = img * exp
t = np.clip((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0, 1)
im = np.where(t <= 0.0031308, 12.92 * t, 1.055 * np.power(t, 1 / 2.4) - 0.055) * 255
if '--clean-mall' in sys.argv and W == 4096:
    X0, X1, Y0, Y1 = 1960, 3440, 815, 1052; dx = X0 - 110
    sky = np.repeat(im[Y0 - 6:Y0 - 5, X0:X1], Y1 - Y0, axis=0); don = im[Y0:Y1, X0 - dx:X1 - dx]
    lum = 0.3 * don[..., 0] + 0.59 * don[..., 1] + 0.11 * don[..., 2]
    skyish = ((don[..., 2] > don[..., 0] + 8) & (lum > 150)) | (lum > 215)
    a = ndi.gaussian_filter((~skyish).astype(float), 1.5)[..., None]; patch = sky * (1 - a) + don * a
    ramp = np.clip((np.arange(Y1 - Y0) - (1040 - Y0)) / 8, 0, 1)[:, None, None]; patch = patch * (1 - ramp) + don * ramp
    w = np.ones(X1 - X0); w[:70] = np.linspace(0, 1, 70); w[-70:] = np.linspace(1, 0, 70)
    vv = np.ones(Y1 - Y0); vv[:12] = np.linspace(0, 1, 12); vv[-6:] = np.linspace(1, 0, 6)
    m = (vv[:, None] * w[None, :])[..., None]; im[Y0:Y1, X0:X1] = patch * m + im[Y0:Y1, X0:X1] * (1 - m)
Image.fromarray(im.clip(0, 255).astype(np.uint8)).save('scene_background.png', optimize=True)
print(json.dumps(sun))
