"""Blender feasibility benchmark for the Bureau world (v10). Builds the floor plan from world.json and times one
overhead frame in Workbench, EEVEE and Cycles (CPU, denoised) at 960x540. Run: python3 blender_bench.py <track_root>"""
import bpy, json, sys, time, math, os
root = sys.argv[1] if len(sys.argv) > 1 else '..'
W = json.load(open(os.path.join(root, 'bureau', 'world.json')))
out = os.path.join(root, 'renders', 'blender_bench'); os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
def mat(name, rgb, rough=0.8, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m
M = {'wall': mat('wall', (0.72, 0.69, 0.64)), 'large': mat('birch', (0.66, 0.55, 0.36), 0.6), 'small': mat('grey', (0.5, 0.5, 0.5)),
     'floor': mat('floor', (0.47, 0.44, 0.40), 0.9), 'anchor': mat('red', (0.55, 0.06, 0.05), 0.5), 'thread': mat('thread', (1.0, 0.45, 0.05), 0.5, 6.0)}
# Blender is Z-up; world.json is x east, z south, y up -> Blender (x, -z, y)
def cube(x0, z0, x1, z1, h, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, -(z0 + z1) / 2, h / 2)); o = bpy.context.object
    o.scale = (max(0.01, x1 - x0), max(0.01, z1 - z0), max(0.01, h)); o.data.materials.append(m); return o
for s in W['solids']:
    cube(s['x0'], s['z0'], s['x1'], s['z1'], s['h'], M['anchor'] if s['kind'] == 'bed_anchor' else M.get(s['layer'], M['large']))
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); fl = bpy.context.object; fl.scale = (72, 52, 1); fl.data.materials.append(M['floor'])
# a stretch of glowing thread along the route (the warm light source the lighting test cares about)
r = W['route'][600:1400]
for i in range(0, len(r) - 4, 4):
    (ax, az), (bx, bz) = r[i], r[i + 4]; L = math.hypot(bx - ax, bz - az) or 0.01
    bpy.ops.mesh.primitive_cube_add(size=1, location=((ax + bx) / 2, -(az + bz) / 2, 0.02)); o = bpy.context.object
    o.scale = (L, 0.07, 0.01); o.rotation_euler = (0, 0, math.atan2(-(bz - az), bx - ax)); o.data.materials.append(M['thread'])
# cold showroom: sun + sky colour; overhead camera like the chorus shot (15 m, angled)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 30)); sun = bpy.context.object; sun.data.energy = 3.0; sun.rotation_euler = (math.radians(35), 0, math.radians(-30))
wd = bpy.data.worlds.new('w'); scn.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1); wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
cx, cz = r[400]
bpy.ops.object.camera_add(location=(cx, -(cz) - 6.3, 15)); cam = bpy.context.object; scn.camera = cam
d = (cx - cam.location.x, -cz - cam.location.y, 0.0 - cam.location.z); cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
cam.data.lens_unit = 'FOV'; cam.data.angle = math.radians(40)
scn.render.resolution_x, scn.render.resolution_y, scn.render.resolution_percentage = 960, 540, 100
scn.render.image_settings.file_format = 'PNG'
res = {}
for eng, setup in [('BLENDER_WORKBENCH', None), ('BLENDER_EEVEE', None), ('CYCLES', 'cycles')]:
    try:
        scn.render.engine = eng
        if setup == 'cycles':
            c = scn.cycles; c.device = 'CPU'; c.samples = 32; c.use_denoising = True; c.max_bounces = 4
        scn.render.filepath = os.path.join(out, f'bench_{eng.lower()}.png'); t0 = time.time(); bpy.ops.render.render(write_still=True); res[eng] = round(time.time() - t0, 1)
    except Exception as e: res[eng] = f'FAILED: {str(e)[:120]}'
    print('[bench]', eng, res[eng], flush=True)
json.dump(res, open(os.path.join(out, 'bench.json'), 'w')); print('[bench] done', res)
