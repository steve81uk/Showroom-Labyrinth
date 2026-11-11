#!/usr/bin/env python3
"""Engine v9e: fluidity + face + car park.
- Face: lip-sync jaw from Suno word timings x vocal energy, blinks, ear flicks (push_body rig bones jaw/eye/earB/earF),
  dark mouth interior behind the jaw.
- Camera motion blur pass (camera-velocity directional + dolly radial, 9 taps), off on hard cuts.
- Dust motes in the light (indoor), MINO steam plumes, spinning trolley wheels.
- Car park rebuilt: PBR asphalt with puddles and stains, modelled cars (4 body types, clearcoat paint, glass,
  wheels with rims, lights, UK plates), bays, kerb islands with trees, lamp posts, trolley shelter, store sign,
  sky gradient, a runaway trolley and a car reversing out of its bay."""
import sys
p = 'labyrinth_renderer.js'; s = open(p).read()
def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'anchor count {c} != {n}: {a[:90]!r}')
    s = s.replace(a, b)

# ---------------------------------------------------------------- face data: MOUTH[f], BLINK[f], EARS[f]
R("  // ---------------------------------------------------------------- SKELETAL CUTOUT RIG",
r"""  // ---------------------------------------------------------------- FACE TRACKS: lip-sync from word timings x vocal energy, blinks, ear flicks
  const MOUTH = new Float32Array(N), BLINK = new Float32Array(N).fill(1);
  { const tgt = new Float32Array(N);
    for (const w of A.words) { const f0 = Math.floor(w.start_s * FPS), f1 = Math.max(f0 + 1, Math.ceil(w.end_s * FPS)); const syl = Math.max(1, (String(w.w).toLowerCase().match(/[aeiouy]+/g) || []).length);
      for (let f = f0; f < f1 && f < N; f++) { const u = (f - f0) / (f1 - f0); tgt[f] = Math.max(tgt[f], (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * syl * u))) * (0.55 + 0.45 * ENV.rms[f])); } }
    let m = 0; for (let f = 0; f < N; f++) { m = tgt[f] > m ? lerp(m, tgt[f], 0.7) : m * 0.55; MOUTH[f] = m; }
    let next = 40; for (let f = 0; f < N; f++) { if (f >= next) { const seq = [0.55, 0.12, 0.08, 0.35, 0.75]; for (let k = 0; k < seq.length && f + k < N; k++) BLINK[f + k] = seq[k];
      next = f + 75 + Math.floor(hash(f, 41) * 90); } } }
  // ---------------------------------------------------------------- SKELETAL CUTOUT RIG""")

R("""      this.root = new THREE.Group(); this.root.add(this.body.mesh); this.body.mesh.scale.setScalar(this.s); this.root.visible = false;""",
"""      this.root = new THREE.Group(); this.root.add(this.body.mesh); this.body.mesh.scale.setScalar(this.s); this.root.visible = false;
      // mouth interior: sits behind the drawing, revealed when the jaw drops
      if (bodyRig.mouth && this.body.B.head) { const hd = bodyRig.bones.find(b => b[0] === 'head'), sh = new THREE.Shape();
        bodyRig.mouth.forEach(([x, y], i) => i ? sh.lineTo(x - hd[2], -(y - hd[3])) : sh.moveTo(x - hd[2], -(y - hd[3])));
        const mm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x2a0b0d, side: THREE.DoubleSide })); mm.position.z = -0.6; this.body.B.head.add(mm);
        const tongue = new THREE.Mesh(new THREE.CircleGeometry(7, 12), new THREE.MeshBasicMaterial({ color: 0x8a2f35 })); tongue.scale.set(1.6, 0.55, 1); tongue.position.set(372 - hd[2], -(127 - hd[3]), -0.5); this.body.B.head.add(tongue); }""")

