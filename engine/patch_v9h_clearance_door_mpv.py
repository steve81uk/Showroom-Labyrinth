#!/usr/bin/env python3
"""Engine v9h: fixes from the v9g master review (Stephen, 2026-11-13).
1. Walkway clearance: every furniture placement is tested against Wolfgang's swept route (trolley and MINO
   included, 0.95 m radius around the route line) and dropped if it intrudes. Tags follow their anchor piece.
2. Camera clearance: instancing moves to just before rendering, where the camera path exists. Furniture within
   0.6 m of any low (in-maze) camera position is dropped, so FPV never sits inside a bed post.
3. Real exit: the facade gets a door opening and automatic sliding glass doors that open as he approaches and
   close behind him. The frosted glow plane fades as the doors open.
4. Hero car: the CC-BY CarConcept is removed. Replaced by an original compact MPV built with the engine's own car
   modeller, using Touran proportions (Stephen's car); no badges, no manufacturer styling, fictional plate."""
import sys
p = 'labyrinth_renderer.js'; s = open(p).read()
def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'anchor count {c} != {n}: {a[:100]!r}')
    s = s.replace(a, b)

# ---- 1. swept-route clearance in placeFurn
R("""  const placeFurn = (n, wx, wz, wry, lx, lz, lr, ly = 0) => { const v = V3(lx, 0, lz).applyAxisAngle(V3(0, 1, 0), wry);
    FURN[n].placements.push(new THREE.Matrix4().compose(V3(wx + v.x, ly, wz + v.z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), wry + lr), V3(1, 1, 1))); };""",
r"""  // swept route of Wolfgang + trolley + MINO: furniture footprints must stay clear of it
  const SWEEP = []; for (let s_ = 0; s_ <= LDOOR + 2; s_ += 0.2) SWEEP.push(posAt(s_));
  const inFoot = (px, pz, cx, cz, th, hx, hz) => { const dx = px - cx, dz = pz - cz, c_ = Math.cos(th), s_ = Math.sin(th);
    return Math.abs(dx * c_ - dz * s_) <= hx && Math.abs(dx * s_ + dz * c_) <= hz; };
  let furnDropRoute = 0, furnDropCam = 0;
  const placeFurn = (n, wx, wz, wry, lx, lz, lr, ly = 0, clear = 0.95) => { const v = V3(lx, 0, lz).applyAxisAngle(V3(0, 1, 0), wry);
    const cx = wx + v.x, cz = wz + v.z, th = wry + lr, sz = FURN[n].size;
    if (ly < 2.2 && clear > 0 && SWEEP.some(q => inFoot(q.x, q.z, cx, cz, th, sz.x / 2 + clear, sz.z / 2 + clear))) { furnDropRoute++; return false; }
    FURN[n].placements.push(new THREE.Matrix4().compose(V3(cx, ly, cz), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), th), V3(1, 1, 1))); return true; };""")
R("ly = on && FURN[on] ? FURN[on].size.y : 0; placeFurn(mn, wx, wz, ry, lx, lz, lr, ly); if (!first) first = { mn, lx, lz, dep, h: sz.y }; }",
  "ly = on && FURN[on] ? FURN[on].size.y : 0; if (placeFurn(mn, wx, wz, ry, lx, lz, lr, ly) && !first) first = { mn, lx, lz, dep, h: sz.y }; }")
R("        tags.push({ p: toW(first.lx + 0.25, Math.min(1.0, first.h * 0.75), first.lz + first.dep / 2 + 0.02), ry, cell: c, kind: kit2 });",
  "        if (first) tags.push({ p: toW(first.lx + 0.25, Math.min(1.0, first.h * 0.75), first.lz + first.dep / 2 + 0.02), ry, cell: c, kind: kit2 });")

