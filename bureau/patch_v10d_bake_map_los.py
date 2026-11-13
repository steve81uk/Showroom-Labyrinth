"""v10d patch: baked-lighting display mode, contact-shadow approximation, MINO line-of-sight + occluded sensor fan,
arcade floor-plan map (full-screen MAP check-ins and QA inset), map/3D correspondence telemetry, comparison render.
Applies to bureau_scene.js (browser scene) and bureau_render.js (imports, page HTML). Exact-anchor replace; fails loudly."""
import re, sys
P = 'bureau_scene.js'; s = open(P).read()
def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'[patch] anchor found {n}x (want {count}): {old[:90]!r}')
    s = s.replace(old, new)

# ---- flags
rep("const W = +Q.get('w') || 1920, H = +Q.get('h') || 1080, DEBUG = Q.get('debug') === '1';",
    "const W = +Q.get('w') || 1920, H = +Q.get('h') || 1080, DEBUG = Q.get('debug') === '1';\n"
    "  const BAKE = Q.get('bake') === '1', CMP = Q.get('cmp') === '1', LMFLIP = Q.get('lmflip') === '1', QA = Q.get('qa') === '1', QASHOT = Q.get('qashot') || '';")
# ---- floor planes collected for planar lightmap UVs
rep("const RELOC = [], LURE = [], ZLAB = [];", "const RELOC = [], LURE = [], ZLAB = [], FLOORS = [], BINM = [];")
rep("fl.receiveShadow = true; store.add(fl);", "fl.receiveShadow = true; store.add(fl); FLOORS.push(fl);")
rep("p.receiveShadow = true; store.add(p);", "p.receiveShadow = true; store.add(p); FLOORS.push(p);")
# ---- grey-block bins kept by reference so bake mode can swap them for the baked glb
rep("for (const k in bins) { const m = new THREE.Mesh(merge(bins[k]), MAT[k]); m.castShadow = true; m.receiveShadow = true; store.add(m); }",
    """for (const k in bins) { const m = new THREE.Mesh(merge(bins[k]), MAT[k]); m.castShadow = true; m.receiveShadow = true; store.add(m); BINM.push(m); }
  // ---------------------------------------------------------------- v10d BAKE: Blender Cycles irradiance lightmaps (bureau/bake, see DECISIONS.md)
  // Maps hold irradiance only (no albedo). MeshBasicMaterial (r169): indirectDiffuse = map * intensity / PI, then *= colour,
  // so intensity = PI displays albedo x irradiance exactly once and scene lights cannot double-light the store.
  let BK = null;
  if (BAKE) { BK = await (await fetch('bureau/bake/bake_v2.json')).json();
    const exr = new X.EXRLoader(); exr.setDataType(THREE.HalfFloatType);
    const [lmS, lmF, glb] = await Promise.all([exr.loadAsync('bureau/bake/lm_solids.exr'), exr.loadAsync('bureau/bake/lm_floor.exr'), new X.GLTFLoader().loadAsync('bureau/bake/solids.glb')]);
    for (const t of [lmS, lmF]) { t.channel = 1; t.colorSpace = THREE.LinearSRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; }
    BINM.forEach(m => { store.remove(m); m.geometry.dispose(); });
    const used = {}; let uv1n = 0;
    glb.scene.traverse(o => { if (!o.isMesh) return; const nm = (o.material.name || '').replace(/\\.\\d+$/, ''); used[nm] = (used[nm] || 0) + 1; if (o.geometry.attributes.uv1) uv1n++;
      if (LMFLIP) { const a = o.geometry.attributes.uv1; for (let i = 0; i < a.count; i++) a.setY(i, 1 - a.getY(i)); }
      o.material = new THREE.MeshBasicMaterial({ color: (MAT[nm] || MAT.large).color.clone(), lightMap: lmS, lightMapIntensity: Math.PI }); o.userData.baked = true; });
    glb.scene.userData.baked = true; store.add(glb.scene);
    for (const p of FLOORS) { p.updateMatrixWorld(true); const g = p.geometry, pa = g.attributes.position, uv = new Float32Array(pa.count * 2), v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(p.matrixWorld); uv[i * 2] = (v.x + 36) / 72; const vb = (26 - v.z) / 52; uv[i * 2 + 1] = LMFLIP ? vb : 1 - vb; }
      g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2)); p.material = new THREE.MeshBasicMaterial({ color: p.material.color.clone(), lightMap: lmF, lightMapIntensity: Math.PI }); p.userData.baked = true; }
    window.bakeInfo = { three: THREE.REVISION, glbMaterials: used, meshesWithUv1: uv1n, lmSolids: [lmS.image.width, lmS.image.height], lmFloor: [lmF.image.width, lmF.image.height],
      type: lmS.type === THREE.HalfFloatType ? 'HalfFloat' : lmS.type, flipY: lmS.flipY, channel: lmS.channel, colorSpace: lmS.colorSpace, lmflip: LMFLIP }; }""")