R("""      B.tail0.rotation.z = 0.10 * Math.sin(ph * 2 - 0.5) * (0.4 + amp); B.tail1.rotation.z = 0.16 * Math.sin(ph * 2 - 1.1) * (0.4 + amp); B.tail2.rotation.z = 0.22 * Math.sin(ph * 2 - 1.7) * (0.4 + amp);
      this.root.updateMatrixWorld(true);""",
"""      B.tail0.rotation.z = 0.10 * Math.sin(ph * 2 - 0.5) * (0.4 + amp); B.tail1.rotation.z = 0.16 * Math.sin(ph * 2 - 1.1) * (0.4 + amp); B.tail2.rotation.z = 0.22 * Math.sin(ph * 2 - 1.7) * (0.4 + amp);
      // face: jaw on the vocal, blink, ears flick on hats and perk on kicks
      if (B.jaw) { B.jaw.rotation.z = -0.34 * MOUTH[f]; B.head.rotation.z += 0.04 * MOUTH[f]; }
      if (B.eye) B.eye.scale.y = BLINK[f];
      if (B.earF) { const hat = env('hats', f), kk = env('kick', f); B.earF.rotation.z = -0.12 * hat + 0.06 * kk; B.earB.rotation.z = -0.08 * env('hats', Math.max(0, f - 2)) + 0.05 * kk; }
      this.root.updateMatrixWorld(true);""")

# ---------------------------------------------------------------- spinning trolley wheels
R("const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateZ(Math.PI / 2), mat.black); wh.position.set(x, 0.06, z); trolley.add(wh); }",
  "const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateZ(Math.PI / 2), mat.black); wh.name = 'wheel'; wh.position.set(x, 0.06, z); trolley.add(wh);\n"
  "      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.012), mat.steel); hub.position.copy(wh.position); hub.name = 'wheel'; trolley.add(hub); }")

