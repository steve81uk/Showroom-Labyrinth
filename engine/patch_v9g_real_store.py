#!/usr/bin/env python3
"""Engine v9g: real store.
- Furniture: 36 CC0 Poly Haven models (props/ph/<name>/<name>.gltf) placed by room-type kits against walls,
  GPU-instanced per mesh (one draw call per mesh type). Procedural kits remain as per-wall fallback.
- Surfaces: scanned CC0 PBR textures (props/tex/<name>/...) for showroom floor (smooth concrete), walls (white plaster,
  plus real skirting boards), ceiling (ceiling tiles) and car-park asphalt. Procedural surfaces remain as fallback.
- Store fit-out: security cameras on route-cell corners, a cash register at the exit.
- Hero car: Khronos 'Car Concept' (CC-BY 4.0, props/car/CarConcept.glb) parked in the bay next to the walkway;
  steering emblem hidden, plate replaced with a UK plate. Credit required in the video description.
- Break 2 Minoan tint and chorus-snap unfold now also apply to the real furniture."""
import sys
p = 'labyrinth_renderer.js'; s = open(p).read()
def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'anchor count {c} != {n}: {a[:90]!r}')
    s = s.replace(a, b)

R("const MIME = { '.gltf': 'model/gltf+json',", "const MIME = { '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',")

# ---------------------------------------------------------------- load real furniture before the furniture loop
R("  const tags = [];   // price-tag anchors",
r"""  // ---------------------------------------------------------------- REAL FURNITURE (CC0 Poly Haven), loaded once, instanced later
  const GL = new X.GLTFLoader(); const loadGL = url => new Promise(res => GL.load(url, g => res(g.scene), undefined, () => res(null)));
  const FURN_NAMES = ['GothicBed_01', 'painted_wooden_nightstand', 'ClassicNightstand_01', 'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'sofa_02', 'sofa_03', 'Sofa_01',
    'mid_century_lounge_chair', 'modern_arm_chair_01', 'modern_coffee_table_01', 'coffee_table_round_01', 'side_table_01', 'Ottoman_01', 'dining_table', 'dining_chair_02',
    'round_wooden_table_01', 'WoodenChair_01', 'wooden_display_shelves_01', 'vintage_microwave', 'vintage_electric_kettle', 'metal_office_desk', 'drawer_cabinet',
    'wooden_bookshelf_worn', 'Shelf_01', 'steel_frame_shelves_01', 'steel_frame_shelves_02', 'worn_metal_rack', 'cardboard_box_01', 'industrial_storage_cart',
    'mounted_fluorescent_lights', 'security_camera_01', 'CashRegister_01', 'modern_ceiling_lamp_01', 'ArmChair_01'];
  const FURN = {};
  await Promise.all(FURN_NAMES.map(async n => { const sc = await loadGL(`props/ph/${n}/${n}.gltf`); if (!sc) return; sc.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(sc), size = b.getSize(V3()), c = b.getCenter(V3()), off = new THREE.Matrix4().makeTranslation(-c.x, -b.min.y, -c.z), parts = [];
    sc.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone().premultiply(off) }); });
    FURN[n] = { size, parts, placements: [] }; }));
  const furnMats = new Set(); Object.values(FURN).forEach(F_ => F_.parts.forEach(pp => (Array.isArray(pp.mat) ? pp.mat : [pp.mat]).forEach(m => furnMats.add(m))));
  // kits: [model, x along wall, z from wall ('auto' = half depth + 4 cm), local rotation, y on top of (model name)]
  const KITS2 = {
    bedroom: [['GothicBed_01', 0, 'auto', 0], ['painted_wooden_nightstand', -1.55, 'auto', 0], ['ClassicNightstand_01', 1.55, 'auto', 0], ['potted_plant_02', 2.75, 'auto', 0]],
    living: [['sofa_02', 0, 'auto', 0], ['modern_coffee_table_01', 0, 1.85, 0], ['side_table_01', 1.6, 'auto', 0], ['potted_plant_01', -1.85, 'auto', 0]],
    living2: [['sofa_03', -0.5, 'auto', 0], ['coffee_table_round_01', -0.5, 1.8, 0], ['mid_century_lounge_chair', 1.85, 1.15, -0.6], ['potted_plant_04', 2.85, 'auto', 0]],
    dining: [['dining_table', 0, 1.15, 0], ['dining_chair_02', -0.45, 0.4, 0], ['dining_chair_02', 0.45, 0.4, 0], ['dining_chair_02', -0.45, 1.9, Math.PI], ['dining_chair_02', 0.45, 1.9, Math.PI]],
    kitchen: [['wooden_display_shelves_01', -1.3, 'auto', 0], ['side_table_01', 0.7, 'auto', 0], ['vintage_microwave', 0.7, 'auto', 0, 'side_table_01'], ['round_wooden_table_01', 2.0, 1.2, 0], ['WoodenChair_01', 2.0, 1.85, Math.PI]],
    office: [['metal_office_desk', 0, 'auto', 0], ['modern_arm_chair_01', 0, 1.45, Math.PI], ['drawer_cabinet', 1.6, 'auto', 0], ['wooden_bookshelf_worn', -1.9, 'auto', 0]],
    library: [['wooden_bookshelf_worn', -1.2, 'auto', 0], ['Shelf_01', 0.7, 'auto', 0], ['ArmChair_01', 1.9, 1.05, -0.5], ['Ottoman_01', 1.05, 1.5, 0]],
    storage: [['steel_frame_shelves_01', -1.7, 'auto', 0], ['steel_frame_shelves_02', 0.7, 'auto', 0], ['cardboard_box_01', 2.55, 'auto', 0.3], ['industrial_storage_cart', -0.2, 1.65, 0.5], ['worn_metal_rack', 2.6, 1.6, Math.PI / 2]],
  };
  const ROOMKIT2 = { bedroom: ['bedroom', 'living2', 'bedroom'], kitchen: ['dining', 'kitchen', 'dining'], office: ['office', 'library', 'office'], living: ['living', 'living2', 'library'], storage: ['storage', 'storage', 'library'] };
  const OLDKIT_FOR = { bedroom: 'bed', living: 'sofa', living2: 'sofa', dining: 'table', kitchen: 'counter', office: 'desk', library: 'shelf', storage: 'rack' };
  const kitOk = k => KITS2[k].every(([n]) => FURN[n]);
  const placeFurn = (n, wx, wz, wry, lx, lz, lr, ly = 0) => { const v = V3(lx, 0, lz).applyAxisAngle(V3(0, 1, 0), wry);
    FURN[n].placements.push(new THREE.Matrix4().compose(V3(wx + v.x, ly, wz + v.z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), wry + lr), V3(1, 1, 1))); };
  const tags = [];   // price-tag anchors""")

