"""v10e scene patch: approved sprite Wolfgang (2.5D billboard + v9 cut-out push rig), asset-load gate (no placeholder fallback),
MINO state-driven yaw/sensor/HUD from timeline (search behaviour), polish trail from recent path, thread belt anchor,
O2 tracking-error blip at map check-in 3, O3 map-then-rise at check-in 5. Exact-anchor replacements; fails loudly."""
import sys
P = 'bureau_scene.js'; s = open(P).read()
def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'[patch v10e] anchor x{n} (want {count}): {old[:100]!r}')
    s = s.replace(old, new)
def between(a, b, new):
    global s
    i = s.index(a); j = s.index(b, i)
    s = s[:i] + new + s[j:]

# ---------------------------------------------------------------- Wolfgang sprite + push rig (inserted right after the placeholder build, which stays as the hidden authoritative transform)
rep("  const feet = [-1, 1].map(sd => {", """  // ================================================================ v10e WOLFGANG: approved sprite atlas, 2.5D. The placeholder group above stays as the invisible
  // authoritative transform (navigation, map, trolley all read `wolf`); every placeholder mesh is hidden. No fallback: a missing asset is an engine error.
  const ATL = await (await fetch('atlas_map.json')).json();
  const texL = new THREE.TextureLoader();
  let atlasTex, normalTex;
  try { [atlasTex, normalTex] = await Promise.all([texL.loadAsync('Master_Sprite_Atlas.png'), texL.loadAsync('Master_Normal_Atlas.png')]); }
  catch (e) { throw new Error('WOLFGANG ASSET LOAD FAILED (Master_Sprite_Atlas.png / Master_Normal_Atlas.png): refusing to render a placeholder'); }
  if (!atlasTex.image || atlasTex.image.width !== ATL.atlas_w || normalTex.image.width !== ATL.atlas_w) throw new Error('WOLFGANG ATLAS SIZE MISMATCH');
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8; normalTex.colorSpace = THREE.NoColorSpace;
  const SPS = (ATL.animations.walk_side.world_height_m || 1.95) / ATL.cell_h;              // metres per atlas pixel (1.95 m per 512 px cell)
  const sprMat = new THREE.MeshStandardMaterial({ map: atlasTex, normalMap: normalTex, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, alphaTest: 0.06, roughness: 0.85, side: THREE.DoubleSide });
  const sprGeo = new THREE.PlaneGeometry(1, 1), sprite = new THREE.Mesh(sprGeo, sprMat); sprite.renderOrder = 3;
  const sprGroup = new THREE.Group(); const sprTilt = new THREE.Group(); sprGroup.add(sprTilt); sprTilt.add(sprite); scene.add(sprGroup);
  const uvA = sprGeo.attributes.uv;
  const setFrame = (anim, i, mirror) => { const fr = ATL.animations[anim].frames[i], [x, y, w, h] = fr.rect, [px, py] = fr.pivot, AW = ATL.atlas_w, AH = ATL.atlas_h;
    const u0 = x / AW, u1 = (x + w) / AW, v0 = 1 - (y + h) / AH, v1 = 1 - y / AH;            // atlas rects are top-left origin (atlas_map v_flip_note)
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    const L = mirror ? u1 : u0, R = mirror ? u0 : u1; uvA.setXY(0, L, v1); uvA.setXY(1, R, v1); uvA.setXY(2, L, v0); uvA.setXY(3, R, v0); uvA.needsUpdate = true;
    sprite.scale.set(w * SPS, h * SPS, 1); const ox = (mirror ? -1 : 1) * (w / 2 - px) * SPS; sprite.position.set(ox, (h / 2 - py) * SPS, 0);
    sprMat.normalScale.set(mirror ? -0.6 : 0.6, 0.6); };
  // ---- v9 cut-out push rig, ported without the mouth / blink / ear extras (no new art: body = approved trolley_push drawing with legs erased,
  //      legs = one drawn leg from walk_side[0], used near and far). Drawn trolley inside the art replaces the 3D trolley in side views.
  function buildSkin(rig, mat, zOff) {
    const an = ATL.animations[rig.anim], fr = an.frames[rig.frame], [ax, ay] = fr.rect, [pvx, pvy] = rig.pivot;
    const nV = rig.vertices.length, pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4);
    rig.vertices.forEach(([x, y], i) => { pos.set([x - pvx, pvy - y, zOff], i * 3); uv.set([(ax + x) / ATL.atlas_w, 1 - (ay + y) / ATL.atlas_h], i * 2); si.set(rig.skinIndex[i], i * 4); sw.set(rig.skinWeight[i], i * 4); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(rig.index); g.computeVertexNormals();
    const B = {}, Pp = {}; rig.bones.forEach(([n, , x, y]) => { Pp[n] = [x, y]; });
    rig.bones.forEach(([n, par, x, y]) => { const b = new THREE.Bone(); b.name = n; const [px, py] = par ? Pp[par] : [pvx, pvy]; b.position.set(x - px, -(y - py), 0); B[n] = b; if (par) B[par].add(b); });
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false; const rootBone = B[rig.bones[0][0]]; mesh.add(rootBone); mesh.bind(new THREE.Skeleton(rig.bones.map(b => B[b[0]])));
    const rest = {}; for (const n in B) rest[n] = B[n].position.clone(); return { mesh, B, rest }; }
  class CutoutPush { constructor(bodyRig, legRig) {
      const mk = c => new THREE.MeshStandardMaterial({ map: atlasTex, normalMap: normalTex, normalScale: new THREE.Vector2(0.6, 0.6), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, color: c });
      this.mats = [mk(0xffffff), mk(0xffffff), mk(0x8a8a90)]; this.body = buildSkin(bodyRig, this.mats[0], 0);
      this.legs = { near: buildSkin(legRig, this.mats[1], -1.5), far: buildSkin(legRig, this.mats[2], -3.0) };
      const at = bodyRig.leg_attach, lb = bodyRig.bones.find(b => b[0] === 'legs'), hipX = lb[2]; this.hipY0 = lb[3]; this.groundY = bodyRig.pivot[1];
      for (const k of ['near', 'far']) { const L = this.legs[k]; this.body.B.legs.add(L.mesh); L.mesh.position.set(at[k][0] - hipX, 0, 0); L.mesh.scale.setScalar(legRig.scale_to_push || 1); }
      const J = legRig.joints; this.l1 = J.knee[1] - J.hip[1]; this.l2 = J.ankle[1] - J.knee[1]; this.soleD = J.sole - J.ankle[1];
      this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.root.add(this.tilt); this.flip = new THREE.Group(); this.tilt.add(this.flip); this.flip.add(this.body.mesh); this.body.mesh.scale.setScalar(SPS); this.root.visible = false; }
    pose(phase, amp) { const d2r = Math.PI / 180, ph = phase * Math.PI * 2, bd = this.body, B = bd.B; for (const n in B) { B[n].rotation.set(0, 0, 0); B[n].position.copy(bd.rest[n]); }
      const th0 = -7 * d2r * amp - 3 * d2r, A = 27 * d2r * amp, K = 0.8 * amp; let depth = 0;
      for (const [k, o] of [['near', 0], ['far', Math.PI]]) { const L = this.legs[k], LB = L.B; for (const n in LB) { LB[n].rotation.set(0, 0, 0); LB[n].position.copy(L.rest[n]); }
        const q = ph + o, th = th0 + A * Math.cos(q), sw = Math.max(0, -Math.sin(q)), early = Math.max(0, Math.cos(q)) > 0 ? 1 : 0.55, flex = K * Math.pow(sw, 1.4) * early + 0.06 * amp;
        const peel = 0.35 * amp * Math.max(0, Math.sin(q - Math.PI * 0.5)) * (Math.cos(q) < 0 ? 1 : 0);
        LB.hip.rotation.z = th; LB.knee.rotation.z = -flex; LB.ankle.rotation.z = flex - th + peel;
        depth = Math.max(depth, this.l1 * Math.cos(th) + this.l2 * Math.cos(th - flex) + this.soleD * Math.cos(peel) - 4 * Math.sin(peel)); }
      const rel = (this.groundY - depth * this.legs.near.mesh.scale.x) - this.hipY0; B.legs.position.y = bd.rest.legs.y - rel * 0.45; B.hip.position.y = bd.rest.hip.y - rel * 0.55;
      B.spine.rotation.z = -0.03 * amp * Math.cos(ph * 2); B.head.rotation.z = 0.04 * amp * Math.sin(ph * 2 + 0.6); B.coat.rotation.z = 0.035 * amp * Math.sin(ph * 2 - 0.4);
      B.tail0.rotation.z = 0.10 * Math.sin(ph * 2 - 0.5) * (0.4 + amp); B.tail1.rotation.z = 0.16 * Math.sin(ph * 2 - 1.1) * (0.4 + amp); B.tail2.rotation.z = 0.22 * Math.sin(ph * 2 - 1.7) * (0.4 + amp);
      this.root.updateMatrixWorld(true); }
    set mirror(m) { this.flip.scale.set(m ? -1 : 1, 1, 1); this.mats.forEach(x => x.normalScale.set(m ? -0.6 : 0.6, 0.6)); } }
  if (!ATL.rigs || !ATL.rigs.push_body || !ATL.rigs.leg) throw new Error('WOLFGANG PUSH RIG MISSING in atlas_map.json');
  const pushRig = new CutoutPush(ATL.rigs.push_body, ATL.rigs.leg); scene.add(pushRig.root);
  const CART_AHEAD = (560 - ATL.rigs.push_body.pivot[0]) * SPS;                             // drawn cart centre ahead of the rig pivot (measured: 0.87 m)
  const WSTAT = { frames: 0, front: 0, side: 0, side_mirrored: 0, back: 0, idle: 0, push_rig: 0, push_front_back_no_contact: 0 }; window.wolfStats = WSTAT;
  // thread belt anchor: the thread rises from the floor to a fixed point at his belt (hip height, camera side) so it never ends in mid-air
  const beltM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.75, 0.78, 0.1) }), belt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), beltM); belt.visible = false; scene.add(belt);
  const feet = [-1, 1].map(sd => {""")