# ---------------------------------------------------------------- car park rebuild
a0 = s.index("  const park = new THREE.Group(); scene.add(park);")
a1 = s.index("  // flat-pack bag he carries outside")
s = s[:a0] + r"""  // ---------------------------------------------------------------- CAR PARK (v9e): PBR asphalt, modelled cars, bays, lamps, shelter, moving extras
  const park = new THREE.Group(); scene.add(park);
  const PZ = -MAZE_D / 2;
  const ASF = surface(71, (a, hh, r, w, h, R) => { a.fillStyle = '#3d3f43'; a.fillRect(0, 0, w, h);
      noiseLayer(a, 31, 30000, 0.6, 1.8, 0.22, true); noiseLayer(a, 32, 26000, 0.6, 1.8, 0.3, false); noiseLayer(hh, 33, 30000, 1, 3, 0.6, true); noiseLayer(hh, 34, 26000, 1, 3, 0.6, false);
      blots(a, R, 3, 'rgba(8,8,10,0.18)', 30, 80);
      for (let i = 0; i < 14; i++) { a.strokeStyle = 'rgba(14,14,16,0.6)'; hh.strokeStyle = 'rgba(0,0,0,0.8)'; a.lineWidth = hh.lineWidth = 1.3; let x = R() * w, y = R() * h; a.beginPath(); hh.beginPath(); a.moveTo(x, y); hh.moveTo(x, y);
        for (let k = 0; k < 9; k++) { x += R() * 26 - 13; y += R() * 26 - 13; a.lineTo(x, y); hh.lineTo(x, y); } a.stroke(); hh.stroke(); }
      for (let i = 0; i < 1; i++) { const x = R() * w, y = R() * h, rx = 90 + R() * 60, ry = 40 + R() * 30, ro = R() * 3;
        a.fillStyle = 'rgba(18,20,24,0.28)'; a.beginPath(); a.ellipse(x, y, rx, ry, ro, 0, 7); a.fill();
        r.fillStyle = 'rgba(12,12,12,0.95)'; r.beginPath(); r.ellipse(x, y, rx, ry, ro, 0, 7); r.fill(); hh.fillStyle = '#808080'; hh.beginPath(); hh.ellipse(x, y, rx, ry, ro, 0, 7); hh.fill(); } }, 0.84, 3.4);
  { const LW_ = 120, LD_ = 90, rp = [LW_ / 7, LD_ / 7];
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LW_, LD_), new THREE.MeshStandardMaterial({ map: rep(ASF.map, ...rp), normalMap: rep(ASF.normalMap, ...rp), roughnessMap: rep(ASF.roughnessMap, ...rp), roughness: 1, envMapIntensity: 1.8 }));
    lot.rotation.x = -Math.PI / 2; lot.position.set(exX, -0.01, PZ - LD_ / 2); lot.receiveShadow = true; park.add(lot); }
  const paintM = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 }), yelM = new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: 0.6 });
  const concM = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 }), grassM = new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 1 });
  const line = (w, d, x, z, m = paintM) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); g.position.set(x, 0.005, z); g.receiveShadow = true; park.add(g); };
  // modelled car: extruded side profile (rounded), glasshouse, wheels with rims, lights, plates, mirrors
  const plateTex = txt => canvasTex(256, 56, (c) => { c.fillStyle = txt[1]; c.fillRect(0, 0, 256, 56); c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(2, 2, 252, 52); c.fillStyle = '#111'; c.font = 'bold 40px DejaVu Sans Mono'; c.textAlign = 'center'; c.fillText(txt[0], 128, 42); });
  const TYPES = { hatch: { L: 4.05, H: 1.46, hood: 0.95, tail: 0.25, wb: 2.55, rw: 0.31 }, sedan: { L: 4.65, H: 1.42, hood: 1.15, tail: 0.85, wb: 2.75, rw: 0.32 },
    suv: { L: 4.6, H: 1.72, hood: 1.05, tail: 0.3, wb: 2.7, rw: 0.36 }, van: { L: 5.0, H: 1.95, hood: 0.7, tail: 0.1, wb: 3.0, rw: 0.34 } };
  function makeCar(seed, color, typeName) {
    const r = rng(seed), T = TYPES[typeName], g = new THREE.Group(), Wd = 1.8, L = T.L, H = T.H, rw = T.rw;
    const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1016, metalness: 0.3, roughness: 0.03, clearcoat: 1, envMapIntensity: 2.4 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.88 }), rim = new THREE.MeshStandardMaterial({ color: 0xbfc5cc, metalness: 0.9, roughness: 0.22 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 });
    const x0 = -L / 2, belt = 0.98, sh = new THREE.Shape();
    sh.moveTo(x0 + 0.1, 0.28); sh.lineTo(x0, 0.42); sh.lineTo(x0 + 0.02, 0.7); sh.quadraticCurveTo(x0 + 0.08, 0.86, x0 + 0.35, 0.88);
    sh.lineTo(x0 + T.hood, belt); sh.lineTo(x0 + T.hood + 0.75, H - 0.04); sh.quadraticCurveTo(x0 + T.hood + 0.85, H, x0 + T.hood + 1.0, H);
    sh.lineTo(L / 2 - T.tail - 0.55, H); sh.quadraticCurveTo(L / 2 - T.tail - 0.4, H - 0.02, L / 2 - T.tail - 0.3, H - 0.1);
    sh.lineTo(L / 2 - T.tail, belt + 0.02); sh.lineTo(L / 2 - 0.02, belt - 0.04); sh.lineTo(L / 2, 0.45); sh.lineTo(L / 2 - 0.1, 0.28);
    const ax = T.wb / 2; sh.lineTo(ax + rw + 0.08, 0.28); sh.absarc(ax, rw, rw + 0.08, 0, Math.PI, false); sh.lineTo(-ax + rw + 0.08, 0.28); sh.absarc(-ax, rw, rw + 0.08, 0, Math.PI, false); sh.lineTo(x0 + 0.1, 0.28);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: Wd - 0.18, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 }).translate(0, 0, -(Wd - 0.18) / 2), paint);
    body.castShadow = body.receiveShadow = true; g.add(body);
    const gh = new THREE.Shape(); gh.moveTo(x0 + T.hood + 0.06, belt + 0.03); gh.lineTo(x0 + T.hood + 0.76, H - 0.08); gh.lineTo(L / 2 - T.tail - 0.4, H - 0.08); gh.lineTo(L / 2 - T.tail - 0.04, belt + 0.05); gh.lineTo(x0 + T.hood + 0.06, belt + 0.03);
    const gl = new THREE.Mesh(new THREE.ExtrudeGeometry(gh, { depth: Wd - 0.04, bevelEnabled: false }).translate(0, 0, -(Wd - 0.04) / 2), glass); g.add(gl);
    for (const px of [x0 + T.hood + 1.45, L / 2 - T.tail - 0.95]) if (px < L / 2 - T.tail - 0.5) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.09, H - belt - 0.06, Wd + 0.01), paint); pl.position.set(px, (H + belt) / 2, 0); g.add(pl); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(sx * ax, rw, sz * (Wd / 2 - 0.16)); wg.name = 'wheel';
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(rw, rw, 0.24, 28).rotateX(Math.PI / 2), rubber); tyre.castShadow = true; wg.add(tyre);
      const rm = new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.66, rw * 0.66, 0.245, 24).rotateX(Math.PI / 2), rim); wg.add(rm);
      for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, rw * 1.2, 0.25), trim); sp.rotation.z = k * Math.PI * 2 / 5; wg.add(sp); } g.add(wg); }
    const lt = (c, e, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 0.6, roughness: 0.2 })); m.position.set(x, y, z); g.add(m); return m; };
    for (const sz of [-1, 1]) { lt(0xf4f4f0, 0xffffff, x0 + 0.02, 0.74, sz * 0.62, 0.36, 0.12); g.userData['rev' + sz] = lt(0x8a1010, 0xff1a10, L / 2 - 0.01, 0.82, sz * 0.66, 0.3, 0.14); }
    const pt = ['ABCDEFGHKLMNPRSTVWXY', '0123456789']; const plate = (r() * 20 | 0) + '' ; const reg = `${pt[0][r() * 20 | 0]}${pt[0][r() * 20 | 0]}${pt[1][r() * 10 | 0]}${pt[1][r() * 10 | 0]} ${pt[0][r() * 20 | 0]}${pt[0][r() * 20 | 0]}${pt[0][r() * 20 | 0]}`;
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: plateTex([reg, '#f4f4f0']), roughness: 0.4 })); fp.rotation.y = -Math.PI / 2; fp.position.set(x0 - 0.005, 0.5, 0); g.add(fp);
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: plateTex([reg, '#f6c800']), roughness: 0.4 })); bp.rotation.y = Math.PI / 2; bp.position.set(L / 2 + 0.005, 0.55, 0); g.add(bp);
    for (const sz of [-1, 1]) { const mr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.18), paint); mr.position.set(x0 + T.hood + 0.2, belt + 0.06, sz * (Wd / 2 + 0.06)); g.add(mr); }
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.05, Wd * 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 })); cs.position.y = 0.012; g.add(cs);
    return g; }
  const CARCOL = [0x8a8f96, 0x24272c, 0xa3221c, 0xe8e8e6, 0x2c4a78, 0x3d5c45, 0xb8b0a0, 0x5a1f2b, 0x0f0f10, 0xd8d8d2];
  const CARTYPES = ['hatch', 'sedan', 'suv', 'hatch', 'van', 'sedan', 'suv', 'hatch'];
  const cars = [];
  for (const [ri, rz, face] of [[0, PZ - 11, 1], [1, PZ - 17, -1], [2, PZ - 30, 1], [3, PZ - 36, -1]]) {
    for (let k = -12; k <= 12; k++) { const bx = exX + k * 2.6; if (Math.abs(bx - exX) < 4.2) continue;
      line(0.1, 5.0, bx - 1.3, rz + face * 0.2); if (k === 12) line(0.1, 5.0, bx + 1.3, rz + face * 0.2);
      if (hash(k * 7 + ri, 23) < 0.66) { const c = makeCar(1000 + ri * 50 + k, CARCOL[(hash(k, ri + 3) * CARCOL.length) | 0], CARTYPES[(hash(k + 9, ri) * CARTYPES.length) | 0]);
        c.rotation.y = face > 0 ? -Math.PI / 2 : Math.PI / 2; c.position.set(bx + (hash(k, 77) - 0.5) * 0.25, 0, rz + face * 0.25); park.add(c); cars.push({ c, k, ri, rz, face, x: bx }); } }
    line(25 * 2.6 + 0.2, 0.1, exX, rz + face * 2.7); }
  // pedestrian walkway to the door and the yellow hatched crossing
  for (let k = 0; k < 12; k++) line(4.0, 0.45, exX, PZ - 3 - k * 0.9, yelM);
  // kerb islands with grass and trees between the double rows
  for (const iz of [PZ - 23.5, PZ - 42.5]) for (const side of [-1, 1]) { const len = 26, cx = exX + side * (len / 2 + 4.5);
    const k1 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 2.0), concM); k1.position.set(cx, 0.08, iz); k1.receiveShadow = k1.castShadow = true; park.add(k1);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.02, 1.6), grassM); gr.position.set(cx, 0.17, iz); park.add(gr);
    for (let t = 0; t < 4; t++) { const tx = cx - len / 2 + 3 + t * 6.5; const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
      tr.position.set(tx, 1.2, iz); tr.castShadow = true; park.add(tr);
      const can = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshStandardMaterial({ color: [0x4b6b34, 0x5b7a3c, 0x3f5e2e][t % 3], roughness: 0.95, flatShading: true }));
      can.position.set(tx, 3.0, iz); can.scale.set(1, 1.15, 1); can.castShadow = true; park.add(can); } }
  // lamp posts
  for (const lz of [PZ - 14, PZ - 33]) for (const lx of [-22, -9, 9, 22]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 7, 10), mat.grey); pole.position.set(exX + lx, 3.5, lz); pole.castShadow = true; park.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), mat.grey); arm.position.set(exX + lx + 0.6, 6.95, lz); park.add(arm);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.32), new THREE.MeshStandardMaterial({ color: 0x777b82, emissive: 0xfff2d0, emissiveIntensity: 0.15 })); hd.position.set(exX + lx + 1.1, 6.85, lz); park.add(hd); }
  // trolley shelter with nested trolleys
  { const sx = exX + 7.5, sz = PZ - 6; const fr = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.steel); m.position.set(sx + x, y, sz + z); m.castShadow = true; park.add(m); };
    for (const x of [-2.6, 2.6]) for (const z of [-0.9, 0.9]) fr(0.08, 2.3, 0.08, x, 1.15, z); fr(5.4, 0.08, 2.0, 0, 2.3, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.04, 2.1), new THREE.MeshPhysicalMaterial({ color: 0xbfd6e6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 })); roof.position.set(sx, 2.36, sz); park.add(roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshStandardMaterial({ map: canvasTex(512, 104, (c) => { c.fillStyle = '#1d3f8f'; c.fillRect(0, 0, 512, 104); c.fillStyle = '#ffd400'; c.font = 'bold 54px DejaVu Sans'; c.textAlign = 'center'; c.fillText('TROLLEYS', 256, 72); }) }));
    sign.position.set(sx, 2.7, sz + 1.0); park.add(sign);
    for (let k = 0; k < 5; k++) { const t = trolley.clone(true); t.traverse(o => { if (o.name === 'flatbox') o.visible = false; }); t.rotation.y = Math.PI / 2; t.position.set(sx - 1.8 + k * 0.36, 0, sz); park.add(t); } }
  // facade: store front with a fictional sign and glazing
  { const fac = new THREE.Mesh(new THREE.BoxGeometry(MAZE_W + 2, 9, 1), new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.65, metalness: 0.1 })); fac.position.set(0, 4.5, PZ - 0.6); fac.receiveShadow = true; park.add(fac);
    const st = new THREE.Mesh(new THREE.BoxGeometry(MAZE_W + 2.1, 1.2, 1.05), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.55 })); st.position.set(0, 7.6, PZ - 0.6); park.add(st);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(18, 3), new THREE.MeshStandardMaterial({ map: canvasTex(1024, 170, (c) => { c.clearRect(0, 0, 1024, 170); c.fillStyle = '#ffd400'; c.font = 'bold 140px DejaVu Sans'; c.textAlign = 'center'; c.fillText('DAEDALUS', 512, 140); }), transparent: true, emissive: 0xffd400, emissiveIntensity: 0.25 }));
    sg.position.set(exX, 5.3, PZ - 1.12); sg.rotation.y = Math.PI; park.add(sg);
    for (let k = -6; k <= 6; k++) { if (Math.abs(k) < 1) continue; const wnd = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshPhysicalMaterial({ color: 0x0d1a2b, roughness: 0.04, metalness: 0.6, envMapIntensity: 2 }));
      wnd.position.set(exX + k * 4.2, 1.6, PZ - 1.12); wnd.rotation.y = Math.PI; park.add(wnd); } }
  // moving extras: a runaway trolley, and one car reversing out of its bay
  const runaway = trolley.clone(true); runaway.traverse(o => { if (o.name === 'flatbox') o.visible = false; }); park.add(runaway);
  const reverser = cars.filter(c => c.ri === 0).sort((a, b) => Math.abs(a.x - exX - 7) - Math.abs(b.x - exX - 7))[0];
  const skyTex = canvasTex(512, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6f8aa6'); g.addColorStop(0.55, '#b9c7d3'); g.addColorStop(1, '#dfe4e8'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = rng(19); for (let i = 0; i < 26; i++) { const x = r() * w, y = h * (0.15 + r() * 0.45), rr = 30 + r() * 70, gg = c.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gg; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); } });
  // ---------------------------------------------------------------- particles: dust motes (indoor light), MINO steam
  const softTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const NDUST = 700, dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDUST * 3), 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.035, map: softTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9c4 })); scene.add(dust); dust.frustumCulled = false;
  const NSTEAM = 70, steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSTEAM * 3), 3)); steamGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NSTEAM * 3), 3));
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ size: 0.42, map: softTex, transparent: true, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending })); scene.add(steam); steam.frustumCulled = false;
  function updateParticles(f, P, pacOn, outside, mOn) {
    dust.visible = !pacOn && !outside; if (dust.visible) { const a = dustGeo.attributes.position, c = camera.position;
      for (let i = 0; i < NDUST; i++) { const t = f / FPS, bx = hash(i, 1) * 14, by = hash(i, 2) * 2.8, bz = hash(i, 3) * 14;
        const x = bx + Math.sin(t * 0.21 + i) * 0.4 + t * 0.05, y = (by + t * 0.03 * (hash(i, 4) - 0.4) + 2.8) % 2.8 + 0.1, z = bz + Math.cos(t * 0.17 + i * 1.3) * 0.4;
        a.setXYZ(i, c.x - 7 + ((x % 14) + 14) % 14, y, c.z - 7 + ((z % 14) + 14) % 14); } a.needsUpdate = true; }
    steam.visible = mOn && !pacOn; if (steam.visible) { const Mp = posAt(SM[f]), hM = headAt(SM[f]), a = steamGeo.attributes.position, col = steamGeo.attributes.color;
      for (let i = 0; i < NSTEAM; i++) { const life = 40, age = ((f + i * 9) % life) / life, side = i % 2 ? 1 : -1, puff = 0.6 + 0.8 * env('kick', f - Math.floor(age * life));
        const x = Mp.x - hM.x * 0.25 + (-hM.z) * 0.22 * side + Math.sin(i * 3.1 + f * 0.05) * 0.15 * age, z = Mp.z - hM.z * 0.25 + hM.x * 0.22 * side + Math.cos(i * 2.3 + f * 0.04) * 0.15 * age;
        a.setXYZ(i, x - hM.x * age * 0.6, 1.62 + age * 1.3 * puff, z - hM.z * age * 0.6); const b = (1 - age) * 0.5; col.setXYZ(i, b, b, b); } a.needsUpdate = col.needsUpdate = true; }
  }
""" + s[a1:]