# ---- additive lamp pools would double-light a baked floor
rep("store.add(new THREE.Mesh(merge(pg), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }))); }",
    "{ const pm = new THREE.Mesh(merge(pg), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })); pm.visible = !BAKE; store.add(pm); } }")
# ---- MINO line of sight: walls, tall units and closed doors block the sensor (detection and the drawn fan)
rep("  // sensor yaw per frame:", """  const OCC = WD.solids.filter(s => s.h >= 1.4);
  const doorR = d => d.axis === 'x' ? { x0: d.x - d.w / 2, z0: d.z - 0.08, x1: d.x + d.w / 2, z1: d.z + 0.08 } : { x0: d.x - 0.08, z0: d.z - d.w / 2, x1: d.x + 0.08, z1: d.z + d.w / 2 };
  const segRect = (ax, az, bx, bz, r) => { let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return 1; } else { const t = q / p; if (p < 0) { if (t > t1) return 1; if (t > t0) t0 = t; } else { if (t < t0) return 1; if (t < t1) t1 = t; } } } return t0; };
  const rayLen = (ax, az, ang, L, f) => { const bx = ax + Math.sin(ang) * L, bz = az + Math.cos(ang) * L; let t = 1;
    for (const r of OCC) t = Math.min(t, segRect(ax, az, bx, bz, r)); WD.doors.forEach((d, di) => { if (TL.door_open[di][f] < 0.5) t = Math.min(t, segRect(ax, az, bx, bz, doorR(d))); }); return t * L; };
  const los = (m, w, f) => { const L = Math.hypot(w.x - m.x, w.z - m.z); return rayLen(m.x, m.z, Math.atan2(w.x - m.x, w.z - m.z), L, f) >= L - 1e-3; };
  window.losAt = f => { const m = minoXZ(f), w = posAt(S[f]); return m ? los(m, w, f) : null; };
  // sensor yaw per frame:""")
rep("Math.abs(d) < 0.25 && m.distanceTo(w) < 16) DETECT = f; }", "Math.abs(d) < 0.25 && m.distanceTo(w) < 16 && los(m, w, f)) DETECT = f; }")
rep("fan.rotation.x = -Math.PI / 2; const fanPivot = new THREE.Group(); fanPivot.add(fan); scene.add(fanPivot);",
    """fan.rotation.x = -Math.PI / 2; const fanPivot = new THREE.Group(); fanPivot.add(fan); scene.add(fanPivot); fan.visible = false;
  // occluded fan: 25 rays from MINO, each stopped by the first wall / tall unit / closed door (same rays feed the map)
  const FANR = 25, FANA = 0.3, FANL = 11, fanG = new THREE.BufferGeometry(); fanG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((FANR - 1) * 9), 3));
  const fan2 = new THREE.Mesh(fanG, fan.material); fan2.frustumCulled = false; fanPivot.add(fan2); const FANPTS = [];
  const updateFan = (m, yawS, f) => { const pa = fanG.attributes.position.array; FANPTS.length = 0;
    for (let i = 0; i < FANR; i++) { const a = -FANA + 2 * FANA * i / (FANR - 1), L = rayLen(m.x, m.z, yawS + a, FANL, f); FANPTS.push([m.x + Math.sin(yawS + a) * L, m.z + Math.cos(yawS + a) * L, a, L]); }
    for (let i = 0; i < FANR - 1; i++) { const [, , a0, l0] = FANPTS[i], [, , a1, l1] = FANPTS[i + 1]; pa.set([0, 0, 0, Math.sin(a0) * l0, 0, Math.cos(a0) * l0, Math.sin(a1) * l1, 0, Math.cos(a1) * l1], i * 9); }
    fanG.attributes.position.needsUpdate = true; };""")