# ---------------------------------------------------------------- furniture loop: real kit if available, procedural fallback
R("""      const name = kit[(k++ + c) % kit.length];
      if (onPath[c] && name === 'table' && sides.length < 3) continue;
      const ry = Math.atan2(n.x, n.z);              // local +z -> n
      const wx = x - n.x * (CS / 2 - T / 2), wz = z - n.z * (CS / 2 - T / 2);
      const p = (m, w, h, dd, lx, ly, lz) => { const g = new THREE.BoxGeometry(w, h, dd); g.translate(lx, ly + h / 2, lz); g.rotateY(ry); g.translate(wx, 0, wz); (bins[m] || (bins[m] = [])).push(g); };
      KIT[name](p);
      const toW = (lx, ly, lz) => { const v = V3(lx, ly, lz).applyAxisAngle(V3(0, 1, 0), ry); return v.add(V3(wx, 0, wz)); };""",
"""      const kit2 = ROOMKIT2[room][(k + c) % 3];
      const name = kit[(k++ + c) % kit.length];
      const ry = Math.atan2(n.x, n.z);              // local +z -> n
      const wx = x - n.x * (CS / 2 - T / 2), wz = z - n.z * (CS / 2 - T / 2);
      const toW = (lx, ly, lz) => { const v = V3(lx, ly, lz).applyAxisAngle(V3(0, 1, 0), ry); return v.add(V3(wx, 0, wz)); };
      if (kitOk(kit2) && !(onPath[c] && kit2 === 'dining' && sides.length < 3)) {
        let first = null;
        for (const [mn, lx, lz0, lr, on] of KITS2[kit2]) { const sz = FURN[mn].size, rot90 = Math.abs(Math.sin(lr)) > 0.7, dep = rot90 ? sz.x : sz.z;
          const lz = lz0 === 'auto' ? dep / 2 + T / 2 + 0.04 : lz0, ly = on && FURN[on] ? FURN[on].size.y : 0; placeFurn(mn, wx, wz, ry, lx, lz, lr, ly); if (!first) first = { mn, lx, lz, dep, h: sz.y }; }
        tags.push({ p: toW(first.lx + 0.25, Math.min(1.0, first.h * 0.75), first.lz + first.dep / 2 + 0.02), ry, cell: c, kind: kit2 });
        if (/storage|library/.test(kit2)) columns.push({ p: toW(0, 0, 0.2), ry, cell: c });
        if (k === 1 && onPath[c]) clocks.push({ p: toW(-1.6, 2.05, 0.02), ry, cell: c });
        continue; }
      if (onPath[c] && name === 'table' && sides.length < 3) continue;
      const p = (m, w, h, dd, lx, ly, lz) => { const g = new THREE.BoxGeometry(w, h, dd); g.translate(lx, ly + h / 2, lz); g.rotateY(ry); g.translate(wx, 0, wz); (bins[m] || (bins[m] = [])).push(g); };
      KIT[name](p);""")

