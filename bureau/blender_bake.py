"""Bureau v10 lightmap bake (prototype). Builds every static solid + floor from world.json as ONE mesh,
packs a second UV channel (UVMap_LM), bakes Cycles DIFFUSE (direct+indirect, no colour) and AO into PNGs,
then exports bureau_store.glb (TEXCOORD_1 = lightmap UVs) for Three.js (material.lightMap, channel 1).
Verifies by rendering the baked result unlit (emission only, 1 spp) from the bench camera.
Run: python3 blender_bake.py <track_root> [res=2048] [samples=64]"""
import bpy, bmesh, json, sys, time, math, os
root = sys.argv[1] if len(sys.argv) > 1 else '..'
RES = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
SPP = int(sys.argv[3]) if len(sys.argv) > 3 else 64
W = json.load(open(os.path.join(root, 'bureau', 'world.json')))
out = os.path.join(root, 'renders', 'bake'); os.makedirs(out, exist_ok=True)
t_all = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# ---- geometry: one bmesh, world (x, z south, y up) -> Blender (x, -z, y); material index per layer
LAYERS = ['wall', 'large', 'small', 'floor', 'anchor']
COL = {'wall': (0.72, 0.69, 0.64), 'large': (0.66, 0.55, 0.36), 'small': (0.5, 0.5, 0.5), 'floor': (0.47, 0.44, 0.40), 'anchor': (0.55, 0.06, 0.05)}
bm = bmesh.new()
def box(x0, z0, x1, z1, h, li, top=True):
    xs, ys = (x0, x1), (-z1, -z0)
    v = [bm.verts.new((xs[i], ys[j], k * h)) for k in (0, 1) for j in (0, 1) for i in (0, 1)]
    # v index = k*4 + j*2 + i ; skip bottom face (never seen, saves lightmap space)
    faces = [(4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    for f in faces:
        bf = bm.faces.new([v[i] for i in f]); bf.material_index = li
for s in W['solids']:
    layer = 'anchor' if s['kind'] == 'bed_anchor' else (s['layer'] if s['layer'] in COL else 'large')
    box(s['x0'], s['z0'], s['x1'], s['z1'], s['h'], LAYERS.index(layer))
# floor slab: subdivided so the lightmap gets texels where the shadows are
fv = [bm.verts.new(p) for p in [(-36, -26, 0), (36, -26, 0), (36, 26, 0), (-36, 26, 0)]]
bf = bm.faces.new(fv); bf.material_index = LAYERS.index('floor')
bmesh.ops.subdivide_edges(bm, edges=bf.edges[:], cuts=0, use_grid_fill=True)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('store'); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('BureauStore', me); scn.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
for L in LAYERS:
    m = bpy.data.materials.new(L); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*COL[L], 1); b.inputs['Roughness'].default_value = 0.8
    me.materials.append(m)
print(f'[bake] mesh {len(me.polygons)} faces', flush=True)

# ---- UVs: channel 0 = simple box projection (for future textures), channel 1 = lightmap pack
me.uv_layers.new(name='UVMap'); lm = me.uv_layers.new(name='UVMap_LM'); me.uv_layers.active = lm
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_BOX_DIV=48, PREF_MARGIN_DIV=0.2)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- lights: same cold sun + sky as the bench, plus the warm thread as a real emitter (it is static in the bake)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 30)); sun = bpy.context.object; sun.data.energy = 3.0
sun.rotation_euler = (math.radians(35), 0, math.radians(-30)); sun.data.angle = math.radians(6)
wd = bpy.data.worlds.new('w'); scn.world = wd; wd.use_nodes = True
wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1); wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

# ---- bake targets
scn.render.engine = 'CYCLES'; c = scn.cycles; c.device = 'CPU'; c.samples = SPP; c.max_bounces = 4; c.use_denoising = False
def bake(kind, fname, **kw):
    img = bpy.data.images.new(fname, RES, RES, float_buffer=True)
    for m in me.materials:
        nt = m.node_tree; n = nt.nodes.get('LM') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'LM'; n.image = img
        uv = nt.nodes.get('LMUV') or nt.nodes.new('ShaderNodeUVMap'); uv.name = 'LMUV'; uv.uv_map = 'UVMap_LM'
        nt.links.new(uv.outputs['UV'], n.inputs['Vector']); nt.nodes.active = n
    for o in scn.objects: o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    t0 = time.time()
    bpy.ops.object.bake(type=kind, margin=6, uv_layer='UVMap_LM', **kw)
    img.filepath_raw = os.path.join(out, fname + '.png'); img.file_format = 'PNG'; img.save()
    dt = round(time.time() - t0, 1); print(f'[bake] {kind} {RES}px {SPP}spp {dt}s', flush=True); return img, dt
times = {}
lm_img, times['diffuse'] = bake('DIFFUSE', 'lightmap_diffuse', pass_filter={'DIRECT', 'INDIRECT'})
ao_img, times['ao'] = bake('AO', 'lightmap_ao')

# ---- verify: unlit render = base colour x baked light, emission only, 1 spp (what Three.js would show)
for m in me.materials:
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; n = nt.nodes['LM']; n.image = lm_img
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    mix.inputs['A'].default_value = b.inputs['Base Color'].default_value
    nt.links.new(n.outputs['Color'], mix.inputs['B'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(mix.outputs['Result'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
r = W['route'][600:1400]; cx, cz = r[400]
bpy.ops.object.camera_add(location=(cx, -cz - 6.3, 15)); cam = bpy.context.object; scn.camera = cam
d = (cx - cam.location.x, -cz - cam.location.y, -cam.location.z)
cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
cam.data.lens_unit = 'FOV'; cam.data.angle = math.radians(40)
sun.data.energy = 0; wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
c.samples = 1; scn.render.resolution_x, scn.render.resolution_y = 960, 540; scn.view_settings.view_transform = 'Standard'
scn.render.filepath = os.path.join(out, 'baked_view.png'); t0 = time.time(); bpy.ops.render.render(write_still=True)
times['verify_frame'] = round(time.time() - t0, 1)
# overhead of the whole store, for the plan view
cam.location = (0, 0, 70); cam.rotation_euler = (0, 0, 0); cam.data.angle = math.radians(62)
scn.render.filepath = os.path.join(out, 'baked_plan.png'); bpy.ops.render.render(write_still=True)

# ---- export glb: restore plain materials (Three.js applies the lightmap itself), keep both UV sets
for m in me.materials:
    nt = m.node_tree; nt.links.new(nt.nodes['Principled BSDF'].outputs['BSDF'], nt.nodes['Material Output'].inputs['Surface'])
    for k in ('LM', 'LMUV'):
        if nt.nodes.get(k): nt.nodes.remove(nt.nodes[k])
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'bureau_store.glb'), use_selection=False, export_yup=True, export_texcoords=True, export_cameras=False, export_lights=False)
times['total'] = round(time.time() - t_all, 1)
json.dump({'res': RES, 'spp': SPP, 'faces': len(me.polygons), 'times': times}, open(os.path.join(out, 'bake.json'), 'w'), indent=1)
print('[bake] done', times, flush=True)