# ---- 2. defer instancing until the camera path exists; drop pieces the camera would pass through
a0 = "  const furnInst = []; let furnCount = 0;\n"
a1 = "  let furnTris = 0; Object.values(FURN).forEach(F_ => F_.parts.forEach(pp => { const g = pp.geo; furnTris += (g.index ? g.index.count : g.attributes.position.count) / 3 * F_.placements.length; }));\n"
i0, i1 = s.index(a0), s.index(a1)
body = s[i0 + len(a0):i1]
s = s[:i0] + "  const furnInst = []; let furnCount = 0, furnTris = 0;\n" + r"""  function buildFurnInstances() {
    const CAMS = []; for (let f = 0; f < N; f += 2) { const cp = cameraAt(f).pos; if (cp.y < 3.2 && cp.z > -MAZE_D / 2 - 0.5) CAMS.push(cp.clone()); }
    for (const F_ of Object.values(FURN)) F_.placements = F_.placements.filter(pm => { const e = pm.elements; if (e[13] > 2.2) return true;
      const th = Math.atan2(e[8], e[0]), hx = F_.size.x / 2 + 0.6, hz = F_.size.z / 2 + 0.6;
      const hit = CAMS.some(q => q.y < F_.size.y + e[13] + 0.6 && inFoot(q.x, q.z, e[12], e[14], th, hx, hz)); if (hit) furnDropCam++; return !hit; });
""" + body.replace("\n  ", "\n    ") + "    " + a1.strip() + "\n  }\n" + s[i1 + len(a1):]
R("  let lastCam = null;\n  async function renderFrame(f) {", "  buildFurnInstances();\n  let lastCam = null;\n  async function renderFrame(f) {")

# ---- 3. facade door opening + automatic sliding doors
R("  { const fac = new THREE.Mesh(new THREE.BoxGeometry(MAZE_W + 2, 9, 1), new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.65, metalness: 0.1 })); fac.position.set(0, 4.5, PZ - 0.6); fac.receiveShadow = true; park.add(fac);",
r"""  { const facM = new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.65, metalness: 0.1 }), FW = MAZE_W + 2, xl = -FW / 2, xr = FW / 2, dl = exX - DOOR_W / 2, dr = exX + DOOR_W / 2;
    for (const [x0_, x1_] of [[xl, dl], [dr, xr]]) { const fac = new THREE.Mesh(new THREE.BoxGeometry(x1_ - x0_, 9, 1), facM); fac.position.set((x0_ + x1_) / 2, 4.5, PZ - 0.6); fac.receiveShadow = fac.castShadow = true; park.add(fac); }
    const hdr = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 9 - DOOR_H, 1), facM); hdr.position.set(exX, DOOR_H + (9 - DOOR_H) / 2, PZ - 0.6); hdr.castShadow = true; park.add(hdr);
    const frM = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.35, metalness: 0.8 }), glM = new THREE.MeshPhysicalMaterial({ color: 0xbfd3dc, metalness: 0, roughness: 0.04, transmission: 0.0, transparent: true, opacity: 0.32, envMapIntensity: 2.2 });
    for (const sd of [-1, 1]) { const leaf = new THREE.Group(); const pw = DOOR_W / 2;
      const gl_ = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.08, DOOR_H - 0.14, 0.02), glM); gl_.position.y = DOOR_H / 2; leaf.add(gl_);
      for (const [w_, h_, x_, y_] of [[pw, 0.07, 0, 0.035], [pw, 0.07, 0, DOOR_H - 0.035], [0.05, DOOR_H, -pw / 2 + 0.025, DOOR_H / 2], [0.05, DOOR_H, pw / 2 - 0.025, DOOR_H / 2], [0.3, 0.03, sd * -(pw / 2 - 0.25), 1.05]])
        { const b_ = new THREE.Mesh(new THREE.BoxGeometry(w_, h_, 0.06), frM); b_.position.set(x_, y_, 0); b_.castShadow = true; leaf.add(b_); }
      leaf.userData.closedX = exX + sd * pw / 2; leaf.userData.sd = sd; leaf.position.set(leaf.userData.closedX, 0, PZ - 0.6); park.add(leaf); doorLeaves.push(leaf); }
    const trk = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 2, 0.18, 0.3), frM); trk.position.set(exX, DOOR_H + 0.09, PZ - 0.6); park.add(trk);""")
R("  const doorGlow = new THREE.Mesh(",
  "  const DOOR_W = CS * 0.4, DOOR_H = 2.7, doorLeaves = [];\n  const doorGlow = new THREE.Mesh(")