# ---------------------------------------------------------------- motion blur pass (before the final grade pass)
R("  composer.addPass(finalPass); composer.addPass(new X.OutputPass());",
r"""  const mblur = new X.ShaderPass({ uniforms: { tDiffuse: { value: null }, uVel: { value: new THREE.Vector2() }, uRad: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uVel; uniform float uRad; varying vec2 vUv;
      void main(){ vec2 v = uVel + uRad * (vUv - 0.5); vec4 acc = vec4(0.0); float wsum = 0.0;
        for (int i = 0; i < 9; i++) { float t = float(i) / 8.0 - 0.5; float w = 1.0 - abs(t); acc += texture2D(tDiffuse, vUv + v * t) * w; wsum += w; }
        gl_FragColor = acc / wsum; }` });
  composer.addPass(mblur);
  composer.addPass(finalPass); composer.addPass(new X.OutputPass());
  const prevCam = new THREE.PerspectiveCamera(50, ASPECT, 0.1, 900);
  function motionBlur(f, cam, mode) {
    mblur.enabled = false; if (f < 1) return; const pc = cameraAt(f - 1);
    if (pc.mode !== mode && (HARD.has(mode) || HARD.has(pc.mode))) return;
    prevCam.position.copy(pc.pos); prevCam.lookAt(pc.look); prevCam.fov = pc.fov; prevCam.aspect = ASPECT; prevCam.updateProjectionMatrix(); prevCam.updateMatrixWorld();
    const focus = cam.look.clone(), a = focus.clone().project(prevCam), b = focus.clone().project(camera);
    const vel = new THREE.Vector2((b.x - a.x) * 0.5, (b.y - a.y) * 0.5).multiplyScalar(0.55);
    const fwd = camera.getWorldDirection(V3()), dist = Math.max(1, cam.pos.distanceTo(cam.look)), rad = cam.pos.clone().sub(pc.pos).dot(fwd) / dist * 0.18;
    if (vel.length() > 0.12 || Math.abs(rad) > 0.15) return;          // a cut, not motion
    if (vel.length() < 0.0015 && Math.abs(rad) < 0.002) return;
    mblur.uniforms.uVel.value.copy(vel.clampLength(0, 0.035)); mblur.uniforms.uRad.value = clamp(rad, -0.04, 0.04); mblur.enabled = true; }""")

