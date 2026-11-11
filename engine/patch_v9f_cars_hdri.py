#!/usr/bin/env python3
"""Engine v9f: photoreal car park pass.
- scene_background.png (CC0 Poly Haven 'mall_parking_lot' 4K HDRI, tone-mapped, branded mall removed) is the outdoor
  backdrop AND the PMREM reflection environment; the sun light uses the HDRI's measured sun (az 36.0, el 19.6).
- Cars rebuilt: tumblehome glasshouse with black trim, pillars, door seams + handles, sills, bumpers, grille, lensed
  head/tail lights with DRLs, wipers, roof rails, shark fin, lathe tyres with sidewalls, five-spoke rims with lug nuts,
  brake discs + calipers, arch liners.
- Optional CC0 props from props/ (covered car, street lamps, old tyres) via GLTFLoader; skipped if absent.
- Outdoor shadow frustum widened; SMAA edge anti-aliasing."""
import sys
p = 'labyrinth_renderer.js'; s = open(p).read()
def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'anchor count {c} != {n}: {a[:90]!r}')
    s = s.replace(a, b)

R("import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';",
  "import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';\nimport { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';")
R("BufferGeometryUtils, RoomEnvironment, GTAOPass })", "BufferGeometryUtils, RoomEnvironment, GTAOPass, SMAAPass, GLTFLoader })")
R("const MIME = { '.html': 'text/html; charset=utf-8',", "const MIME = { '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.html': 'text/html; charset=utf-8',")

# ---------------------------------------------------------------- outdoor HDRI backdrop + reflection environment
R("scene.environmentIntensity = DBG_NOENV ? 0 : 0.32; }",
r"""scene.environmentIntensity = DBG_NOENV ? 0 : 0.32; }
  const roomEnv = scene.environment;
  const bgTex = await loadTex('scene_background.png'); let extEnv = null;
  if (bgTex) { bgTex.mapping = THREE.EquirectangularReflectionMapping; bgTex.colorSpace = THREE.SRGBColorSpace; extEnv = new THREE.PMREMGenerator(renderer).fromEquirectangular(bgTex).texture; }
  // sun measured from the HDRI's brightest texel (u 0.600, v 0.391): azimuth 36.0 deg from +X toward +Z, elevation 19.6 deg
  const SUN_DIR = (() => { const az = 36.04 * Math.PI / 180, el = 19.6 * Math.PI / 180; return V3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)); })();""")