# hide every placeholder mesh (the group transform stays authoritative)
rep("  // ---------------------------------------------------------------- dynamic ribbons:", """  wolf.traverse(o => { if (o.isMesh) o.visible = false; }); lanternLight.intensity = 0; wolf.userData.placeholderHidden = true;
  // ---------------------------------------------------------------- dynamic ribbons:""")
# ---------------------------------------------------------------- MINO sensor driven by the timeline behaviour state
between("  const SENS = new Float32Array(N); let DETECT = -1;", "  const warnRing", """  const MSN = TL.mino_states || [], mstate = f => MSN[(TL.mino_state || [])[f]] || 'chase';
  const SENS = new Float32Array(N); let DETECT = -1; { let ys = 0;
    for (let f = F.minoReveal; f < N; f++) { const m = minoXZ(f); if (!m) continue; const st = mstate(f), body = TL.mino_yaw ? TL.mino_yaw[f] : 0, t = (f - F.minoReveal) / FPS; let tgt;
      if (st === 'chase') { const ls = TL.mino_last_seen[f], p = posAt(ls >= 0 ? ls : S[f]); tgt = Math.atan2(p.x - m.x, p.z - m.z); if (DETECT < 0) DETECT = f; }   // aims at the LAST SEEN point
      else if (st === 'search') tgt = body + Math.sin(t * 1.6) * 1.5;          // wide sweep where it lost him
      else if (st === 'patrol') tgt = body + Math.sin(t * 2.4) * 1.05;
      else if (st === 'track') tgt = body + Math.sin(t * 3.0) * 0.35;          // nose down the thread
      else tgt = body;
      let d = tgt - ys; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ys += clamp(d, -0.12, 0.12); SENS[f] = ys; } }
""")
rep("} else mh = headAt(SM[f]);", "} else mh = V3(Math.sin(TL.mino_yaw[f]), 0, Math.cos(TL.mino_yaw[f]));")
rep("alert = DETECT >= 0 && f >= DETECT ? clamp((16 - d) / 8, 0.35, 1) : 0;", "mst = mstate(f), alert = mst === 'chase' ? clamp((16 - d) / 8, 0.35, 1) : mst === 'search' || mst === 'lost' ? 0.3 : 0;")
rep("fan.material.opacity = DETECT >= 0 && f >= DETECT ? 0.3 : 0.18 + 0.06 * Math.sin(f * 0.4);", "fan.material.opacity = mst === 'chase' ? 0.3 : mst === 'search' ? 0.24 : 0.16 + 0.05 * Math.sin(f * 0.4);")
rep("if (k >= WD.emerge_frames) setRibbon(trail, Math.max(0, SM[f] - 14), SM[f] - 0.5, 0.95, 0.012);",
    "if (k >= WD.emerge_frames) { let a = SM[f], b = SM[f]; for (let q = Math.max(F.minoReveal + WD.emerge_frames, f - 150); q <= f; q++) { a = Math.min(a, SM[q]); b = Math.max(b, SM[q]); } setRibbon(trail, Math.max(0, a), b, 0.95, 0.012); }")