# ---------------------------------------------------------------- per-frame wiring
R("    park.visible = (outside || mapView || mode === 'EXT' || f >= F.hudOff) && !pacOn; doorGlow.visible = !pacOn; fourPoster.visible = fourPoster.visible;",
r"""    park.visible = (outside || mapView || mode === 'EXT' || f >= F.hudOff) && !pacOn; doorGlow.visible = !pacOn; fourPoster.visible = fourPoster.visible;
    // wheels roll with distance travelled
    trolley.traverse(o => { if (o.name === 'wheel') o.rotation.x = -S[f] / 0.06; });
    if (park.visible) {
      const tr = (f - F.ext) / FPS; runaway.visible = tr > -1;
      const rx = exX + 16 - Math.max(0, tr) * 1.1, rz = PZ - 20 + Math.sin(Math.max(0, tr) * 0.35) * 1.5; runaway.position.set(rx, 0, rz);
      runaway.rotation.y = -Math.PI / 2 + 0.12 * Math.sin(Math.max(0, tr) * 0.35) + 0.04 * Math.sin(f * 0.6); runaway.traverse(o => { if (o.name === 'wheel') o.rotation.x = Math.max(0, tr) * 1.1 / 0.06; });
      if (reverser) { const tv = (f - F.ext - 30) / FPS, e = smoother(tv / 5), C = reverser.c; C.position.z = reverser.rz + reverser.face * 0.25 - reverser.face * e * 4.0;
        C.position.x = reverser.x + e * e * 1.2; C.rotation.y = (reverser.face > 0 ? -Math.PI / 2 : Math.PI / 2) + e * e * 0.35;
        C.traverse(o => { if (o.name === 'wheel') o.rotation.z = -e * 4.0 / 0.32; }); for (const k of ['rev-1', 'rev1']) if (C.userData[k]) C.userData[k].material.emissiveIntensity = tv > 0 && tv < 5.5 ? 2.2 : 0.6; } }
    updateParticles(f, P, pacOn, outside, mOn);""")
R("    scene.background = pacOn ? new THREE.Color(0) : outside ? skyExt : sky;", "    scene.background = pacOn ? new THREE.Color(0) : outside || mode === 'EXT' ? skyTex : sky;\n    sun.intensity = outside ? 2.4 : 0.9; if (outside) sun.position.copy(P).add(V3(-8, 16, 10));")
R("    composer.render();\n    renderer.getContext().finish();", "    motionBlur(f, cam, mode);\n    composer.render();\n    renderer.getContext().finish();")
open(p, 'w').write(s); print('patched v9e')