rep("fanPivot.position.set(m.x, 0.04, m.z); fanPivot.rotation.y = SENS[f];", "fanPivot.position.set(m.x, 0.04, m.z); fanPivot.rotation.y = SENS[f]; updateFan(m, SENS[f], f);")
# ---- shots: MAP rows become arcade map check-ins; QA can force a cinematic camera
rep("if (mode === 'BLACK') return 'black';", "if (QASHOT) return QASHOT; if (mode === 'BLACK') return 'black'; if (mode === 'MAP') return 'map';")
rep("if (shot === 'over') return Object.assign(overAt(f), { shot });", "if (shot === 'over' || shot === 'map') return Object.assign(overAt(f), { shot });")
# ---- contact shadows + map + frame hooks
rep("  // ---------------------------------------------------------------- post: bloom", """  // ---------------------------------------------------------------- v10d contact shadows (PRACTICAL APPROXIMATION: soft blobs; the baked store does not receive real-time shadow maps)
  const blobTex = canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.55, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
  blobTex.colorSpace = THREE.NoColorSpace;
  const blob = (sx, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    const g = new THREE.Group(); g.add(m); g.visible = BAKE; scene.add(g); return g; };
  const wBlob = blob(1.25, 1.25), tBlob = blob(0.95, 1.35), mBlob = blob(1.9, 2.3);
  // ---------------------------------------------------------------- v10d arcade floor-plan map. Every marker is read back from the live 3D objects (same transforms).
  const mapC = $('map'), mx = mapC.getContext('2d'); mapC.width = W; mapC.height = H;
  const MAPB = { x0: -37, x1: 37, z0: -31, z1: 28 };
  const mapProj = mode => { const full = mode === 'full'; const rx = full ? 0.04 * W : W * 0.6, ry = full ? 0.13 * H : 0.1 * H, rw = full ? 0.92 * W : W * 0.38, rh = full ? 0.8 * H : 0.8 * H;
    const sc = Math.min(rw / (MAPB.x1 - MAPB.x0), rh / (MAPB.z1 - MAPB.z0)); const ox = rx + (rw - sc * (MAPB.x1 - MAPB.x0)) / 2, oy = ry + (rh - sc * (MAPB.z1 - MAPB.z0)) / 2;
    return { sc, ox, oy, x: x => ox + (x - MAPB.x0) * sc, z: z => oy + (z - MAPB.z0) * sc }; };
  const marker = new Image(); marker.src = 'bureau/assets/wolfgang_map_marker.png'; await new Promise(r => { marker.onload = r; marker.onerror = r; });
  const C = { bg: '#0d313a', floor: '#124651', grid: '#1a5763', wall: '#efe9dc', unit: '#d9c49a', unitS: '#8a7346', dark: '#2a2f35', copper: '#c27c3a', mustard: '#d9ad3c', amber: '#ffb11f', red: '#ff3324', ink: '#f4efe4' };
  const zoneLabel = { entrance: 'CHECKOUT', bedrooms: 'BEDROOMS', kitchens: 'KITCHENS', hall: 'EXIT HALL', wardrobes: 'WARDROBES', service: 'SERVICE', core: 'THE CORE' };
  let mapStatic = null, mapStaticMode = '';
  const drawStatic = (mode) => { const P = mapProj(mode), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    if (mode === 'full') { g.fillStyle = C.bg; g.fillRect(0, 0, W, H); } else { g.fillStyle = C.bg + 'f2'; g.fillRect(W * 0.585, 0.06 * H, W * 0.405, 0.88 * H); }
    g.fillStyle = C.floor; g.fillRect(P.x(-36), P.z(-26), 72 * P.sc, 52 * P.sc);
    g.strokeStyle = C.grid; g.lineWidth = 1; for (let x = -36; x <= 36; x += 4) { g.beginPath(); g.moveTo(P.x(x), P.z(-26)); g.lineTo(P.x(x), P.z(26)); g.stroke(); } for (let z = -26; z <= 26; z += 4) { g.beginPath(); g.moveTo(P.x(-36), P.z(z)); g.lineTo(P.x(36), P.z(z)); g.stroke(); }
    for (const zn of WD.zones) { g.fillStyle = C.mustard + '99'; g.font = `700 ${Math.max(10, P.sc * 0.95)}px "DejaVu Sans"`; g.textAlign = 'center'; g.fillText(zoneLabel[zn.id] || zn.id.toUpperCase(), P.x((zn.x0 + zn.x1) / 2), P.z(zn.z0) + P.sc * 1.6); }
    for (const sd of WD.solids) { const wall = sd.layer === 'wall', dk = /checkout|desk|wardrobe|tall|closet|cleaning|bench|cage|barrier|trolley_bay/.test(sd.kind);
      g.fillStyle = wall ? C.wall : sd.kind === 'bed_anchor' ? '#b3261e' : dk ? C.dark : C.unit; g.fillRect(P.x(sd.x0), P.z(sd.z0), Math.max(1.5, (sd.x1 - sd.x0) * P.sc), Math.max(1.5, (sd.z1 - sd.z0) * P.sc));
      if (!wall) { g.strokeStyle = dk ? '#55606a' : C.unitS; g.lineWidth = 1; g.strokeRect(P.x(sd.x0), P.z(sd.z0), (sd.x1 - sd.x0) * P.sc, (sd.z1 - sd.z0) * P.sc); } }
    // frame: double copper rule with notched corners (original border treatment)
    const fx0 = P.x(-36) - P.sc * 0.8, fz0 = P.z(-26) - P.sc * 0.8, fw = 72 * P.sc + P.sc * 1.6, fh = 52 * P.sc + P.sc * 1.6;
    g.strokeStyle = C.copper; g.lineWidth = 3; g.strokeRect(fx0, fz0, fw, fh); g.lineWidth = 1; g.strokeRect(fx0 - 6, fz0 - 6, fw + 12, fh + 12);
    for (const [cx, cz] of [[fx0, fz0], [fx0 + fw, fz0], [fx0, fz0 + fh], [fx0 + fw, fz0 + fh]]) { g.fillStyle = C.copper; g.fillRect(cx - 7, cz - 7, 14, 14); g.fillStyle = C.bg; g.fillRect(cx - 3, cz - 3, 6, 6); }
    return c; };
  const MAPCHK = new Int32Array(N); { let k = 0, prev = ''; for (let f = 0; f < N; f++) { const m = telAt(f).camera_mode; if (m === 'MAP' && prev !== 'MAP') k++; MAPCHK[f] = m === 'MAP' ? k : 0; prev = m; } }
  const v3w = new THREE.Vector3(), mapLog = {};
  function drawMap(f, mode) { if (!mode) { mapC.style.display = 'none'; return; } mapC.style.display = 'block'; scene.updateMatrixWorld(true);
    if (mapStaticMode !== mode) { mapStatic = drawStatic(mode); mapStaticMode = mode; } const P = mapProj(mode); mx.clearRect(0, 0, W, H); mx.drawImage(mapStatic, 0, 0);
    // doors: drawn from the live leaf transforms
    for (const D of DOORS) { const o = TL.door_open[D.di][f], hw = D.d.w / 2; mx.strokeStyle = o < 0.02 ? C.copper : C.mustard; mx.lineWidth = Math.max(3, P.sc * 0.22); mx.lineCap = 'round';
      for (const lf of D.leaves) { const a = lf.localToWorld(v3w.set(lf.userData.swing ? 0 : -hw / 2, 0, 0)).clone(), b = lf.localToWorld(v3w.set(lf.userData.swing ? D.d.w : hw / 2, 0, 0)).clone();
        mx.beginPath(); mx.moveTo(P.x(a.x), P.z(a.z)); mx.lineTo(P.x(b.x), P.z(b.z)); mx.stroke(); } }
    // thread: the same route samples and side offset as the 3D ribbon
    const th = TL.thread[f]; if (th) { mx.save(); mx.strokeStyle = C.amber; mx.lineWidth = Math.max(2.5, P.sc * 0.2); mx.shadowColor = C.amber; mx.shadowBlur = 10; mx.lineJoin = 'round'; mx.beginPath();
      for (let s = th[0], i = 0; s <= th[1] + 1e-6; s += 0.25, i++) { const p = posAt(Math.min(s, th[1])), t = headAt(Math.min(s, th[1])), x = p.x - t.z * 0.18, z = p.z + t.x * 0.18; i ? mx.lineTo(P.x(x), P.z(z)) : mx.moveTo(P.x(x), P.z(z)); } mx.stroke(); mx.restore(); }
    // trolley footprint from the trolley object matrix
    if (trolley.visible) { mx.fillStyle = '#9aa3aa'; mx.beginPath(); [[-0.31, -0.475], [0.31, -0.475], [0.31, 0.475], [-0.31, 0.475]].forEach(([x, z], i) => { const q = trolley.localToWorld(v3w.set(x, 0, z)); i ? mx.lineTo(P.x(q.x), P.z(q.z)) : mx.moveTo(P.x(q.x), P.z(q.z)); }); mx.closePath(); mx.fill(); }
    // MINO: occluded fan from the same rays as the 3D fan, bull-headed polisher icon
    if (mino.visible || (TL.mino_on[f] && minoXZ(f))) { const mp = mino.position; if (FANPTS.length) { mx.fillStyle = 'rgba(255,51,36,0.28)'; mx.beginPath(); mx.moveTo(P.x(mp.x), P.z(mp.z)); FANPTS.forEach(([x, z]) => mx.lineTo(P.x(x), P.z(z))); mx.closePath(); mx.fill(); }
      const r = Math.max(9, P.sc * 0.75), cx = P.x(mp.x), cz = P.z(mp.z), yw = mino.rotation.y; mx.save(); mx.translate(cx, cz); mx.rotate(-yw);
      mx.fillStyle = '#2b2f34'; mx.strokeStyle = C.ink; mx.lineWidth = 2; mx.beginPath(); mx.arc(0, 0, r, 0, 7); mx.fill(); mx.stroke();
      mx.strokeStyle = C.ink; mx.lineWidth = Math.max(2, r * 0.22); mx.beginPath(); mx.moveTo(-r * 0.55, r * 0.55); mx.quadraticCurveTo(-r * 1.25, r * 0.9, -r * 1.05, r * 1.55); mx.moveTo(r * 0.55, r * 0.55); mx.quadraticCurveTo(r * 1.25, r * 0.9, r * 1.05, r * 1.55); mx.stroke();
      mx.fillStyle = C.red; mx.shadowColor = C.red; mx.shadowBlur = 12; mx.beginPath(); mx.arc(0, r * 0.45, r * 0.28, 0, 7); mx.fill(); mx.restore(); }
    // Wolfgang: portrait marker at the live wolf position
    const wp = wolf.position, R = Math.max(16, P.sc * 0.95), wx = P.x(wp.x), wz = P.z(wp.z);
    mx.save(); mx.translate(wx, wz); mx.rotate(-wolf.rotation.y); mx.fillStyle = C.copper; mx.beginPath(); mx.moveTo(0, R * 1.45); mx.lineTo(-R * 0.35, R * 0.95); mx.lineTo(R * 0.35, R * 0.95); mx.fill(); mx.restore();
    if (marker.naturalWidth) mx.drawImage(marker, wx - R, wz - R, 2 * R, 2 * R);
    // header / footer (original typography; the store's voice, not a game HUD)
    const top = mode === 'full' ? 0.035 * H : 0.075 * H, left = mode === 'full' ? 0.04 * W : 0.6 * W, us = mode === 'full' ? H / 1080 : H / 1080 * 0.7;
    mx.fillStyle = C.ink; mx.textAlign = 'left'; mx.font = `800 ${34 * us}px "DejaVu Sans"`; mx.fillText('BUREAU & CO.', left, top + 30 * us);
    mx.fillStyle = C.mustard; mx.font = `700 ${20 * us}px "DejaVu Sans Mono"`; mx.fillText(`FLOOR PLAN CHECK-IN ${MAPCHK[f] || '-'}  //  YOU ARE HERE (APPROXIMATELY)`, left, top + 58 * us);
    const zn = WD.zones.find(z => wp.x >= z.x0 && wp.x <= z.x1 && wp.z >= z.z0 && wp.z <= z.z1), used = th ? th[1] - th[0] : 0;
    mx.textAlign = 'right'; mx.fillStyle = C.ink; mx.font = `700 ${22 * us}px "DejaVu Sans Mono"`; const right = mode === 'full' ? 0.96 * W : 0.985 * W;
    mx.fillText(`ZONE  ${zn ? (zoneLabel[zn.id] || zn.id).toUpperCase() : 'UNMAPPED'}`, right, top + 30 * us); mx.fillStyle = C.amber; mx.fillText(`THREAD  ${used.toFixed(1)} M`, right, top + 58 * us);
    mapLog[f] = { mode, wolf3d: [+wp.x.toFixed(4), +wp.z.toFixed(4)], wolfPx: [+wx.toFixed(2), +wz.toFixed(2)], mino3d: mino.visible ? [+mino.position.x.toFixed(4), +mino.position.z.toFixed(4)] : null,
      proj: { sc: P.sc, ox: P.ox, oy: P.oy, x0: MAPB.x0, z0: MAPB.z0 }, trolley: trolley.visible ? [+trolley.position.x.toFixed(4), +trolley.position.z.toFixed(4)] : null, thread: th || null }; }
  window.mapLog = mapLog;
  // ---------------------------------------------------------------- comparison render (bake validation): baked solids + plain floor only, fixed bake camera, no tone mapping / post
  window.renderCompare = () => { scene.traverse(o => { o.visible = false; }); const show = o => { o.traverse(c => { c.visible = true; }); let p = o.parent; while (p) { p.visible = true; p = p.parent; } };
    store.children.filter(o => o.userData.baked && !o.isMesh).forEach(show); show(FLOORS[0]);
    const [cx, cz, ch] = BK.camera_world_xz_h, tg = BK.camera_target_world; camera.position.set(cx, ch, cz); camera.fov = BK.vfov_deg; camera.near = 0.5; camera.lookAt(tg[0], tg[1], tg[2]); camera.updateProjectionMatrix();
    renderer.toneMapping = THREE.NoToneMapping; scene.background = new THREE.Color(0x000000); renderer.setClearColor(0x000000, 1); renderer.render(scene, camera); mapC.style.display = 'none'; return window.bakeInfo; };
  // ---------------------------------------------------------------- post: bloom""")