rep("prox = DETECT < 0 || f < DETECT ? 'SCANNING' : d < 6 ", "mst = mstate(f), prox = mst === 'patrol' ? 'PATROLLING' : mst === 'track' ? 'FOLLOWING THREAD' : mst === 'search' || mst === 'lost' ? '<b class=\"a\">SEARCHING</b>' : mst !== 'chase' ? 'SCANNING' : d < 6 ")
# ---------------------------------------------------------------- per-frame Wolfgang sprite update (after the camera is placed)
rep("    $('minopov').style.display = c.shot === 'm1' ? 'block' : 'none';", """    { // ---- v10e Wolfgang sprite pose (camera-relative view selection; distance-driven walk; idle when stopped; side push rig)
      const fp = c.shot === 'w1', cp = camera.position, Pw = wolf.position, spd = Math.abs(S[f] - S[Math.max(0, f - 1)]) * FPS, idle = spd < 0.12;
      const camAng = Math.atan2(cp.x - Pw.x, cp.z - Pw.z); let rel = yaw - camAng; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), hv = V3(Math.sin(yaw), 0, Math.cos(yaw)), goesRight = hv.dot(right) >= 0;
      const view = Math.abs(rel) < 0.87 ? 'front' : Math.abs(rel) > 2.27 ? 'back' : 'side';
      const elev = Math.atan2(cp.y - 1.0, Math.hypot(cp.x - Pw.x, cp.z - Pw.z)), tilt = clamp((elev - 0.35) * 0.8, 0, 0.95);
      const pushing = hasTrolley && view === 'side' && !idle;
      sprGroup.visible = !fp && !pushing; pushRig.root.visible = !fp && pushing; WSTAT.frames++;
      if (pushing) { WSTAT.push_rig++; pushRig.mirror = !goesRight; pushRig.root.position.copy(P).addScaledVector(h, 0.95 - CART_AHEAD); pushRig.root.rotation.set(0, camAng, 0); pushRig.tilt.rotation.x = -tilt;
        pushRig.pose(((S[f] / 1.5) % 1 + 1) % 1, clamp(spd / 1.4, 0, 1)); trolley.visible = false; if (!goesRight) WSTAT.side_mirrored++; }
      else { sprGroup.position.copy(Pw); sprGroup.rotation.set(0, camAng, 0); sprTilt.rotation.x = -tilt;
        const ph = ((S[f] / 1.5) % 1 + 1) % 1, wf = Math.min(5, Math.floor(ph * 6));
        if (idle) { WSTAT.idle++; if (view === 'back') setFrame('walk_back', 0, false); else if ((view === 'side' ? goesRight : rel < 0)) setFrame('actions2b', 6, false); else setFrame('actions2b', 2, false); }
        else if (view === 'front') { WSTAT.front++; setFrame('walk_front', wf, false); }
        else if (view === 'back') { WSTAT.back++; setFrame('walk_back', wf, false); }
        else { WSTAT.side++; if (!goesRight) WSTAT.side_mirrored++; setFrame('walk_side', wf, !goesRight); }
        if (hasTrolley && !idle && view !== 'side') WSTAT.push_front_back_no_contact++; }
      // thread rises from its floor end to the belt anchor (hip height, 6 cm toward the camera so it reads in front of the coat)
      const thr = TL.thread[f]; belt.visible = !!thr && !fp && thread.m.visible;
      if (belt.visible) { const e = posAt(thr[1]), tt = headAt(thr[1]), ex = e.x - tt.z * 0.18, ez = e.z + tt.x * 0.18, toC = V3(cp.x - Pw.x, 0, cp.z - Pw.z).normalize();
        const top = V3(Pw.x + toC.x * 0.06, 0.95, Pw.z + toC.z * 0.06), bot = V3(ex, 0.022, ez), mid = top.clone().add(bot).multiplyScalar(0.5), len = top.distanceTo(bot);
        belt.position.copy(mid); belt.scale.set(1, len, 1); belt.quaternion.setFromUnitVectors(V3(0, 1, 0), top.clone().sub(bot).normalize()); }
      window.wolfPose = { view, idle, pushing, mirrored: pushing ? !goesRight : (view === 'side' && !goesRight && !idle), tilt: +tilt.toFixed(3) }; }
    $('minopov').style.display = c.shot === 'm1' ? 'block' : 'none';""")
