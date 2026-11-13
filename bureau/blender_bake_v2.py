"""Bureau v10 lightmap bake v2 (irradiance only, HDR). Replaces the v1 prototype, which baked an outdoor sun the
Three.js scene does not have, wrote clipped 8-bit PNGs, and shared one atlas between the floor and every box.

What the maps contain (decided, see DECISIONS.md):
  - DIFFUSE bake with pass_filter {DIRECT, INDIRECT} and NO COLOR  ->  irradiance factor L (linear, unclipped EXR half).
  - Albedo is NOT multiplied in; Three.js multiplies material colour once (MeshBasicMaterial, lightMapIntensity = PI,
    because r169 meshbasic does indirectDiffuse += lightMap * intensity * RECIPROCAL_PI, then *= diffuseColor).
  - No separate AO map at runtime: indirect light already contains the occlusion; multiplying AO again would double-darken.
Geometry, bins and albedo are the SAME rules as bureau_scene.js (one authoritative world.json).
Lights = the scene's ceiling lamp grid as downward area lights + a dim cold ambient. Doors, actors, thread are excluded
(they move). Outputs (bureau/bake/): solids.glb (uv0 + uv1), lm_solids.exr, lm_floor.exr, bake_v2.json, and from one
fixed camera: ref_cycles.png (ground truth path trace), ref_baked.png (albedo x lightmap, unlit).
Run: python3 blender_bake_v2.py <track_root> [res=2048] [spp=64] [cam=x,z,h]"""
import bpy, bmesh, json, sys, time, math, os
import numpy as np
root = sys.argv[1] if len(sys.argv) > 1 else '..'
RES = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
SPP = int(sys.argv[3]) if len(sys.argv) > 3 else 64
CAM = [float(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
W = json.load(open(os.path.join(root, 'bureau', 'world.json')))
out = os.path.join(root, 'bureau', 'bake'); os.makedirs(out, exist_ok=True)
T0 = time.time(); times = {}
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# ---- palette + bin rule: copied from bureau_scene.js (COL / MAT / put rule). sRGB hex -> linear for Cycles.
COL = {'teal': 0x1f5f6b, 'charcoal': 0x34373c, 'red': 0xb3261e, 'concrete': 0xb8b1a4, 'birch': 0xd6c39a, 'grey': 0x9a9da0, 'wall': 0xdcd6cb}
HEX = {'floor': COL['concrete'], 'wall': COL['wall'], 'wallTop': COL['teal'], 'large': COL['birch'], 'dark': COL['charcoal'], 'small': COL['grey'],
       'anchor': COL['red'], 'partition': 0xe6e0d4, 'gondola': COL['birch'], 'worktop': 0xeeeae2, 'cage': 0x8f969c}
def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)
def bin_of(s):
    k = s['kind']
    if s['layer'] == 'wall': return 'wall'
    if k == 'bed_anchor': return 'anchor'
    if 'gondola' in k: return 'gondola'
    if k == 'partition': return 'partition'
    if k == 'worktop': return 'worktop'
    if any(t in k for t in ('cage', 'trolley_bay', 'barrier')): return 'cage'
    if any(t in k for t in ('checkout', 'desk', 'wardrobe', 'tall', 'closet', 'cleaning', 'bench')): return 'dark'
    return 'small' if s['layer'] == 'small' else 'large'
BINS = ['wall', 'wallTop', 'large', 'dark', 'small', 'anchor', 'partition', 'gondola', 'worktop', 'cage']
def material(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(HEX[name]), 1); b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular IOR Level'].default_value = 0.0      # Lambert-only, to match MeshBasic display (no specular in a lightmap)
    return m

# ---- solids: one mesh, world (x, z south, y up) -> Blender (x, -z, y). Bottom faces dropped (never visible).
bm = bmesh.new()
def box(x0, z0, x1, z1, y0, y1, mi):
    xs, ys = (x0, x1), (-z1, -z0)
    v = [bm.verts.new((xs[i], ys[j], (y0, y1)[k])) for k in (0, 1) for j in (0, 1) for i in (0, 1)]
    for f in [(4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]:
        bm.faces.new([v[i] for i in f]).material_index = mi
for s in W['solids']:
    box(s['x0'], s['z0'], s['x1'], s['z1'], 0, s['h'], BINS.index(bin_of(s)))
    if s['layer'] == 'wall':
        box(s['x0'] - 0.01, s['z0'] - 0.01, s['x1'] + 0.01, s['z1'] + 0.01, s['h'], s['h'] + 0.12, BINS.index('wallTop'))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('solids'); bm.to_mesh(me); bm.free()
SOLIDS = bpy.data.objects.new('BureauSolids', me); scn.collection.objects.link(SOLIDS)
for b in BINS: me.materials.append(material(b))
# floor: its own object and its own map (planar UVs, so texel density is uniform: 72 m / RES)
FW, FD = 72.0, 52.0
fm = bpy.data.meshes.new('floor'); fm.from_pydata([(-36, -26, 0), (36, -26, 0), (36, 26, 0), (-36, 26, 0)], [], [(0, 1, 2, 3)])
FLOOR = bpy.data.objects.new('BureauFloor', fm); scn.collection.objects.link(FLOOR); fm.materials.append(material('floor'))
fm.uv_layers.new(name='UVMap'); flm = fm.uv_layers.new(name='UVMap_LM')
for li in fm.loops: x, y, _ = fm.vertices[li.vertex_index].co; flm.data[li.index].uv = ((x + 36) / FW, (y + 26) / FD)
# solids UVs: uv0 = placeholder for future textures, uv1 = packed lightmap
me.uv_layers.new(name='UVMap'); me.uv_layers.new(name='UVMap_LM'); me.uv_layers.active = me.uv_layers['UVMap_LM']
bpy.context.view_layer.objects.active = SOLIDS; SOLIDS.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_BOX_DIV=48, PREF_MARGIN_DIV=0.3)
bpy.ops.object.mode_set(mode='OBJECT')
print(f'[bake2] solids {len(me.polygons)} faces, floor 1 face', flush=True)

# ---- lights: the scene's ceiling lamp grid (bureau_scene.js: x -31.5..31.5 step 9, z -19.5..19.5 step 13, y 6.05)
LAMPS = [(x, z) for x in np.arange(-31.5, 31.6, 9) for z in np.arange(-19.5, 19.6, 13)]
for x, z in LAMPS:
    ld = bpy.data.lights.new('lamp', 'AREA'); ld.shape = 'RECTANGLE'; ld.size, ld.size_y = 1.6, 0.35; ld.energy = 400.0; ld.color = (0.88, 0.93, 1.0)
    lo = bpy.data.objects.new('lamp', ld); lo.location = (float(x), float(-z), 6.0); scn.collection.objects.link(lo)  # area lights face -Z by default
wd = bpy.data.worlds.new('w'); scn.world = wd; wd.use_nodes = True
wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.48, 0.58, 1); wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25