rep("renderer.clear(); hud(f);", "renderer.clear(); hud(f); drawMap(f, '');")
# frame hooks: blobs, map, BAKE actor light rig, debug lines
rep("    // thread\n", """    wBlob.position.set(P.x, 0.012, P.z); tBlob.visible = BAKE && trolley.visible; tBlob.position.set(trolley.position.x, 0.013, trolley.position.z); tBlob.rotation.y = trolley.rotation.y;
    mBlob.visible = BAKE && !!on; if (on) { mBlob.position.set(m.x, 0.014, m.z); mBlob.rotation.y = mino.rotation.y; }
    // thread
""")
rep("sun.position.copy(c.look).add(V3(-14, 40, 18)); sun.target.position.copy(c.look); const ext = f >= F.ext; hemi.intensity = ext ? 0.55 : 1.15;",
    "sun.position.copy(c.look).add(BAKE ? V3(-3, 40, 4) : V3(-14, 40, 18)); sun.target.position.copy(c.look); sun.castShadow = !BAKE; const ext = f >= F.ext; hemi.intensity = ext ? 0.55 : BAKE ? 0.85 : 1.15; if (BAKE) sun.intensity = 1.1;")
rep("    hud(f); grain.uniforms.uT.value = (f % 97) * 1.37; composer.render(); return true; };",
    """    hud(f); drawMap(f, QA ? 'inset' : c.shot === 'map' ? 'full' : '');
    if (DEBUG) $('debug').textContent += `\\nLIGHT  ${BAKE ? 'BAKED v2 (Cycles irradiance x albedo); actors live-lit; contact shadows = blob approx' : 'LIVE grey-block'}\\nDOOR   ${DOORS.map(D => { const o = TL.door_open[D.di][f], p = TL.door_open[D.di][Math.max(0, f - 1)]; return o > 0.001 || p > 0.001 ? D.d.id + ':' + (o >= 0.999 ? 'OPEN' : o <= 0.001 ? 'CLOSED' : o > p ? 'OPENING' : 'CLOSING') : ''; }).filter(Boolean).join(' ') || 'all closed'}\\nMINO LOS ${window.losAt(f) === null ? '-' : window.losAt(f) ? 'CLEAR' : 'BLOCKED'}  DETECT@${DETECT}`;
    grain.uniforms.uT.value = (f % 97) * 1.37; composer.render(); return true; };""")
open(P, 'w').write(s)

# ---- renderer: imports + map canvas
R = 'bureau_render.js'; r = open(R).read()
def rrep(old, new):
    global r
    if r.count(old) != 1: sys.exit(f'[patch] render anchor x{r.count(old)}: {old[:80]!r}')
    r = r.replace(old, new)
rrep("import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
     "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { EXRLoader } from 'three/addons/loaders/EXRLoader.js';")
rrep("sceneMain(THREE, { BufferGeometryUtils, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass })",
     "sceneMain(THREE, { BufferGeometryUtils, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, GLTFLoader, EXRLoader })")
rrep('<div id="shot"></div><div id="rcpt"></div><div id="debug"></div>', '<canvas id="map"></canvas><div id="shot"></div><div id="rcpt"></div><div id="debug"></div>')
rrep("#debug:empty{display:none}", "#map{position:absolute;inset:0;width:100%;height:100%;display:none}#debug:empty{display:none}")
rrep("const MIME = { '.glb'", "const MIME = { '.exr': 'image/x-exr', '.glb'")
open(R, 'w').write(r)
print('[patch] v10d applied')