# ---------------------------------------------------------------- O3: check-in 5 (authored on the car-park EXT row): 60-frame arcade map, 18-frame cross-fade into the 3D rise
rep("    MAPCHK[f] = m === 'MAP' ? cur : 0; prev = m; } }", """    MAPCHK[f] = m === 'MAP' ? cur : 0; prev = m; }
    for (const t of TEL) { const mm = /MAP_CHECKIN_(\\d+)/.exec(String(t.special_events)); if (mm && t.camera_mode !== 'MAP') for (let f = t.frame; f < Math.min(N, t.frame + 60); f++) { MAPCHK[f] = +mm[1]; MAPFADE[f] = clamp((t.frame + 60 - f) / 18, 0, 1); } } }""")
rep("  const MAPCHK = new Int32Array(N); {", "  const MAPCHK = new Int32Array(N), MAPFADE = new Float32Array(N).fill(1); {")
rep("if (mode === 'MAP' && MAPCHK[f]) return 'map';", "if (MAPCHK[f]) return 'map';")
rep("function drawMap(f, mode) { if (!mode) { mapC.style.display = 'none'; return; } mapC.style.display = 'block';",
    "function drawMap(f, mode) { if (!mode) { mapC.style.display = 'none'; return; } mapC.style.display = 'block'; mapC.style.opacity = mode === 'full' ? MAPFADE[f].toFixed(3) : '1';")