# ---------------------------------------------------------------- instancing + skirting + store fit-out
R("""    const m = new THREE.Mesh(merge(bins[k]), mat[k]); m.castShadow = k !== 'wallTop'; m.receiveShadow = true; staticGroup.add(m); }""",
r"""    const m = new THREE.Mesh(merge(bins[k]), mat[k]); m.castShadow = k !== 'wallTop'; m.receiveShadow = true; staticGroup.add(m); }
  // skirting boards (real profile) along both faces of every wall
  { const sk = []; for (const g of bins.wall || []) { g.computeBoundingBox(); const b = g.boundingBox, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      const box2 = new THREE.BoxGeometry(w + 0.03, 0.1, d + 0.03); box2.translate((b.max.x + b.min.x) / 2, 0.05, (b.max.z + b.min.z) / 2); sk.push(box2); }
    if (sk.length) { const m = new THREE.Mesh(merge(sk), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.55 })); m.receiveShadow = true; staticGroup.add(m); } }
  // store fit-out: security cameras high on route-cell corners, a till by the exit
  if (FURN.security_camera_01) MZ.pathCells.forEach((c, i) => { if (i % 4 !== 2) return; const [x, z] = cellXZ(c), o = MZ.open[c];
    const d = [0, 1, 2, 3].find(k => !o[k]); if (d === undefined) return; const n = [V3(-1, 0, 0), V3(1, 0, 0), V3(0, 0, -1), V3(0, 0, 1)][d];
    const wx = x - n.x * (CS / 2 - T / 2 - 0.15), wz = z - n.z * (CS / 2 - T / 2 - 0.15); FURN.security_camera_01.placements.push(new THREE.Matrix4().compose(V3(wx + n.z * 2.5, WALL_H - 0.35, wz - n.x * 2.5), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.atan2(n.x, n.z) + 0.5), V3(1, 1, 1))); });
  if (FURN.CashRegister_01 && FURN.side_table_01) { const [x, z] = cellXZ(MZ.exit); placeFurn('side_table_01', x + 1.8, z - CS / 2 + 0.9, 0, 0, 0, Math.PI); placeFurn('CashRegister_01', x + 1.8, z - CS / 2 + 0.9, 0, 0, 0, Math.PI, FURN.side_table_01.size.y); }
  // one InstancedMesh per (model, mesh): a few hundred draw calls at most, whatever the room count
  const furnInst = []; let furnCount = 0;
  for (const [n, F_] of Object.entries(FURN)) { if (!F_.placements.length) continue; furnCount += F_.placements.length;
    for (const part of F_.parts) { const im = new THREE.InstancedMesh(part.geo, part.mat, F_.placements.length); im.castShadow = !/fluorescent|ceiling_lamp/.test(n); im.receiveShadow = true;
      F_.placements.forEach((pm, i) => im.setMatrixAt(i, pm.clone().multiply(part.m))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); staticGroup.add(im); furnInst.push(im); } }
  const furnBase = new Map(); furnMats.forEach(m => { if (m.color) furnBase.set(m, m.color.clone()); });""")

