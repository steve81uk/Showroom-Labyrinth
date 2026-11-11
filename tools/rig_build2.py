#!/usr/bin/env python3
"""Cutout rig v2 for the trolley push: body (legs erased) + one fully drawn leg used twice (near/far).

Reads the clean atlases (Master_*_Atlas.png) and atlas_map_pre_rig.json, writes:
  - Master_Sprite_Atlas.png / Master_Normal_Atlas.png with two new cells packed into free space (y >= 2600)
  - atlas_map.json with animations 'push_body', 'leg' and rigs 'push_body', 'leg'
  - rig2_preview.png (body + leg pieces + bones)
The leg comes from walk_side[0] (straight planted leg, x 130-207). Its thigh is hidden under the coat
in every pose, so the trouser column is extended upward to the hip to give the joint room to rotate.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
sys.path.insert(0, '.')
from pack_atlas import normal_from_rgba

AM = json.load(open('atlas_map_pre_rig.json'))
SA = Image.open('Master_Sprite_Atlas_clean.png').convert('RGBA')
NA = Image.open('Master_Normal_Atlas_clean.png').convert('RGBA')

def cell(anim, i):
    x, y, w, h = AM['animations'][anim]['frames'][i]['rect']; return np.asarray(SA.crop((x, y, x + w, y + h))).copy(), AM['animations'][anim]['frames'][i]

# ---------------------------------------------------------------- 1. body: push frame with trousers + boots erased
body, bfr = cell('actions2', 0)
H, W = body.shape[:2]
lum = ndi.median_filter(body[..., :3].astype(float) @ [0.299, 0.587, 0.114], size=11)
yy, xx = np.mgrid[0:H, 0:W]
def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))
legB = [(235, 325), (150, 385), (115, 447), (95, 470)]; legF = [(280, 320), (335, 360), (337, 450), (395, 468)]
dmin = np.minimum.reduce([seg_dist(xx, yy, a, b) for ch in (legB, legF) for a, b in zip(ch[:-1], ch[1:])])
alpha = body[..., 3] > 20
legmask = alpha & (xx < 408) & (((lum < 42) & (yy > 335) & (dmin < 32)) | ((yy > 392) & (dmin < 55)))
legmask = ndi.binary_dilation(legmask, iterations=2) & alpha & (xx < 408) & ((yy > 380) | (lum < 48))
stub = alpha & (xx > 175) & (xx < 365) & (yy > 335) & (lum < 40) & (dmin < 60)
body[legmask | stub, 3] = 0
# tidy: drop tiny islands left behind
lab, n = ndi.label(body[..., 3] > 20); sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
for i, s in enumerate(sizes, 1):
    if s < 400: body[lab == i, 3] = 0

# ---------------------------------------------------------------- 2. leg: cut from walk_side[0], extend thigh up to the hip
ws, wfr = cell('walk_side', 0)
poly = [(131, 372), (171, 372), (171, 468), (206, 482), (209, 506), (128, 507), (128, 470)]
m = Image.new('L', (ws.shape[1], ws.shape[0]), 0); ImageDraw.Draw(m).polygon(poly, fill=255); m = np.asarray(m) > 0
legsrc = ws.copy(); legsrc[~m, 3] = 0
x0, x1, ytop, ybot, HIP_Y = 120, 215, 372, 510, 245
leg = np.zeros((ybot - HIP_Y, x1 - x0, 4), np.uint8)
leg[ytop - HIP_Y:, :] = legsrc[ytop:ybot, x0:x1]
row = legsrc[392, x0:x1].copy()                      # trouser cross-section below the hem
for r in range(0, ytop - HIP_Y): leg[r] = row
# taper the synthetic thigh slightly toward the hip and give it a soft top so it never shows a hard edge
for r in range(0, ytop - HIP_Y):
    a = min(1.0, r / 18.0); leg[r, :, 3] = (leg[r, :, 3] * a).astype(np.uint8)
LH, LW = leg.shape[:2]
# leg joints in leg-cell pixels (y down)
LEGJ = {'hip': (150 - x0, 0 + 6), 'knee': (150 - x0, 368 - HIP_Y), 'ankle': (151 - x0, 474 - HIP_Y), 'toe': (204 - x0, 498 - HIP_Y), 'sole': 506 - HIP_Y}

# ---------------------------------------------------------------- 3. pack the two new cells into free atlas space
PY = 2600; bx, by = 0, PY; lx, ly = W + 8, PY
SA.paste(Image.fromarray(body), (bx, by)); NA.paste(Image.fromarray(normal_from_rgba(body)), (bx, by))
SA.paste(Image.fromarray(leg), (lx, ly)); NA.paste(Image.fromarray(normal_from_rgba(leg)), (lx, ly))
SA.save('Master_Sprite_Atlas.png', optimize=True); NA.save('Master_Normal_Atlas.png', optimize=True)
AM['animations']['push_body'] = {'frames': [{'rect': [bx, by, W, H], 'pivot': bfr['pivot']}], 'fps': 0, 'loop': False, 'world_height_m': AM['animations']['actions2']['world_height_m'], 'pose_names': ['push_body_no_legs']}
# leg pixel scale relative to the push cell: boot length match (walk boot 77 px vs push front boot ~80 px) -> 1.04
AM['animations']['leg'] = {'frames': [{'rect': [lx, ly, LW, LH], 'pivot': list(LEGJ['hip'])}], 'fps': 0, 'loop': False, 'world_height_m': AM['animations']['actions2']['world_height_m'], 'pose_names': ['leg_from_walk_side_0'], 'scale_to_push': 1.0}

# ---------------------------------------------------------------- 4. skinned meshes
def grid_mesh(img, step):
    h, w = img.shape[:2]; a = ndi.maximum_filter(img[..., 3], size=step * 2 + 1)
    nx, ny = w // step + 1, h // step + 1; gx, gy = np.meshgrid(np.linspace(0, w, nx), np.linspace(0, h, ny))
    av = a[np.clip(gy.astype(int), 0, h - 1), np.clip(gx.astype(int), 0, w - 1)].reshape(-1) > 0
    tris = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            q = (j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1)
            if any(av[k] for k in q): tris += [q[0], q[2], q[1], q[1], q[2], q[3]]
    return gx, gy, tris

def finish(gx, gy, Wt, tris, names, bones, extra):
    flat = Wt.reshape(-1, len(names)); order = np.argsort(-flat, axis=1)[:, :4]
    top = np.take_along_axis(flat, order, axis=1); top /= top.sum(1, keepdims=True) + 1e-12
    used = sorted(set(tris)); remap = {o: n for n, o in enumerate(used)}
    out = {'bones': bones, 'vertices': [[float(gx.flat[o]), float(gy.flat[o]), 0.0] for o in used],
           'skinIndex': [[int(v) for v in order[o]] for o in used], 'skinWeight': [[round(float(v), 4) for v in top[o]] for o in used], 'index': [remap[t] for t in tris]}
    out.update(extra); return out

# body bones (no legs); 'legs' is the attach point for both leg meshes (moves with the walk bob)
BB = [['root', None, 331.5, 500.8], ['trolley', 'root', 420, 250], ['hip', 'root', 258, 318], ['legs', 'hip', 258, 318], ['spine', 'hip', 262, 250], ['chest', 'spine', 300, 175],
      ['head', 'chest', 330, 95], ['coat', 'hip', 220, 330], ['tail0', 'hip', 125, 300], ['tail1', 'tail0', 85, 262], ['tail2', 'tail1', 55, 228],
      ['jaw', 'head', 345, 118], ['eye', 'head', 357, 95], ['earB', 'head', 332, 62], ['earF', 'head', 366, 66]]
names = [b[0] for b in BB]; ix = {n: i for i, n in enumerate(names)}
gx, gy, tris = grid_mesh(body, 4)
Wt = np.zeros(gx.shape + (len(names),))
t = np.clip((318 - gy) / 240, 0, 1)
parts = {'hip': np.clip(1 - t * 3, 0, 1), 'spine': np.clip(1 - abs(t - 0.33) * 3, 0, 1), 'chest': np.clip(1 - abs(t - 0.66) * 3, 0, 1), 'head': np.clip((t - 0.66) * 3, 0, 1)}
s = sum(parts.values()) + 1e-9
for k, v in parts.items(): Wt[..., ix[k]] = v / s
cz = (gy > 300) & (gx > 100) & (gx < 408); cw = np.clip((gy - 300) / 80, 0, 1)
for k in parts: Wt[..., ix[k]] = np.where(cz, Wt[..., ix[k]] * (1 - cw), Wt[..., ix[k]])
Wt[..., ix['coat']] = np.where(cz, cw, 0)
def chain(px, py, pts, sig):
    d = np.stack([seg_dist(px, py, a, b) for a, b in zip(pts[:-1], pts[1:])], -1); w = np.exp(-d ** 2 / (2 * sig ** 2)); return d.min(-1), w / (w.sum(-1, keepdims=True) + 1e-12)
dT, wT = chain(gx, gy, [(125, 300), (85, 262), (55, 228), (30, 200)], 22)
tz = (gx < 150) & (gy < 420) & (dT < 70); tb = np.clip((150 - gx) / 35, 0, 1)
for j in range(len(names)): Wt[..., j] = np.where(tz, Wt[..., j] * (1 - tb), Wt[..., j])
for k, n in enumerate(['tail0', 'tail1', 'tail2']): Wt[..., ix[n]] = np.where(tz, wT[..., k] * tb, Wt[..., ix[n]])
tro = gx >= 408; hands = (gx >= 330) & (gx < 408) & (gy > 215) & (gy < 285); hb = np.clip((gx - 330) / 78, 0, 1) * 0.75
for j in range(len(names)): Wt[..., j] = np.where(tro, 0, np.where(hands, Wt[..., j] * (1 - hb), Wt[..., j]))
Wt[..., ix['trolley']] = np.where(tro, 1.0, np.where(hands, Wt[..., ix['trolley']] + hb, Wt[..., ix['trolley']]))
# face: jaw below the mouth line, eye squash for blinks, two ears
def take(mask, bone, w):
    for j in range(len(names)): Wt[..., j] = np.where(mask, Wt[..., j] * (1 - w), Wt[..., j])
    Wt[..., ix[bone]] = np.where(mask, Wt[..., ix[bone]] + w, Wt[..., ix[bone]])
mouthY = 116.5 + (gx - 345) * 0.16
take((gx >= 341) & (gx <= 404) & (gy > mouthY) & (gy < 146), 'jaw', np.clip((gx - 341) / 10, 0, 1) * np.clip((146 - gy) / 6, 0, 1))
de = np.hypot(gx - 357, gy - 95); take(de < 10, 'eye', np.clip(1 - de / 10, 0, 1))
take((gx < 351) & (gx > 312) & (gy < 62), 'earB', np.clip((62 - gy) / 12, 0, 1))
take((gx >= 351) & (gx < 382) & (gy < 68), 'earF', np.clip((68 - gy) / 12, 0, 1))
# slit the mesh along the lip line so the jaw parts from the upper muzzle (reveals the mouth interior)
jw = Wt[..., ix['jaw']].reshape(-1); fx, fy = gx.reshape(-1), gy.reshape(-1); kept = []
for t in range(0, len(tris), 3):
    v = tris[t:t + 3]; js = jw[v]
    if js.max() - js.min() > 0.45 and 347 < fx[v].mean() < 402 and 108 < fy[v].mean() < 136: continue
    kept += v
print('mouth slit removed', (len(tris) - len(kept)) // 3, 'triangles'); tris = kept
AM.setdefault('rigs', {})['push_body'] = finish(gx, gy, Wt, tris, names, BB, {'anim': 'push_body', 'frame': 0, 'cell': [W, H], 'pivot': bfr['pivot'], 'leg_attach': {'near': [266, 318], 'far': [250, 318]}, 'mouth': [[345, 117], [396, 122], [390, 131], [352, 129]]})

LB = [['hip', None, *LEGJ['hip']], ['knee', 'hip', *LEGJ['knee']], ['ankle', 'knee', *LEGJ['ankle']]]
gx, gy, tris = grid_mesh(leg, 5)
Wl = np.zeros(gx.shape + (3,)); kY, aY = LEGJ['knee'][1], LEGJ['ankle'][1]
Wl[..., 0] = np.clip((kY + 10 - gy) / 20, 0, 1)
Wl[..., 2] = np.clip((gy - (aY - 8)) / 14, 0, 1)
Wl[..., 1] = np.clip(1 - Wl[..., 0] - Wl[..., 2], 0, 1)
AM['rigs']['leg'] = finish(gx, gy, Wl, tris, ['hip', 'knee', 'ankle'], LB, {'anim': 'leg', 'frame': 0, 'cell': [LW, LH], 'pivot': list(LEGJ['hip']),
                                                                             'joints': {k: list(v) if isinstance(v, tuple) else v for k, v in LEGJ.items()}, 'scale_to_push': 1.0})
AM['rigs'].pop('push', None)
json.dump(AM, open('atlas_map.json', 'w'), separators=(',', ':'))
print('body verts', len(AM['rigs']['push_body']['vertices']), 'leg verts', len(AM['rigs']['leg']['vertices']), 'leg cell', LW, LH)

# preview: body + leg side by side on grey
pv = Image.new('RGBA', (W + LW + 30, max(H, LH)), (200, 200, 205, 255)); pv.alpha_composite(Image.fromarray(body), (0, 0)); pv.alpha_composite(Image.fromarray(leg), (W + 20, 0))
d = ImageDraw.Draw(pv)
for k in ('hip', 'knee', 'ankle', 'toe'): x, y = LEGJ[k]; d.ellipse([W + 20 + x - 4, y - 4, W + 20 + x + 4, y + 4], fill=(255, 0, 0))
pv.convert('RGB').save('rig2_preview.png')