R("    const outside = f >= doorFrame;",
r"""    const outside = f >= doorFrame;
    { const d_ = S[f] - LDOOR, op = smooth(clamp((d_ + 3.4) / 1.6, 0, 1)) * (1 - smooth(clamp((d_ - 3.2) / 1.6, 0, 1)));
      for (const lf of doorLeaves) lf.position.x = lf.userData.closedX + lf.userData.sd * op * (DOOR_W / 2 - 0.06);
      doorGlow.material.opacity = 0.85 * (1 - op); doorGlow.visible = op < 0.98; }""")

# ---- 4. original hero MPV (Touran proportions) replaces the CC-BY CarConcept
R("suv: { L: 4.6, H: 1.72, hood: 1.05, tail: 0.3, wb: 2.7, rw: 0.36 },",
  "suv: { L: 4.6, H: 1.72, hood: 1.05, tail: 0.3, wb: 2.7, rw: 0.36 }, mpv: { L: 4.53, H: 1.66, hood: 0.9, tail: 0.08, wb: 2.79, rw: 0.33 },")
R("const pillars = typeName === 'van' ? [x0 + T.hood + 1.5] : typeName === 'hatch' ? [x0 + T.hood + 1.42] : [x0 + T.hood + 1.5, L / 2 - T.tail - 0.95];",
  "const pillars = typeName === 'van' ? [x0 + T.hood + 1.5] : typeName === 'hatch' ? [x0 + T.hood + 1.42] : typeName === 'mpv' ? [x0 + T.hood + 1.45, L / 2 - T.tail - 0.82] : [x0 + T.hood + 1.5, L / 2 - T.tail - 0.95];")
R("if (typeName === 'suv' || typeName === 'van') for (const sz of [-1, 1])", "if (typeName === 'suv' || typeName === 'van' || typeName === 'mpv') for (const sz of [-1, 1])")
h0 = s.index("  // hero car: Khronos 'Car Concept' (CC-BY 4.0), in the bay beside the walkway")
h1 = s.index("  // moving extras: a runaway trolley, and one car reversing out of its bay")
s = s[:h0] + r"""  // hero car: an original compact MPV (Touran proportions, Stephen's own car), no badges, in the bay beside the walkway
  { const bayK = 3, slot = cars.find(c => c.ri === 0 && c.k === bayK); if (slot) { park.remove(slot.c); cars.splice(cars.indexOf(slot), 1); }
    const hm = makeCar(81081, HERO_COL, 'mpv'); hm.rotation.y = -Math.PI / 2; hm.position.set(exX + bayK * 2.6, 0, PZ - 11 + 0.25); park.add(hm); window.__heroCar = 'mpv'; }
""" + s[h1:]
R("  const CARCOL = [", "  const HERO_COL = 0x2b3a4e;   // deep slate blue metallic; change here to match the real car\n  const CARCOL = [")
R("hero_car: !!window.__heroCar,", "hero_car: window.__heroCar || false, furn_dropped_route: furnDropRoute, furn_dropped_cam: furnDropCam,")
open(p, 'w').write(s); print('patched v9h')
# (applied after first test) the per-frame visibility line re-enabled the glow plane; respect its fade
s = open(p).read(); s = s.replace("doorGlow.visible = !pacOn;", "doorGlow.visible = !pacOn && doorGlow.material.opacity > 0.02;"); open(p, 'w').write(s)
# (applied after second test) the hudOff glow ramp also wrote the opacity; multiply it by (1 - doorOpen)
s = open(p).read()
s = s.replace("const DOOR_W = CS * 0.4, DOOR_H = 2.7, doorLeaves = [];", "const DOOR_W = CS * 0.4, DOOR_H = 2.7, doorLeaves = []; let doorOpen = 0;", 1)
s = s.replace("      doorGlow.material.opacity = 0.85 * (1 - op); doorGlow.visible = op < 0.98; }", "      doorOpen = op; }", 1)
s = s.replace("    doorGlow.material.opacity = f >= F.hudOff ? 0.6 + 0.4 * smooth((f - F.hudOff) / 60) : 0.25;", "    doorGlow.material.opacity = (f >= F.hudOff ? 0.6 + 0.4 * smooth((f - F.hudOff) / 60) : 0.25) * (1 - doorOpen);", 1)
open(p, 'w').write(s)
