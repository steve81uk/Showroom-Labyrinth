#!/usr/bin/env python3
"""Build a 2D skeletal (skinned-mesh) rig for an atlas frame and store it in atlas_map.json['rigs'].

Spine-style cutout deformation: a grid mesh over the drawing, bound to a bone hierarchy with up to 4
weights per vertex. Weights come from region rules + distance to bone chains + a luminance test that
separates near-black trousers/boots (legs) from the mid-grey coat (body). Output is deterministic data;
the engine (labyrinth_renderer.js) builds a THREE.SkinnedMesh from it and animates the bones on the beat grid.

Usage: python3 rig_build.py [--preview]   (writes atlas_map.json and rig_push_weights.png)
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

AM = json.load(open('atlas_map.json'))
ATLAS = Image.open('Master_Sprite_Atlas.png')

# ---- push rig: actions2[0] (trolley push, facing right). Joint positions in cell pixels, y down.
RIG = {
    'name': 'push', 'anim': 'actions2', 'frame': 0, 'step': 6,
    'bones': [  # name, parent, x, y
        ['root', None, 331.5, 500.8], ['trolley', 'root', 420, 250], ['hip', 'root', 258, 318],
        ['spine', 'hip', 262, 250], ['chest', 'spine', 300, 175], ['head', 'chest', 330, 95], ['coat', 'hip', 220, 330],
        ['tail0', 'hip', 125, 300], ['tail1', 'tail0', 85, 262], ['tail2', 'tail1', 55, 228],
        ['thighB', 'hip', 235, 325], ['shinB', 'thighB', 150, 385], ['footB', 'shinB', 115, 447],
        ['thighF', 'hip', 280, 320], ['shinF', 'thighF', 335, 360], ['footF', 'shinF', 337, 450],
    ],
    # leg chains for distance tests (joint points incl. toe)
    'legB': [(235, 325), (150, 385), (115, 447), (95, 470)],
    'legF': [(280, 320), (335, 360), (337, 450), (395, 468)],
    'tail': [(125, 300), (85, 262), (55, 228), (30, 200)],
}

def seg_dist(p, a, b):
    p, a, b = np.asarray(p, float), np.asarray(a, float), np.asarray(b, float)
    ab = b - a; t = np.clip(((p - a) * ab).sum(-1) / max(1e-9, (ab * ab).sum()), 0, 1)
    return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1)

def chain_weights(p, pts, names, sigma):
    d = np.stack([seg_dist(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1)], -1)
    w = np.exp(-(d ** 2) / (2 * sigma ** 2)); w /= w.sum(-1, keepdims=True) + 1e-12
    return d.min(-1), {n: w[..., i] for i, n in enumerate(names)}

def build(rig):
    fr = AM['animations'][rig['anim']]['frames'][rig['frame']]
    x0, y0, W, H = fr['rect']
    img = np.asarray(ATLAS.crop((x0, y0, x0 + W, y0 + H))).astype(float)
    lum = ndi.median_filter(img[..., :3] @ [0.299, 0.587, 0.114], size=11)
    alpha = ndi.maximum_filter(img[..., 3], size=rig['step'] * 2 + 1)
    st = rig['step']; nx, ny = W // st + 1, H // st + 1
    gx, gy = np.meshgrid(np.linspace(0, W, nx), np.linspace(0, H, ny))
    P = np.stack([gx, gy], -1)
    names = [b[0] for b in rig['bones']]; idx = {n: i for i, n in enumerate(names)}
    Wt = np.zeros((ny, nx, len(names)))
    layer = np.zeros((ny, nx))
    xi = np.clip(gx.astype(int), 0, W - 1); yi = np.clip(gy.astype(int), 0, H - 1)
    L = lum[yi, xi]
    # body: hip -> spine -> chest -> head by height
    def body_w(px, py):
        out = {}
        t = np.clip((318 - py) / 240, 0, 1)
        out['hip'] = np.clip(1 - t * 3, 0, 1); out['spine'] = np.clip(1 - abs(t - 0.33) * 3, 0, 1)
        out['chest'] = np.clip(1 - abs(t - 0.66) * 3, 0, 1); out['head'] = np.clip((t - 0.66) * 3, 0, 1)
        s = sum(out.values()) + 1e-9; return {k: v / s for k, v in out.items()}
    bw = body_w(gx, gy)
    for k, v in bw.items(): Wt[..., idx[k]] = v
    # legs
    dB, wB = chain_weights(P, rig['legB'], ['thighB', 'shinB', 'footB'], 18)
    dF, wF = chain_weights(P, rig['legF'], ['thighF', 'shinF', 'footF'], 18)
    legzone = (gy > 318) & (gx > 70) & (gx < 410)
    dark = L < 42
    is_leg = legzone & ((dark & (np.minimum(dB, dF) < 30)) | ((gy > 395) & (np.minimum(dB, dF) < 46)))
    is_leg = (ndi.binary_closing(is_leg, iterations=2) & (gy > 372) | is_leg) & legzone & (np.minimum(dB, dF) < 50)
    blend = np.clip((gy - 318) / 40, 0, 1)           # soft hand-over from hip to thigh
    for side, d_this, d_other, wd in (('B', dB, dF, wB), ('F', dF, dB, wF)):
        m = is_leg & (d_this <= d_other)
        for n, w in wd.items():
            Wt[..., idx[n]] = np.where(m, w * blend, Wt[..., idx[n]])
        for k in bw:
            Wt[..., idx[k]] = np.where(m, bw[k] * (1 - blend), Wt[..., idx[k]])
        layer = np.where(m, 1.0 if side == 'F' else -1.0, layer)
    # coat skirt (mid-grey below waist): coat bone, dragged 30% by the nearest thigh
    coatz = legzone & ~is_leg & (gy < 400)
    near_thigh = np.where(dB < dF, idx['thighB'], idx['thighF'])
    cw = np.clip((gy - 290) / 90, 0, 1)
    for k in bw: Wt[..., idx[k]] = np.where(coatz, bw[k] * (1 - cw), Wt[..., idx[k]])
    Wt[..., idx['coat']] = np.where(coatz, cw * 0.94, Wt[..., idx['coat']])
    for t_i in (idx['thighB'], idx['thighF']):
        Wt[..., t_i] = np.where(coatz & (near_thigh == t_i), cw * 0.06, Wt[..., t_i])
    # tail
    dT, wT = chain_weights(P, rig['tail'], ['tail0', 'tail1', 'tail2'], 22)
    tz = (gx < 150) & (gy < 420) & (dT < 70) & ~is_leg
    tb = np.clip((150 - gx) / 35, 0, 1)
    for k in list(bw) + ['coat']: Wt[..., idx[k]] = np.where(tz, Wt[..., idx[k]] * (1 - tb), Wt[..., idx[k]])
    for n, w in wT.items(): Wt[..., idx[n]] = np.where(tz, w * tb, Wt[..., idx[n]])
    layer = np.where(tz & (tb > 0.5), -2.0, layer)
    # trolley and hands: trolley rolls on root (no bob); hands split trolley/chest
    tro = gx >= 408
    hands = (gx >= 330) & (gx < 405) & (gy > 215) & (gy < 285)
    for j in range(len(names)):
        Wt[..., j] = np.where(tro, 0.0, Wt[..., j])
    Wt[..., idx['trolley']] = np.where(tro, 1.0, Wt[..., idx['trolley']])
    hb = np.clip((gx - 330) / 75, 0, 1) * 0.75
    for j in range(len(names)):
        if j != idx['trolley']: Wt[..., j] = np.where(hands, Wt[..., j] * (1 - hb), Wt[..., j])
    Wt[..., idx['trolley']] = np.where(hands, Wt[..., idx['trolley']] + hb, Wt[..., idx['trolley']])
    layer = np.where(tro, 2.0, layer)
    # keep top 4 weights, renormalise
    flat = Wt.reshape(-1, len(names)); order = np.argsort(-flat, axis=1)[:, :4]
    top = np.take_along_axis(flat, order, axis=1); top /= top.sum(1, keepdims=True) + 1e-12
    # drop empty quads (fully transparent) to keep the mesh small
    a_v = alpha[yi, xi].reshape(-1) > 0
    verts, uvs, si, sw, keep = [], [], [], [], {}
    for k in range(nx * ny):
        keep[k] = len(verts); verts.append([float(gx.flat[k]), float(gy.flat[k]), float(layer.flat[k])])
        si.append([int(v) for v in order[k]]); sw.append([round(float(v), 4) for v in top[k]])
    tris = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1
            if a_v[a] or a_v[b] or a_v[c] or a_v[d]:
                lay = layer.flat[[a, b, c, d]]
                if np.ptp(lay) > 0:   # split quads straddling two layers: use the majority layer for the whole quad
                    vals, cnt = np.unique(lay, return_counts=True); maj = vals[np.argmax(cnt)]
                    for q in (a, b, c, d): verts[keep[q]][2] = float(maj) if abs(verts[keep[q]][2] - maj) > 0 else verts[keep[q]][2]
                tris += [a, c, b, b, c, d]
    used = sorted(set(tris)); remap = {o: n for n, o in enumerate(used)}
    out = {'anim': rig['anim'], 'frame': rig['frame'], 'cell': [W, H], 'pivot': fr['pivot'],
           'bones': rig['bones'], 'vertices': [verts[keep[o]] for o in used], 'skinIndex': [si[o] for o in used], 'skinWeight': [sw[o] for o in used],
           'index': [remap[t] for t in tris]}
    return out, (gx, gy, Wt, layer, is_leg, tz, tro, W, H, img)

rig, dbg = build(RIG)
AM.setdefault('rigs', {})['push'] = rig
json.dump(AM, open('atlas_map.json', 'w'), separators=(',', ':'))
print('push rig: bones', len(rig['bones']), 'verts', len(rig['vertices']), 'tris', len(rig['index']) // 3)

if '--preview' in sys.argv:
    gx, gy, Wt, layer, is_leg, tz, tro, W, H, img = dbg
    cols = {'thighB': (0, 90, 255), 'shinB': (0, 170, 255), 'footB': (0, 255, 255), 'thighF': (255, 60, 0), 'shinF': (255, 150, 0), 'footF': (255, 230, 0),
            'tail0': (0, 200, 0), 'tail1': (80, 255, 80), 'tail2': (180, 255, 180), 'trolley': (200, 0, 200), 'coat': (140, 90, 40),
            'hip': (120, 120, 120), 'spine': (160, 160, 160), 'chest': (200, 200, 200), 'head': (240, 240, 240), 'root': (0, 0, 0)}
    names = [b[0] for b in RIG['bones']]
    base = Image.fromarray(img.astype(np.uint8)).convert('RGBA'); bg = Image.new('RGBA', base.size, (255, 255, 255, 255)); bg.alpha_composite(base)
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for j in range(gy.shape[0]):
        for i in range(gx.shape[1]):
            w = Wt[j, i]; c = np.zeros(3)
            for k, n in enumerate(names): c += w[k] * np.array(cols[n])
            d.rectangle([gx[j, i] - 3, gy[j, i] - 3, gx[j, i] + 3, gy[j, i] + 3], fill=tuple(int(v) for v in c) + (150,))
    bg.alpha_composite(ov); dd = ImageDraw.Draw(bg)
    pos = {b[0]: (b[2], b[3]) for b in RIG['bones']}
    for b in RIG['bones']:
        if b[1]: dd.line([pos[b[1]], pos[b[0]]], fill=(0, 0, 0), width=3)
        dd.ellipse([b[2] - 5, b[3] - 5, b[2] + 5, b[3] + 5], fill=(255, 0, 0))
    bg.convert('RGB').resize((W * 2, H * 2)).save('rig_push_weights.png')