# ---------------------------------------------------------------- scanned surfaces (fallback: procedural)
R("  const FS = SURF.floor, floorRep = [MAZE_W / 4, MAZE_D / 4];",
r"""  const scanTex = async (name, srgbMap = true) => { const L_ = async k => { const t = await loadTex(`props/tex/${name}/${name}_${k}.jpg`); if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (k === 'diff' && srgbMap) t.colorSpace = THREE.SRGBColorSpace; } return t; };
    const [map, normalMap, roughnessMap] = await Promise.all([L_('diff'), L_('nor'), L_('rough')]); return map && normalMap ? { map, normalMap, roughnessMap } : null; };
  const SCAN = { floor: await scanTex('smooth_concrete_floor'), wall: await scanTex('white_plaster_02'), ceil: await scanTex('ceiling_interior'), asph: await scanTex('worn_asphalt') };
  if (SCAN.wall) { const t = SCAN.wall; Object.assign(mat.wall, { map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap || null, roughness: 1 }); mat.wall.normalScale.set(0.6, 0.6); mat.wall.needsUpdate = true; }
  const FS = SCAN.floor || SURF.floor, floorRep = SCAN.floor ? [MAZE_W / 3, MAZE_D / 3] : [MAZE_W / 4, MAZE_D / 4];""")
R("  const CSF = SURF.ceil, ceilRep = [MAZE_W / 2.4, MAZE_D / 2.4];", "  const CSF = SCAN.ceil || SURF.ceil, ceilRep = SCAN.ceil ? [MAZE_W / 2.0, MAZE_D / 2.0] : [MAZE_W / 2.4, MAZE_D / 2.4];")
R("    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LW_, LD_), new THREE.MeshStandardMaterial({ map: rep(ASF.map, ...rp), normalMap: rep(ASF.normalMap, ...rp), roughnessMap: rep(ASF.roughnessMap, ...rp), roughness: 1, envMapIntensity: 1.8 }));",
  "    const AS_ = SCAN.asph || ASF, rp2 = SCAN.asph ? [LW_ / 4, LD_ / 4] : rp;\n"
  "    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LW_, LD_), new THREE.MeshStandardMaterial({ map: rep(AS_.map, ...rp2), normalMap: rep(AS_.normalMap, ...rp2), roughnessMap: AS_.roughnessMap ? rep(AS_.roughnessMap, ...rp2) : null, roughness: 1, envMapIntensity: 1.4 }));")

# ---------------------------------------------------------------- hero car
R("  // moving extras: a runaway trolley, and one car reversing out of its bay",
r"""  // hero car: Khronos 'Car Concept' (CC-BY 4.0), in the bay beside the walkway
  { const hc = await new Promise(res => GL.load('props/car/CarConcept.glb', g => res(g.scene), undefined, () => res(null)));
    if (hc) { hc.traverse(o => { if (/Emblem/i.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = o.receiveShadow = true;
        if (o.material && /License/i.test(o.material.name)) { o.material = o.material.clone(); o.material.map = plateTex(['DA3D LUS', '#f6c800']); o.material.emissiveMap = null; o.material.needsUpdate = true; } } });
      hc.updateMatrixWorld(true); let b = new THREE.Box3().setFromObject(hc), sz = b.getSize(V3());
      const wrap = new THREE.Group(); wrap.add(hc); if (sz.x > sz.z) hc.rotation.y = Math.PI / 2; hc.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(hc); const cc = b.getCenter(V3());
      hc.position.set(-cc.x, -b.min.y, -cc.z);
      const bayK = 2, slot = cars.find(c => c.ri === 0 && c.k === bayK); if (slot) { park.remove(slot.c); cars.splice(cars.indexOf(slot), 1); }
      wrap.position.set(exX + bayK * 2.6, 0, PZ - 11 + 0.25); wrap.rotation.y = Math.PI; park.add(wrap);
      const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.9 })); cs.position.y = 0.012; wrap.add(cs);
      window.__heroCar = true; } }
  // moving extras: a runaway trolley, and one car reversing out of its bay""")

# ---------------------------------------------------------------- Minoan tint on the real furniture
R("    mat.wall.color.setHex(0xf4ede2).lerp(new THREE.Color(0xe8b98a), minoan * 0.6);",
  "    mat.wall.color.setHex(0xf4ede2).lerp(new THREE.Color(0xe8b98a), minoan * 0.6);\n"
  "    if (furnBase.size) { const red = new THREE.Color(0xb3261e); furnBase.forEach((c0, m) => m.color.copy(c0).lerp(red, minoan * 0.55)); }")
R("path_cells: MZ.pathCells.length,", "path_cells: MZ.pathCells.length, furniture_models: Object.keys(FURN).length, furniture_pieces: furnCount, scanned: Object.entries(SCAN).filter(([, v]) => v).map(([k]) => k).join('+'), hero_car: !!window.__heroCar,")
open(p, 'w').write(s); print('patched v9g')