scn.render.engine = 'CYCLES'; c = scn.cycles; c.device = 'CPU'; c.max_bounces = 4; c.diffuse_bounces = 3; c.glossy_bounces = 0
c.use_denoising = False; scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'
def bake(obj, w, h, name):
    img = bpy.data.images.new(name, w, h, float_buffer=True)
    for m in obj.data.materials:
        nt = m.node_tree; n = nt.nodes.new('ShaderNodeTexImage'); n.name = 'LM'; n.image = img
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.name = 'LMUV'; uv.uv_map = 'UVMap_LM'; nt.links.new(uv.outputs['UV'], n.inputs['Vector']); nt.nodes.active = n
    for o in scn.objects: o.select_set(o is obj)
    bpy.context.view_layer.objects.active = obj
    c.samples = SPP; t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, margin_type='EXTEND', uv_layer='UVMap_LM')
    times['bake_' + name] = round(time.time() - t, 1); print(f'[bake2] {name} {w}x{h} {SPP}spp {times["bake_" + name]}s', flush=True)
    for m in obj.data.materials:
        for k in ('LM', 'LMUV'): m.node_tree.nodes.remove(m.node_tree.nodes[k])
    return img
FH = int(round(RES * FD / FW))
img_f = bake(FLOOR, RES, FH, 'lm_floor')
img_s = bake(SOLIDS, RES, RES, 'lm_solids')

