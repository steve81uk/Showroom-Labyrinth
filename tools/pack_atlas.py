#!/usr/bin/env python3
"""Pack sliced sprite strips into Master_Sprite_Atlas.png + Master_Normal_Atlas.png + atlas_map.json.

Normal map: generated per frame from the alpha silhouette (signed distance -> pillow dome)
blended with luminance detail (Sobel), so flat 2D sprites catch 3D point lights with
believable rim and fold shading. Tangent space, +Y up (OpenGL / Three.js convention).
"""
import json, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

CELL_H = 512          # every animation cell is scaled to this height
MAX_W = 4096
PAD = 4
ANIMS = [  # name, strip prefix, frames used, fps hint, loop, world height (m) of the cell
    ('walk_front', 'wolfgang_walk_front', None, 'beat', True, 1.95),
    ('walk_side', 'wolfgang_walk_side', None, 'beat', True, 1.95),
    ('walk_back', 'wolfgang_walk_back', None, 'beat', True, 1.95),
    ('actions1', 'wolfgang_actions1', None, 0, False, 2.10),
    ('actions2', 'wolfgang_actions2', None, 0, False, 1.95),
    ('actions2b', 'wolfgang_actions2b', None, 0, False, 1.95),
    ('mino_turn', 'mino7000_turn', None, 0, False, 1.70),
]
POSE_NAMES = {
    'actions1': ['push_wall', 'palm_strike', 'coffee', 'idle'],
    'actions2': ['trolley_push', 'run_a', 'look_down', 'look_left', 'tie_thread', 'startle'],
    'actions2b': ['flatbed_push', 'run_left', 'stand_front', 'startle_b', 'trolley_push_b',
                  'look_down_b', 'stand_b', 'tie_thread_b', 'startle_c'],
    'mino_turn': ['front', 'three_quarter', 'side_right', 'back'],
}

def normal_from_rgba(rgba):
    a = rgba[..., 3].astype(np.float32) / 255.0
    lum = (rgba[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114])) / 255.0
    inside = a > 0.5
    d = ndi.distance_transform_edt(inside)
    dome = np.sqrt(np.clip(d / 18.0, 0, 1))          # rounded silhouette over ~18 px
    h = 0.75 * ndi.gaussian_filter(dome, 1.5) + 0.25 * ndi.gaussian_filter(lum, 0.8)
    gx = ndi.sobel(h, axis=1); gy = ndi.sobel(h, axis=0)
    s = 2.2
    n = np.dstack([-gx * s, gy * s, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    out = np.zeros_like(rgba)
    out[..., :3] = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    out[..., 3] = rgba[..., 3]
    out[~(a > 0.02)] = (128, 128, 255, 0)
    return out

if __name__ == '__main__':
    cells = []
    for name, pre, _, fps, loop, wh in ANIMS:
        meta = json.load(open(f'sprites/{pre}.json'))
        strip = Image.open(f'sprites/{pre}_strip.png').convert('RGBA')
        cw, ch = meta['cell_w'], meta['cell_h']
        sc = CELL_H / ch
        for k in range(meta['frames']):
            c = strip.crop((k * cw, 0, (k + 1) * cw, ch)).resize((max(1, round(cw * sc)), CELL_H), Image.LANCZOS)
            cells.append((name, k, c, sc, meta, fps, loop, wh))

    # shelf pack, animations kept contiguous
    x = y = 0; row_h = CELL_H; placed = []
    for cell in cells:
        w = cell[2].width
        if x + w > MAX_W:
            x = 0; y += row_h + PAD
        placed.append((x, y, cell)); x += w + PAD
    H = y + CELL_H
    H2 = 1 << (H - 1).bit_length()
    atlas = Image.new('RGBA', (MAX_W, H2), (0, 0, 0, 0))
    natlas = Image.new('RGBA', (MAX_W, H2), (128, 128, 255, 0))
    amap = {'atlas_w': MAX_W, 'atlas_h': H2, 'cell_h': CELL_H, 'v_flip_note': 'rects are top-left origin pixels; UV v = 1 - (y+h)/atlas_h',
            'animations': {}}
    for x, y, (name, k, c, sc, meta, fps, loop, wh) in placed:
        atlas.alpha_composite(c, (x, y))
        natlas.paste(Image.fromarray(normal_from_rgba(np.asarray(c))), (x, y))
        a = amap['animations'].setdefault(name, {'frames': [], 'fps': fps, 'loop': loop,
                                                  'world_height_m': wh, 'pose_names': POSE_NAMES.get(name)})
        a['frames'].append({'rect': [x, y, c.width, CELL_H],
                            'pivot': [round(meta['pivot_x'] * sc, 1), round(meta['baseline_y'] * sc, 1)]})
    atlas.save('Master_Sprite_Atlas.png', optimize=True)
    natlas.save('Master_Normal_Atlas.png', optimize=True)
    json.dump(amap, open('atlas_map.json', 'w'), indent=1)
    print('atlas', MAX_W, 'x', H2, 'cells', len(cells), 'used height', H)