# ---------------------------------------------------------------- detailed car model
a0 = s.index("  function makeCar(seed, color, typeName) {")
a1 = s.index("  const CARCOL = [")
s = s[:a0] + r"""  const honey = canvasTex(256, 128, (c) => { c.fillStyle = '#060607'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#2c2e33'; c.lineWidth = 2;
    for (let y = 0; y < 140; y += 12) for (let x = (y / 12 % 2) * 10; x < 270; x += 20) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } c.closePath(); c.stroke(); } });
  const CM = {   // shared car materials (paint is per car)
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a1016, metalness: 0.1, roughness: 0.015, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.8 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.42 }), plastic: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.82 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.1 }), rubber: new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc6ccd3, metalness: 0.95, roughness: 0.18 }), disc: new THREE.MeshStandardMaterial({ color: 0x77797d, metalness: 0.85, roughness: 0.38 }),
    grille: new THREE.MeshStandardMaterial({ map: honey, roughness: 0.6, metalness: 0.3 }), lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 0, clearcoat: 1, transparent: true, opacity: 0.35, envMapIntensity: 2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xf3f5f7, emissive: 0xfafcff, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.15 }), drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 }),
    tail: new THREE.MeshPhysicalMaterial({ color: 0x7a0b0b, emissive: 0xff1208, emissiveIntensity: 0.45, roughness: 0.08, clearcoat: 1 }), amber: new THREE.MeshStandardMaterial({ color: 0xd9840b, emissive: 0xff8a00, emissiveIntensity: 0.2, roughness: 0.2 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95, side: THREE.DoubleSide }) };
  const shapeOf = pts => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath(); return sh; };
  const tyreGeo = (rw) => { const pr = [[rw * 0.64, -0.118], [rw * 0.9, -0.124], [rw * 0.985, -0.104], [rw, -0.06], [rw, 0.06], [rw * 0.985, 0.104], [rw * 0.9, 0.124], [rw * 0.64, 0.118]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pr, 40).rotateX(Math.PI / 2); };
  function makeCar(seed, color, typeName) {
    const r = rng(seed), T = TYPES[typeName], g = new THREE.Group(), Wd = 1.82, L = T.L, H = T.H, rw = T.rw, x0 = -L / 2, belt = typeName === 'van' ? 1.05 : 0.98;
    const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.26 + r() * 0.08, clearcoat: 1, clearcoatRoughness: 0.03 + r() * 0.04, envMapIntensity: 1.35 });
    const add = (geo, m, x, y, z, cast = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o; };
    const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // --- body side profile with wheel arches, extruded with rounded edges
    const sh = new THREE.Shape(), ax = T.wb / 2;
    sh.moveTo(x0 + 0.12, 0.27); sh.lineTo(x0 + 0.01, 0.4); sh.lineTo(x0, 0.66); sh.quadraticCurveTo(x0 + 0.05, 0.84, x0 + 0.34, 0.88);
    sh.lineTo(x0 + T.hood, belt); sh.lineTo(x0 + T.hood + 0.78, H - 0.035); sh.quadraticCurveTo(x0 + T.hood + 0.9, H, x0 + T.hood + 1.05, H);
    sh.lineTo(L / 2 - T.tail - 0.58, H); sh.quadraticCurveTo(L / 2 - T.tail - 0.42, H - 0.015, L / 2 - T.tail - 0.32, H - 0.1);
    sh.lineTo(L / 2 - T.tail, belt + 0.03); sh.lineTo(L / 2 - 0.03, belt - 0.05); sh.quadraticCurveTo(L / 2 + 0.01, 0.75, L / 2, 0.45); sh.lineTo(L / 2 - 0.1, 0.27);
    sh.lineTo(ax + rw + 0.09, 0.27); sh.absarc(ax, rw, rw + 0.09, 0, Math.PI, false); sh.lineTo(-ax + rw + 0.09, 0.27); sh.absarc(-ax, rw, rw + 0.09, 0, Math.PI, false); sh.lineTo(x0 + 0.12, 0.27);
    add(new THREE.ExtrudeGeometry(sh, { depth: Wd - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 6, curveSegments: 28 }).translate(0, 0, -(Wd - 0.2) / 2), paint, 0, 0, 0);
    // --- glasshouse with tumblehome: black trim frame (narrower than the body), glass proud of the trim, pillars
    const gp = [[x0 + T.hood + 0.05, belt + 0.02], [x0 + T.hood + 0.8, H - 0.065], [L / 2 - T.tail - 0.44, H - 0.065], [L / 2 - T.tail - 0.03, belt + 0.045]];
    const cx = gp.reduce((a, b) => a + b[0], 0) / 4, cy = gp.reduce((a, b) => a + b[1], 0) / 4;
    add(new THREE.ExtrudeGeometry(shapeOf(gp.map(([x, y]) => [cx + (x - cx) * 1.035, cy + (y - cy) * 1.09])), { depth: Wd - 0.3, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 }).translate(0, 0, -(Wd - 0.3) / 2), CM.trim, 0, 0, 0, false);
    add(new THREE.ExtrudeGeometry(shapeOf(gp), { depth: Wd - 0.27, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2 }).translate(0, 0, -(Wd - 0.27) / 2), CM.glass, 0, 0, 0, false);
    const pillars = typeName === 'van' ? [x0 + T.hood + 1.5] : typeName === 'hatch' ? [x0 + T.hood + 1.42] : [x0 + T.hood + 1.5, L / 2 - T.tail - 0.95];
    for (const px of pillars) add(BX(0.1, H - belt - 0.05, Wd - 0.22), CM.trim, px, (H + belt) / 2 - 0.01, 0, false);
    // --- sills, bumpers, grille, lights
    for (const sz of [-1, 1]) { add(BX(T.wb - 2 * rw - 0.24, 0.1, 0.04), CM.plastic, 0, 0.33, sz * (Wd / 2 - 0.005), false);
      // door seams and handles
      const seams = typeName === 'hatch' || typeName === 'van' ? [x0 + T.hood + 0.02, x0 + T.hood + 1.45] : [x0 + T.hood + 0.02, x0 + T.hood + 1.45, L / 2 - T.tail - 0.92];
      for (const sx of seams) add(BX(0.007, belt - 0.34, 0.01), CM.trim, sx, (belt + 0.34) / 2, sz * (Wd / 2 + 0.002), false);
      add(BX(T.hood > 1.0 ? 1.0 : 0.9, 0.007, 0.01), CM.trim, x0 + T.hood + 0.75, belt - 0.02, sz * (Wd / 2 + 0.002), false);
      for (const hx of [x0 + T.hood + 1.2, L / 2 - T.tail - 0.7]) if (hx < L / 2 - 0.5) add(BX(0.16, 0.035, 0.03), CM.chrome, hx, belt - 0.12, sz * (Wd / 2 + 0.01), false);
      // mirrors
      const mr = add(BX(0.2, 0.12, 0.2), paint, x0 + T.hood + 0.22, belt + 0.08, sz * (Wd / 2 + 0.1)); add(BX(0.12, 0.05, 0.12), CM.trim, x0 + T.hood + 0.26, belt + 0.01, sz * (Wd / 2 + 0.05), false);
      // headlight: chrome reflector, lens, DRL strip; tail light; indicator
      add(BX(0.05, 0.12, 0.36), CM.head, x0 + 0.06, 0.73, sz * 0.6, false); add(BX(0.03, 0.14, 0.38), CM.lens, x0 + 0.02, 0.73, sz * 0.6, false);
      add(BX(0.02, 0.018, 0.3), CM.drl, x0 + 0.015, 0.665, sz * 0.6, false); add(BX(0.03, 0.05, 0.08), CM.amber, x0 + 0.03, 0.73, sz * 0.83, false);
      g.userData['rev' + sz] = add(BX(0.05, 0.16, 0.34), CM.tail.clone(), L / 2 - 0.02, 0.84, sz * 0.62, false);
      add(BX(0.06, 0.035, 0.06), CM.drl, L / 2 - 0.01, 0.74, sz * 0.62, false); }
    add(BX(0.025, 0.22, 0.72), CM.grille, x0 - 0.006, 0.55, 0, false);
    for (const [w, h, d, y, z] of [[0.03, 0.02, 0.76, 0.665, 0], [0.03, 0.02, 0.76, 0.435, 0], [0.03, 0.25, 0.02, 0.55, 0.37], [0.03, 0.25, 0.02, 0.55, -0.37]]) add(BX(w, h, d), CM.chrome, x0 - 0.008, y, z, false);
    add(BX(0.16, 0.14, Wd - 0.12), CM.plastic, x0 + 0.06, 0.32, 0, false); add(BX(0.16, 0.14, Wd - 0.12), CM.plastic, L / 2 - 0.06, 0.34, 0, false);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 24).rotateZ(Math.PI / 2), CM.chrome, x0 - 0.02, 0.62, 0, false);
    // wipers, roof rails, shark fin
    for (const wz of [-0.32, 0.38]) { const w = add(BX(0.02, 0.012, 0.6), CM.trim, x0 + T.hood + 0.08, belt + 0.05, wz, false); w.rotation.y = 0.25; }
    if (typeName === 'suv' || typeName === 'van') for (const sz of [-1, 1]) add(BX(L * 0.42, 0.04, 0.04), CM.plastic, (x0 + T.hood + 1.05 + L / 2 - T.tail - 0.58) / 2, H + 0.03, sz * 0.62, false);
    add(BX(0.16, 0.06, 0.05), paint, L / 2 - T.tail - 0.7, H + 0.03, 0, false);
    // --- wheels: lathe tyre, five-spoke rim, lug nuts, brake disc + caliper; arch liners
    const calCol = [0xb31b1b, 0x5d6066, 0xc9a227][Math.floor(r() * 3)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(sx * ax, rw, sz * (Wd / 2 - 0.15)); wg.name = 'wheel'; g.add(wg);
      const t = new THREE.Mesh(tyreGeo(rw), CM.rubber); t.castShadow = true; wg.add(t);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.64, rw * 0.64, 0.2, 28, 1, true).rotateX(Math.PI / 2), CM.trim); wg.add(barrel);
      const face = sz * 0.1, rimO = new THREE.Mesh(new THREE.TorusGeometry(rw * 0.62, 0.018, 8, 36), CM.rim); rimO.position.z = face; wg.add(rimO);
      for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(BX(0.07, rw * 0.6, 0.03), CM.rim); sp.geometry.translate(0, rw * 0.3, 0); sp.rotation.z = k * Math.PI * 2 / 5; sp.position.z = face; wg.add(sp); }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 20).rotateX(Math.PI / 2), CM.rim); cap.position.z = face + sz * 0.01; wg.add(cap);
      for (let k = 0; k < 5; k++) { const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6).rotateX(Math.PI / 2), CM.chrome); const a = k * Math.PI * 2 / 5 + 0.6; nut.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085, face + sz * 0.012); wg.add(nut); }
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.52, rw * 0.52, 0.02, 32).rotateX(Math.PI / 2), CM.disc); disc.position.z = face - sz * 0.06; wg.add(disc);
      const cal = add(BX(0.12, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: calCol, roughness: 0.5 }), sx * ax + 0.12, rw + 0.12, sz * (Wd / 2 - 0.15) + sz * (0.1 - 0.05), false);
      const lin = new THREE.Mesh(new THREE.CylinderGeometry(rw + 0.08, rw + 0.08, Wd - 0.34, 28, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), CM.liner); lin.position.set(sx * ax, rw, 0); g.add(lin); }
    // --- plates (UK: white front, yellow rear) and contact shadow
    const pt = ['ABCDEFGHKLMNPRSTVWXY', '0123456789'], ch = (k) => pt[k][Math.floor(r() * pt[k].length)];
    const reg = `${ch(0)}${ch(0)}${ch(1)}${ch(1)} ${ch(0)}${ch(0)}${ch(0)}`;
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: plateTex([reg, '#f4f4f0']), roughness: 0.35 })); fp.rotation.y = -Math.PI / 2; fp.position.set(x0 - 0.02, 0.42, 0); g.add(fp);
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: plateTex([reg, '#f6c800']), roughness: 0.35 })); bp.rotation.y = Math.PI / 2; bp.position.set(L / 2 + 0.01, 0.6, 0); g.add(bp);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.08, Wd * 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.9 })); cs.position.y = 0.012; g.add(cs);
    return g; }
""" + s[a1:]

