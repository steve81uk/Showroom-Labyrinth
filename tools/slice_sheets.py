#!/usr/bin/env python3
"""Key white-background sprite sheets to alpha and slice them into frames.

Usage: python3 slice_sheets.py <sheet> <out_prefix> [--keep-shadow] [--cell-align torso|bbox]
Writes: <out_prefix>_NN.png (trimmed RGBA frames), <out_prefix>_strip.png (uniform cells,
feet on one baseline), <out_prefix>.json (cell size, frame rects, pivots).
Background is removed by flood fill from the image border, so white fur inside the
character is never keyed out. Floor-shadow ovals under each figure are removed.
"""
import sys, json, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ap = argparse.ArgumentParser()
ap.add_argument('sheet'); ap.add_argument('out')
ap.add_argument('--keep-shadow', action='store_true')
ap.add_argument('--cell-align', default='torso', choices=['torso', 'bbox'])
ap.add_argument('--merge-px', type=int, default=14)
ap.add_argument('--pad', type=int, default=8)
a = ap.parse_args()

im = Image.open(a.sheet)
if im.mode == 'RGBA' and np.asarray(im)[..., 3].min() < 250:
    rgba = np.asarray(im).astype(np.float32)
    rgb = rgba[..., :3]; alpha = rgba[..., 3] / 255.0
    fg = alpha > 0.04
else:
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    whiteish = (mn > 228) & (sat < 0.06)
    lab, n = ndi.label(whiteish)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    fg = ~bg
    if not a.keep_shadow:
        # Shadow candidates: low-saturation mid greys touching the background.
        shadowish = fg & (sat < 0.08) & (mn > 120) & (mx < 236)
        slab, sn = ndi.label(shadowish)
        bg_d = ndi.binary_dilation(bg, iterations=2)
        flab, fn = ndi.label(ndi.binary_dilation(fg, iterations=a.merge_px))
        objs = ndi.find_objects(flab)
        for i, sl in enumerate(ndi.find_objects(slab), 1):
            if sl is None: continue
            comp = slab[sl] == i
            if not (bg_d[sl] & comp).any(): continue
            h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
            if w < 2.2 * h or comp.sum() < 300: continue
            cy = sl[0].start + h / 2
            # must sit in the bottom 14 percent of its figure's bounding box
            fid = flab[sl][comp].max()
            fy0, fy1 = objs[fid - 1][0].start, objs[fid - 1][0].stop
            if cy > fy0 + 0.86 * (fy1 - fy0):
                fg[sl] &= ~comp
        # white pockets sealed off by a shadow (between legs) become background too
        removed = (~bg) & (~fg)
        touch = ndi.binary_dilation(removed, iterations=2)
        pocket_ids = np.unique(lab[touch & whiteish])
        pocket = np.isin(lab, pocket_ids[pocket_ids > 0]) & ~bg
        fg &= ~pocket
        # remove the soft anti-aliased halo left where shadows were
        fg = ndi.binary_opening(fg, iterations=1)
    fg = ndi.binary_fill_holes(fg) if False else fg
    # Feathered alpha and white de-fringe
    core = ndi.binary_erosion(fg, iterations=1)
    alpha = ndi.gaussian_filter(np.where(core, 1.0, np.where(fg, 0.6, 0.0)), 0.6)
    alpha = np.clip(alpha, 0, 1); alpha[core] = 1.0
    am = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((rgb - (1 - am) * 255.0) / am, 0, 255)
    fg = alpha > 0.04

# Figure segmentation
lab, n = ndi.label(ndi.binary_dilation(fg, iterations=max(1, a.merge_px)))
area = ndi.sum(fg, lab, range(1, n + 1))
keep = [i + 1 for i, s in enumerate(area) if s > 0.002 * fg.size]
boxes = []
for i in keep:
    sl = ndi.find_objects((lab == i).astype(int))[0]
    m = (lab[sl] == i) & fg[sl]
    ys, xs = np.nonzero(m)
    boxes.append([sl[1].start + xs.min(), sl[0].start + ys.min(),
                  sl[1].start + xs.max() + 1, sl[0].start + ys.max() + 1, i])
# reading order: cluster into rows by vertical centre
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows, cur = [], [boxes[0]]
for b in boxes[1:]:
    prev = np.mean([(c[1] + c[3]) / 2 for c in cur])
    hgt = np.mean([c[3] - c[1] for c in cur])
    if abs((b[1] + b[3]) / 2 - prev) < 0.45 * hgt: cur.append(b)
    else: rows.append(cur); cur = [b]
rows.append(cur)
ordered = [b for r in rows for b in sorted(r, key=lambda c: c[0])]

out_rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
frames, meta = [], []
for k, (x0, y0, x1, y1, i) in enumerate(ordered):
    crop = out_rgba[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where((lab[y0:y1, x0:x1] == i), crop[..., 3], 0)
    m = crop[..., 3] > 10
    ys, xs = np.nonzero(m)
    if a.cell_align == 'torso':
        top = ys < ys.min() + 0.6 * (ys.max() - ys.min())
        cx = xs[top].mean()
    else:
        cx = (xs.min() + xs.max()) / 2
    frames.append((crop, cx))
    Image.fromarray(crop).save(f'{a.out}_{k:02d}.png')
    meta.append({'index': k, 'src_rect': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
                 'pivot_x_in_crop': round(float(cx), 1)})

# Uniform strip: cell wide enough for every frame around its pivot, feet on baseline
P = a.pad
half = int(max(max(cx, f.shape[1] - cx) for f, cx in frames)) + P
H = max(f.shape[0] for f, _ in frames) + 2 * P
W = 2 * half
strip = Image.new('RGBA', (W * len(frames), H), (0, 0, 0, 0))
for k, (f, cx) in enumerate(frames):
    ox = k * W + int(round(half - cx)); oy = H - P - f.shape[0]
    strip.alpha_composite(Image.fromarray(f), (ox, oy))
    meta[k]['cell_rect'] = [k * W, 0, W, H]
strip.save(f'{a.out}_strip.png')
json.dump({'source': a.sheet, 'frames': len(frames), 'cell_w': W, 'cell_h': H,
           'baseline_y': H - P, 'pivot_x': half, 'rows_detected': len(rows),
           'frames_meta': meta}, open(f'{a.out}.json', 'w'), indent=1)
print(a.out, 'frames', len(frames), 'rows', len(rows), 'cell', W, 'x', H)