# ---------------------------------------------------------------- O2: authored tracking-error blip at check-in 3 (MINO is still docked in its closet: the real marker shows that)
rep("    // Wolfgang: portrait marker at the live wolf position", """    if (MAPCHK[f] === 3) { const g0 = TEL.find(t => /MAP_CHECKIN_3/.test(String(t.special_events))).frame, k = f - g0;
      // real MINO: docked, drawn at the closet from world.json (it has not been revealed; mino_on is 0)
      const cx_ = P.x(WD.closet[0]), cz_ = P.z(WD.closet[1]); mx.fillStyle = '#5a5f66'; mx.beginPath(); mx.arc(cx_, cz_, Math.max(7, P.sc * 0.55), 0, 7); mx.fill(); mx.fillStyle = C.ink; mx.font = `700 ${Math.max(10, P.sc * 0.7)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('MINO: DOCKED', cx_, cz_ - P.sc * 1.1);
      if (k >= 40 && k < 130) { const A0 = [2, -15], B0 = [12, -15], u = clamp((k - 40) / 60, 0, 1), bx = P.x(A0[0] + (B0[0] - A0[0]) * u), bz = P.z(A0[1]), rec = clamp((k - 100) / 30, 0, 1);
        mx.save(); mx.globalAlpha = 1 - rec; mx.setLineDash([5, 4]); mx.strokeStyle = C.red; mx.lineWidth = 2; mx.beginPath(); mx.arc(bx, bz, Math.max(9, P.sc * 0.75), 0, 7); mx.stroke(); mx.setLineDash([]);
        if ((k >> 3) % 2 === 0) { mx.fillStyle = C.red; mx.font = `800 ${Math.max(12, P.sc * 0.85)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('TRACKING ERROR', bx, bz - P.sc * 1.3); }
        if (rec > 0) { mx.globalAlpha = rec; mx.strokeStyle = C.ink; mx.setLineDash([2, 5]); mx.beginPath(); mx.moveTo(bx, bz); mx.lineTo(cx_, cz_); mx.stroke(); }
        mx.restore(); if (k >= 100) { mx.fillStyle = C.mustard; mx.font = `700 ${Math.max(11, P.sc * 0.75)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('RECONCILED: SIGNAL WAS NOT MINO', P.x(7), P.z(-12.5)); } }
      mapLog.glitch = mapLog.glitch || []; if (k >= 40 && k < 130) mapLog.glitch.push(f); }
    // Wolfgang: portrait marker at the live wolf position""")
rep("trolley: trolley.visible ? [+trolley.position.x.toFixed(4), +trolley.position.z.toFixed(4)] : null,",
    "trolley: (trolley.visible || pushRig.root.visible) ? [+(P_.x).toFixed(4), +(P_.z).toFixed(4)] : null,")
rep("    // trolley footprint from the trolley object matrix\n    if (trolley.visible) {",
    "    // trolley footprint from the trolley transform (the 3D trolley is hidden while the drawn push-rig cart stands in for it)\n    const P_ = trolley.position; if (trolley.visible || pushRig.root.visible) {")
rep("const fp1 = c.shot === 'w1'; head.visible = !fp1; body.visible = !fp1; tails.visible = !fp1;", "const fp1 = c.shot === 'w1'; /* v10e: placeholder meshes stay hidden; the sprite handles first person */ bag.visible = false;   /* no approved carry pose: flatpack bag withheld (gap) */")
open(P, 'w').write(s)
print('[patch v10e] applied')