# ---------------------------------------------------------------- CC0 props (optional): covered car, street lamps, old tyres
R("  // moving extras: a runaway trolley, and one car reversing out of its bay",
r"""  // CC0 props from Poly Haven (optional, loaded only if props/ is present next to manifest.json)
  { const gl = new X.GLTFLoader(); const load = url => new Promise(res => gl.load(url, gg => res(gg.scene), undefined, () => res(null)));
    const [cov, lamp, tyre] = await Promise.all([load('props/covered_car/covered_car.gltf'), load('props/street_lamp_01/street_lamp_01.gltf'), load('props/old_tyre/old_tyre.gltf')]);
    const prep = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); const b = new THREE.Box3().setFromObject(o); o.position.y -= b.min.y; const w = new THREE.Group(); w.add(o); return w; };
    if (cov) { const free = []; for (const [ri, rz, face] of [[0, PZ - 11, 1], [1, PZ - 17, -1]]) for (let k = -6; k <= 6; k++) { const bx = exX + k * 2.6; if (Math.abs(bx - exX) < 4.2) continue; if (!cars.some(c => c.ri === ri && c.k === k)) free.push([bx, rz, face]); }
      free.slice(0, 2).forEach(([bx, rz, face], i) => { const c = prep(i ? cov.clone(true) : cov); c.position.set(bx, 0, rz + face * 0.25); c.rotation.y = (hash(i, 5) - 0.5) * 0.12; park.add(c); }); }
    if (lamp) for (const lz of [PZ - 4, PZ - 15, PZ - 26, PZ - 37]) for (const sd of [-1, 1]) { const l = prep(lamp.clone(true)); l.position.set(exX + sd * 2.6, 0, lz); l.rotation.y = sd > 0 ? Math.PI : 0; park.add(l); }
    if (tyre) for (const [x, z, ry, lean] of [[exX + 10.6, PZ - 5.2, 0.4, 0.15], [exX + 11.1, PZ - 5.0, 1.2, 1.5708]]) { const t = prep(tyre.clone(true)); t.children[0].rotation.x = lean; t.position.set(x, 0, z); t.rotation.y = ry; park.add(t); } }
  // moving extras: a runaway trolley, and one car reversing out of its bay""")

