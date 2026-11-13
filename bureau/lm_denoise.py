"""Lightmap denoise (post-bake). Separable Gaussian, sigma 1.5 texels, on the linear half-float EXRs.
Safe across the solids atlas because the bake margin (8 px, EXTEND) keeps islands >= 16 px apart (> 4 sigma total).
Keeps the noisy originals as *_raw.exr. Run: python3 lm_denoise.py <bake_dir> [sigma]"""
import bpy, numpy as np, os, sys
d = sys.argv[-2] if len(sys.argv) > 2 and sys.argv[-1].replace('.', '').isdigit() else sys.argv[-1]
sig = float(sys.argv[-1]) if sys.argv[-1].replace('.', '').isdigit() else 1.5
r = int(3 * sig + 0.5); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
scn = bpy.context.scene; st = scn.render.image_settings; st.file_format = 'OPEN_EXR'; st.color_depth = '16'; st.exr_codec = 'ZIP'; st.color_mode = 'RGB'
for n in ['lm_floor', 'lm_solids']:
    src = os.path.join(d, n + '.exr'); raw = os.path.join(d, n + '_raw.exr')
    if not os.path.exists(raw): os.rename(src, raw)
    im = bpy.data.images.load(raw); w, h = im.size; a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    for ax in (0, 1):
        pad = [(0, 0)] * 3; pad[ax] = (r, r); p = np.pad(a, pad, mode='edge')
        a = sum(k[i] * np.take(p, np.arange(i, i + a.shape[ax]), axis=ax) for i in range(2 * r + 1))
    noise_before = float(np.std(np.diff(np.array(im.pixels[:]).reshape(h, w, 4)[..., 1], axis=1)))
    out = bpy.data.images.new(n, w, h, float_buffer=True); out.pixels[:] = a.astype(np.float32).ravel(); out.save_render(src, scene=scn)
    print(n, w, h, 'hf-noise before %.4f after %.4f' % (noise_before, float(np.std(np.diff(a[..., 1], axis=1)))))