# ---- exposure: lightmaps are linear, so one global scale is exact. Target: floor median irradiance factor 0.85.
px = np.array(img_f.pixels[:]).reshape(FH, RES, 4)[..., :3]; med = float(np.median(px.mean(axis=2)))
K = 0.85 / max(med, 1e-6); times['exposure_scale'] = round(K, 4); times['floor_median_raw'] = round(med, 5)
stats = {}
for img in (img_f, img_s):
    a = np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4); a[..., :3] *= K
    img.pixels[:] = a.ravel()
    st = scn.render.image_settings; st.file_format = 'OPEN_EXR'; st.color_depth = '16'; st.exr_codec = 'ZIP'; st.color_mode = 'RGB'
    img.save_render(os.path.join(out, img.name + '.exr'), scene=scn)      # half float, ZIP, linear (verified lossless to half precision)
    ch = a[..., :3]; stats[img.name] = {'w': img.size[0], 'h': img.size[1], 'min': round(float(ch.min()), 4), 'median': round(float(np.median(ch)), 4),
                                        'p99': round(float(np.percentile(ch, 99)), 4), 'max': round(float(ch.max()), 4), 'frac_above_1': round(float((ch > 1).mean()), 4)}
for ld in bpy.data.lights: ld.energy *= K
wd.node_tree.nodes['Background'].inputs['Strength'].default_value *= K

# ---- verification camera (world coords: x, z, height); default = the ward_serv door approach used by the strip
if CAM is None: CAM = [33.5, -2.0, 9.0]
tx, tz = 33.5, -8.0
bpy.ops.object.camera_add(location=(CAM[0], -CAM[1], CAM[2])); cam = bpy.context.object; scn.camera = cam
d = (tx - CAM[0], -tz + CAM[1], 0.9 - CAM[2])
cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(40); cam.data.clip_start = 0.5
scn.render.resolution_x, scn.render.resolution_y, scn.render.resolution_percentage = 960, 540, 100; scn.render.image_settings.file_format = 'PNG'
# (a) ground truth: full path trace with the same lights
c.samples = 128; c.use_denoising = True; scn.render.filepath = os.path.join(out, 'ref_cycles.png'); t = time.time(); bpy.ops.render.render(write_still=True)
times['ref_cycles_frame'] = round(time.time() - t, 1)
# (b) baked display: emission = albedo x lightmap, no lights (what MeshBasic + lightMapIntensity PI shows in Three.js)
for ob, img in ((SOLIDS, img_s), (FLOOR, img_f)):
    for m in ob.data.materials:
        nt = m.node_tree; b = nt.nodes['Principled BSDF']; n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.interpolation = 'Linear'
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap_LM'; nt.links.new(uv.outputs['UV'], n.inputs['Vector'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
        mx.inputs['A'].default_value = b.inputs['Base Color'].default_value; nt.links.new(n.outputs['Color'], mx.inputs['B'])
        em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(mx.outputs['Result'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
for o in scn.objects:
    if o.type == 'LIGHT': o.hide_render = True
wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
c.samples = 4; c.use_denoising = False; scn.render.filepath = os.path.join(out, 'ref_baked.png'); bpy.ops.render.render(write_still=True)

# ---- export solids glb with plain materials (Three.js maps material name -> scene palette and applies the lightmap)
for m in me.materials:
    nt = m.node_tree; nt.links.new(nt.nodes['Principled BSDF'].outputs['BSDF'], nt.nodes['Material Output'].inputs['Surface'])
for o in scn.objects: o.select_set(o is SOLIDS)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'solids.glb'), use_selection=True, export_yup=True, export_texcoords=True, export_normals=True,
                          export_cameras=False, export_lights=False)
times['total'] = round(time.time() - T0, 1)
json.dump({'version': 'bake_v2', 'blender': bpy.app.version_string, 'res': RES, 'floor_res': [RES, FH], 'spp': SPP, 'solid_faces': len(me.polygons),
           'bins': BINS, 'lamps': len(LAMPS), 'camera_world_xz_h': CAM, 'camera_target_world': [tx, 0.9, tz], 'vfov_deg': 40, 'stats': stats, 'times': times,
           'contains': 'irradiance factor (DIFFUSE direct+indirect, no albedo), linear, EXR half ZIP; display = albedo x map (MeshBasic, lightMapIntensity=PI)'},
          open(os.path.join(out, 'bake_v2.json'), 'w'), indent=1)
print('[bake2] done', times, stats, flush=True)