# ---------------------------------------------------------------- SMAA
R("  composer.addPass(finalPass); composer.addPass(new X.OutputPass());", "  composer.addPass(finalPass); composer.addPass(new X.OutputPass()); composer.addPass(new X.SMAAPass(W, H));")

# ---------------------------------------------------------------- per-frame: outdoor look
R("    scene.background = pacOn ? new THREE.Color(0) : outside || mode === 'EXT' ? skyTex : sky;\n    sun.intensity = outside ? 2.4 : 0.9; if (outside) sun.position.copy(P).add(V3(-8, 16, 10));",
r"""    const extLook = !pacOn && (outside || mode === 'EXT');
    scene.background = pacOn ? new THREE.Color(0) : extLook ? (bgTex || skyTex) : sky;
    scene.environment = extLook && extEnv ? extEnv : roomEnv; scene.environmentIntensity = DBG_NOENV ? 0 : extLook ? 1.0 : 0.32;
    if (extLook) { sun.intensity = 3.2; sun.position.copy(P).addScaledVector(SUN_DIR, 45); hemi.intensity = 0.25;
      Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, far: 120 }); }
    else { sun.intensity = 0.9; Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 60 }); }
    sun.shadow.camera.updateProjectionMatrix();""")
open(p, 'w').write(s); print('patched v9f')
