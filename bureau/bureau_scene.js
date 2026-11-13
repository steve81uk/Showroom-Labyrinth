// =====================================================================================================================
// BUREAU & CO. grey-block scene (Engine v10, navigation phase). Browser side, injected by bureau_render.js.
// Reads bureau/world.json + bureau/timeline.json (built and collision-tested by bureau_world.js). Every frame is a
// pure function of the frame number. No final textures, fur, rain or particles in this phase, by design.
// =====================================================================================================================
async function sceneMain(THREE, X) {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1920, H = +Q.get('h') || 1080, DEBUG = Q.get('debug') === '1';
  const BAKE = Q.get('bake') === '1', CMP = Q.get('cmp') === '1', LMFLIP = Q.get('lmflip') === '1', QA = Q.get('qa') === '1', QASHOT = Q.get('qashot') || '';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const $ = id => document.getElementById(id);

  const M = await (await fetch('manifest.json')).json();
  const WD = await (await fetch('bureau/world.json')).json();
  const TL = await (await fetch('bureau/timeline.json')).json();
  const FPS = M.fps, N = M.total_frames_at_30fps, F = TL.F, A = M.acoustic;
  const TEL = M.telemetry.slice().sort((a, b) => a.frame - b.frame);
  const telIdx = new Int32Array(N); { let k = 0; for (let f = 0; f < N; f++) { while (k + 1 < TEL.length && TEL[k + 1].frame <= f) k++; telIdx[f] = k; } }
  const telAt = f => TEL[telIdx[clamp(f, 0, N - 1)]];
  // authored map check-ins: a contiguous MAP run whose first row carries MAP_CHECKIN_<n> (frame-0 MAP intro is not a check-in)
  const MAPCHK = new Int32Array(N), MAPFADE = new Float32Array(N).fill(1); { let cur = 0, prev = ''; for (let f = 0; f < N; f++) { const t = telAt(f), m = t.camera_mode;
    if (m === 'MAP' && prev !== 'MAP') { const ev = TEL.filter(x => x.frame >= f && x.frame < f + 2 && x.camera_mode === 'MAP').map(x => String(x.special_events)).join(' '); const mm = /MAP_CHECKIN_(\d+)/.exec(ev); cur = mm ? +mm[1] : 0; }
    MAPCHK[f] = m === 'MAP' ? cur : 0; prev = m; }
    // v10e: check-in 4 is capped at 90 frames so the door wait at ward_serv (frames ~3811-3870) plays as a ground-level shot, not under the map
    { const s4 = MAPCHK.indexOf(4); if (s4 >= 0) for (let f = s4 + 90; f < N && MAPCHK[f] === 4; f++) MAPCHK[f] = 0; }
    for (const t of TEL) { const mm = /MAP_CHECKIN_(\d+)/.exec(String(t.special_events)); if (mm && t.camera_mode !== 'MAP') for (let f = t.frame; f < Math.min(N, t.frame + 60); f++) { MAPCHK[f] = +mm[1]; MAPFADE[f] = clamp((t.frame + 60 - f) / 18, 0, 1); } } }
  const secAt = f => { const t = f / FPS; let s = M.sections[0]; for (const x of M.sections) if (x.start_s <= t + 1e-6) s = x; return s; };
  const BEATS = A.beats_s; const beatAt = t => { let lo = 0, hi = BEATS.length - 1; if (t < BEATS[0]) return 0; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BEATS[m] <= t) lo = m; else hi = m; } return lo; };

  // ---------------------------------------------------------------- route geometry
  const RT = WD.route, RS = WD.route_s, LEN = RS[RS.length - 1];
  const posAt = s => { s = clamp(s, 0, LEN); let lo = 0, hi = RS.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RS[m] <= s) lo = m; else hi = m; }
    const t = (s - RS[lo]) / Math.max(1e-9, RS[hi] - RS[lo]); return V3(lerp(RT[lo][0], RT[hi][0], t), 0, lerp(RT[lo][1], RT[hi][1], t)); };
  const headAt = s => { const a = posAt(s - 0.25), b = posAt(s + 0.9); const d = b.sub(a); d.y = 0; return d.lengthSq() > 1e-8 ? d.normalize() : V3(0, 0, -1); };
  const S = TL.S, SM = TL.SM;
  const minoXZ = f => { if (SM[f] < 0) return null; const k = f - F.minoReveal, KJ = WD.emerge_frames, E = WD.emerge;
    if (k < KJ) { const u = smooth(k / KJ); let tot = 0; const seg = []; for (let i = 1; i < E.length; i++) { const l = Math.hypot(E[i][0] - E[i - 1][0], E[i][1] - E[i - 1][1]); seg.push(l); tot += l; }
      let L = tot * u, i = 0; while (i < seg.length - 1 && L > seg[i]) { L -= seg[i]; i++; } const t = L / Math.max(1e-9, seg[i]); return V3(lerp(E[i][0], E[i + 1][0], t), 0, lerp(E[i][1], E[i + 1][1], t)); }
    return posAt(SM[f]); };

  // ---------------------------------------------------------------- renderer (project rule: alpha, no premultiplied alpha, antialias)
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101418);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 400);
  const hemi = new THREE.HemisphereLight(0xd4e2f2, 0x2e3036, 1.05); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xe6f0ff, 1.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); sun.shadow.bias = -0.0004; scene.add(sun); scene.add(sun.target);

  // ---------------------------------------------------------------- Bureau & Co. palette (original identity; no third-party marks)
  const COL = { teal: 0x1f5f6b, tealDeep: 0x123d47, mustard: 0xc9a43a, red: 0xb3261e, concrete: 0xb8b1a4, birch: 0xd6c39a, charcoal: 0x34373c, grey: 0x9a9da0, wall: 0xdcd6cb };
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o));
  const MAT = { floor: mat(COL.concrete, { roughness: 0.92 }), wall: mat(COL.wall), wallTop: mat(COL.teal), large: mat(COL.birch, { roughness: 0.7 }), dark: mat(COL.charcoal),
    small: mat(COL.grey), anchor: mat(COL.red, { roughness: 0.6 }), partition: mat(0xe6e0d4), gondola: mat(COL.birch, { roughness: 0.65 }), worktop: mat(0xeeeae2, { roughness: 0.4 }),
    cage: mat(0x8f969c, { metalness: 0.6, roughness: 0.4 }) };
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const textPlane = (txt, wM, col = '#1f5f6b', font = 'bold 120px DejaVu Sans', hM) => { const tex = canvasTex(1024, 256, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = col; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      let fs = 120; while (c.measureText(txt).width > w * 0.94 && fs > 20) { fs -= 6; c.font = font.replace(/\d+px/, fs + 'px'); } c.fillText(txt, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM || wM / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 })); return m; };

  // ---------------------------------------------------------------- floor, zones, labels
  const RELOC = [], LURE = [], ZLAB = [], FLOORS = [], BINM = [];
  const store = new THREE.Group(); scene.add(store);
  { const fl = new THREE.Mesh(new THREE.PlaneGeometry(72, 52), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; store.add(fl); FLOORS.push(fl);
    const ZT = { entrance: 0xc9c0ae, bedrooms: 0xc6bba6, kitchens: 0xbfc0b9, hall: 0xb3b8b5, wardrobes: 0xc2b9ab, service: 0xa9aaa6, core: 0xbcb5a8 };
    for (const z of WD.zones) { const p = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), mat(ZT[z.id] || COL.concrete, { roughness: 0.95 }));
      p.rotation.x = -Math.PI / 2; p.position.set((z.x0 + z.x1) / 2, 0.004, (z.z0 + z.z1) / 2); p.receiveShadow = true; store.add(p); FLOORS.push(p);
      const lab = textPlane(z.name, Math.min(14, (z.x1 - z.x0) * 0.8), '#1f5f6bcc'); lab.rotation.x = -Math.PI / 2; lab.position.set((z.x0 + z.x1) / 2, 0.02, z.z0 + 1.6); store.add(lab); ZLAB.push([lab, lab.position.clone()]); }
    for (const l of WD.labels) { const t = textPlane(l.text, l.big ? 9 : 6, l.big ? '#b3261e' : '#34373c'); t.rotation.x = -Math.PI / 2; t.position.set(l.x, 0.025, l.z); store.add(t); if (/RELOCATED/.test(l.text)) RELOC.push(t); if (l.glitch) LURE.push(t); } }
  // outside: car park (night), entrance apron
  { const ap = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), mat(0x2b2d31, { roughness: 0.95 })); ap.rotation.x = -Math.PI / 2; ap.position.set(0, -0.01, -39); ap.receiveShadow = true; scene.add(ap);
    const ap2 = new THREE.Mesh(new THREE.PlaneGeometry(80, 10), mat(0x3a3c40)); ap2.rotation.x = -Math.PI / 2; ap2.position.set(0, -0.01, 31); scene.add(ap2);
    const line = mat(0xe7e3d8); for (let k = -7; k <= 7; k++) { if (Math.abs(k) < 2) continue; const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 5), line); b.position.set(k * 2.7, 0.01, -36); scene.add(b);
      if ((k * 7 + 3) % 3) { const car = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.45, 4.3), mat([0x4b5560, 0x2a2d33, 0x7a2a26, 0x8d9196][(k + 9) % 4], { roughness: 0.4, metalness: 0.4 }));
        car.position.set(k * 2.7 + 1.35, 0.73, -36); car.castShadow = car.receiveShadow = true; scene.add(car); } }
    const sign = textPlane('BUREAU & CO.  HOME, ADMINISTERED.', 22, '#c9a43a', 'bold 100px DejaVu Sans'); sign.rotation.x = -Math.PI / 2; sign.position.set(0, 0.02, -29.3); scene.add(sign); }

  // ---------------------------------------------------------------- solids (grey-block): merged per material for speed
  const merge = X.BufferGeometryUtils.mergeGeometries;
  const bins = {}; const put = (k, g) => (bins[k] || (bins[k] = [])).push(g);
  for (const s of WD.solids) { const w = s.x1 - s.x0, d = s.z1 - s.z0, h = s.h; const g = new THREE.BoxGeometry(w, h, d); g.translate((s.x0 + s.x1) / 2, h / 2, (s.z0 + s.z1) / 2);
    const k = s.layer === 'wall' ? 'wall' : s.kind === 'bed_anchor' ? 'anchor' : /gondola/.test(s.kind) ? 'gondola' : s.kind === 'partition' ? 'partition' : s.kind === 'worktop' ? 'worktop'
      : /cage|trolley_bay|barrier/.test(s.kind) ? 'cage' : /checkout|desk|wardrobe|tall|closet|cleaning|bench/.test(s.kind) ? 'dark' : s.layer === 'small' ? 'small' : 'large'; put(k, g);
    if (s.layer === 'wall') { const c = new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02); c.translate((s.x0 + s.x1) / 2, h + 0.06, (s.z0 + s.z1) / 2); put('wallTop', c); } }
  for (const k in bins) { const m = new THREE.Mesh(merge(bins[k]), MAT[k]); m.castShadow = true; m.receiveShadow = true; store.add(m); BINM.push(m); }
  // ---------------------------------------------------------------- v10d BAKE: Blender Cycles irradiance lightmaps (bureau/bake, see DECISIONS.md)
  // Maps hold irradiance only (no albedo). MeshBasicMaterial (r169): indirectDiffuse = map * intensity / PI, then *= colour,
  // so intensity = PI displays albedo x irradiance exactly once and scene lights cannot double-light the store.
  let BK = null, LMF = null;
  if (BAKE) { BK = await (await fetch('bureau/bake/bake_v2.json')).json();
    const exr = new X.EXRLoader(); exr.setDataType(THREE.HalfFloatType);
    const [lmS, lmF, glb] = await Promise.all([exr.loadAsync('bureau/bake/lm_solids.exr'), exr.loadAsync('bureau/bake/lm_floor.exr'), new X.GLTFLoader().loadAsync('bureau/bake/solids.glb')]);
    for (const t of [lmS, lmF]) { t.channel = 1; t.colorSpace = THREE.LinearSRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; }
    LMF = lmF; BINM.forEach(m => { store.remove(m); m.geometry.dispose(); });
    const used = {}; let uv1n = 0;
    glb.scene.traverse(o => { if (!o.isMesh) return; const nm = (o.material.name || '').replace(/\.\d+$/, ''); used[nm] = (used[nm] || 0) + 1; if (o.geometry.attributes.uv1) uv1n++;
      if (!LMFLIP) { /* verified: EXR rows bottom-up (Blender v); glTF exports 1 - v, so flip uv1 back */ const a = o.geometry.attributes.uv1; for (let i = 0; i < a.count; i++) a.setY(i, 1 - a.getY(i)); }
      o.material = new THREE.MeshBasicMaterial({ color: (MAT[nm] || MAT.large).color.clone(), lightMap: lmS, lightMapIntensity: Math.PI }); o.userData.baked = true; });
    glb.scene.userData.baked = true; store.add(glb.scene);
    for (const p of FLOORS) { p.updateMatrixWorld(true); const g = p.geometry, pa = g.attributes.position, uv = new Float32Array(pa.count * 2), v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(p.matrixWorld); uv[i * 2] = (v.x + 36) / 72; const vb = (26 - v.z) / 52; uv[i * 2 + 1] = LMFLIP ? 1 - vb : vb;   /* verified orientation: v = Blender v */ }
      g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2)); p.material = new THREE.MeshBasicMaterial({ color: p.material.color.clone(), lightMap: lmF, lightMapIntensity: Math.PI }); p.userData.baked = true; }
    window.bakeInfo = { three: THREE.REVISION, glbMaterials: used, meshesWithUv1: uv1n, lmSolids: [lmS.image.width, lmS.image.height], lmFloor: [lmF.image.width, lmF.image.height],
      type: lmS.type === THREE.HalfFloatType ? 'HalfFloat' : lmS.type, flipY: lmS.flipY, channel: lmS.channel, colorSpace: lmS.colorSpace, lmflip: LMFLIP }; }
  // display bed details: pillow + throw on the anchor bed, so it reads from above
  const anc = WD.solids.find(s => s.kind === 'bed_anchor');
  { const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.5), mat(0xf2efe8)); p.position.set((anc.x0 + anc.x1) / 2, 0.67, anc.z0 + 0.35); store.add(p);
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.05, 1.0), mat(COL.mustard)); t.position.set((anc.x0 + anc.x1) / 2, 0.63, anc.z1 - 0.55); store.add(t); }
  const CEIL = [];   // ceiling structure is shown only in high plan shots, so it never blocks the floor plan
  // ceiling structure: a light truss grid with cold lamp boxes, high above the walls (does not hide the floor plan)
  { const tr = [], lamps = []; for (let x = -36; x <= 36; x += 9) { const g = new THREE.BoxGeometry(0.12, 0.12, 52); g.translate(x, 6.2, 0); tr.push(g); }
    for (let z = -26; z <= 26; z += 13) { const g = new THREE.BoxGeometry(72, 0.1, 0.1); g.translate(0, 6.15, z); tr.push(g); }
    for (let x = -31.5; x <= 31.5; x += 9) for (let z = -19.5; z <= 19.5; z += 13) { const g = new THREE.BoxGeometry(1.6, 0.08, 0.35); g.translate(x, 6.05, z); lamps.push(g); }
    const trm = new THREE.Mesh(merge(tr), mat(0x2a2d31, { metalness: 0.5 })); store.add(trm); CEIL.push(trm);
    const lm = new THREE.Mesh(merge(lamps), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeeff, emissiveIntensity: 1.6 })); store.add(lm); CEIL.push(lm);
    // lamp pools: soft cold light on the floor under each lamp
    const pool = canvasTex(256, 256, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(220,235,255,0.55)'); g.addColorStop(1, 'rgba(220,235,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
    const pg = []; for (let x = -31.5; x <= 31.5; x += 9) for (let z = -19.5; z <= 19.5; z += 13) { const g = new THREE.PlaneGeometry(7, 7); g.rotateX(-Math.PI / 2); g.translate(x, 0.03, z); pg.push(g); }
    { const pm = new THREE.Mesh(merge(pg), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })); pm.visible = !BAKE; store.add(pm); } }

  // ---------------------------------------------------------------- doors (sliding pairs / swing doors / exit shutter), animated from the door state machine
  const DOORS = WD.doors.map((d, di) => { const g = new THREE.Group(); g.position.set(d.x, 0, d.z); if (d.axis === 'z') g.rotation.y = Math.PI / 2; scene.add(g);
    const leaves = []; const hw = d.w / 2;
    if (d.kind === 'sliding') { const gl = new THREE.MeshStandardMaterial({ color: 0x9fd0d8, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }), fr = mat(COL.tealDeep, { metalness: 0.5, roughness: 0.4 });
      for (const sd of [-1, 1]) { const leaf = new THREE.Group(); const pane = new THREE.Mesh(new THREE.BoxGeometry(hw, 2.5, 0.05), gl); pane.position.y = 1.25; leaf.add(pane);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.08), fr); edge.position.set(-sd * hw / 2, 1.25, 0); leaf.add(edge); leaf.userData = { closed: sd * hw / 2, sd }; g.add(leaf); leaves.push(leaf); }
      const hdr = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.4, 0.3, 0.3), fr); hdr.position.y = 2.65; g.add(hdr); }
    else { const dm = mat(d.staff ? COL.mustard : COL.teal, { roughness: 0.6 }); const leaf = new THREE.Group(), hg = d.hinge ?? -1, sdir = d.dir ?? 1, Lp = d.w - 0.07; const p = new THREE.Mesh(new THREE.BoxGeometry(Lp, 2.3, 0.06), dm); p.position.set(-hg * Lp / 2, 1.15, 0); leaf.add(p);
      leaf.position.set(hg * (hw - 0.035), 0, sdir * 0.035); leaf.userData = { swing: true, hg, sdir, Lp }; /* hinge side + swing direction fitted by bureau_validate.js --fit-doors */ g.add(leaf); leaves.push(leaf); p.castShadow = true; }
    let shutter = null; if (d.id === 'exit') { shutter = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.2, 2.8, 0.08), mat(COL.mustard, { roughness: 0.5, metalness: 0.3 })); shutter.position.set(0, 1.4, 0.2); g.add(shutter);
      const lab = textPlane('EXIT RELOCATED', 3.2, '#b3261e'); lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.03, 1.2); g.add(lab); shutter.userData.lab = lab; }
    return { d, di, g, leaves, shutter }; });
  const updateDoors = f => { for (const D of DOORS) { const o = TL.door_open[D.di][f];
    for (const lf of D.leaves) { if (lf.userData.swing) lf.rotation.y = lf.userData.hg * lf.userData.sdir * o * Math.PI / 2 * 0.95; else lf.position.x = lf.userData.closed + lf.userData.sd * o * (D.d.w / 2 - 0.05); }
    if (D.shutter) { const up = f >= F.layArrow ? smooth((f - F.layArrow) / 40) : 0; D.shutter.position.y = 1.4 + up * 2.6; D.shutter.userData.lab.visible = up < 0.5; } } };

  // ---------------------------------------------------------------- floor route arrows: instanced; local arrow points +z, yaw = atan2(t.x, t.z) maps +z onto travel
  const GLITCH0 = F.pre - 75, GLITCH1 = F.snap, PV = (TL.pivots || [])[0];
  const arrowGeo = (() => { const v = [[0, 0.45], [-0.32, 0], [0.32, 0], [-0.12, 0.02], [0.12, 0.02], [-0.12, -0.4], [0.12, -0.4]]; const P = i => [v[i][0], 0, v[i][1]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...P(0), ...P(1), ...P(2), ...P(3), ...P(5), ...P(4), ...P(4), ...P(5), ...P(6)], 3)); g.computeVertexNormals(); return g; })();
  const ARW = []; for (let s0 = 1.6; s0 < S[F.door]; s0 += 3.2) { const p = posAt(s0), t = headAt(s0), n = V3(-t.z, 0, t.x); ARW.push({ s: s0, p: p.add(n.multiplyScalar(0.55)).setY(0.03), yaw: Math.atan2(t.x, t.z), detour: PV ? Math.abs(s0 - PV.s) < 7.5 : false }); }
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ color: COL.mustard, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x3a2a00 }), ARW.length); store.add(arrows);
  const dmy = new THREE.Object3D(), hsh = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const updateArrows = (f, wpos) => { const g = f >= GLITCH0 && f < GLITCH1 ? smooth((f - GLITCH0) / 20) * (1 - smooth((f - GLITCH1 + 10) / 10)) : 0;
    ARW.forEach((a, i) => { let yaw = a.yaw, sc = 1; if (a.detour && f >= GLITCH1) sc = 0;                    // the store corrects itself: the dead-end arrows vanish at the snap
      if (g > 0 && a.p.distanceTo(wpos) < 28) { const j = Math.floor(f / 4); yaw += g * (hsh(i, j) - 0.5) * 5.5; if (hsh(i, j + 99) < 0.12 * g) sc = 0; }
      dmy.position.copy(a.p); dmy.rotation.set(0, yaw, 0); dmy.scale.setScalar(sc); dmy.updateMatrix(); arrows.setMatrixAt(i, dmy.matrix); }); arrows.instanceMatrix.needsUpdate = true; return g; };
  function F_DOOR_S() { return S[F.door]; }

  // ---------------------------------------------------------------- Wolfgang placeholder: wolf + top hat + velvet coat + brass lantern + trolley (reads from above)
  const wolf = new THREE.Group(); scene.add(wolf);
  // OUTFITS: canon wolf (white/silver fur, cyber eye) + a per-video wardrobe. 'velvet' = Case File look (Bureau brief); 'noir' = Dream Eater look.
  const OUTFITS = { velvet: { coat: 0x4a1d5e, trim: 0xc9a43a, hat: 0x3a174a, gear: true, feather: true, glasses: true, monocle: false, cyberHand: true, lantern: true },
                    noir: { coat: 0x26272c, trim: 0x3a3d42, hat: null, gear: false, feather: false, glasses: false, monocle: true, cyberHand: false, lantern: false } };
  const OUT = OUTFITS[Q.get('outfit') || WD.outfit || 'velvet'] || OUTFITS.velvet;
  const coatM = mat(OUT.coat, { roughness: 0.95 }), furM = mat(0xdfe3ea, { roughness: 1 }), hatM = mat(OUT.hat || 0x111214, { roughness: 0.75 }), trimM = mat(OUT.trim, { metalness: 0.8, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 1.15, 16), coatM); body.position.y = 0.95; body.castShadow = true; wolf.add(body);
  const tails = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 16, 1, true), coatM); tails.position.y = 0.38; wolf.add(tails);
  const head = new THREE.Group(); head.position.y = 1.68; wolf.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), furM)); const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 10), furM); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.03, 0.2); head.add(snout);
  for (const sd of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), furM); ear.position.set(sd * 0.1, 0.17, -0.02); ear.rotation.z = -sd * 0.25; head.add(ear);
    if (OUT.glasses) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 16), mat(0xc8b27a, { metalness: 1, roughness: 0.3 })); ring.position.set(sd * 0.06, 0.03, 0.15); head.add(ring); } }
  const hat = new THREE.Group(); hat.position.y = 0.14; head.add(hat); hat.visible = !!OUT.hat; hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 20), hatM));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.3, 20), hatM); crown.position.y = 0.16; hat.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.05, 20), trimM); band.position.y = 0.05; hat.add(band);
  if (OUT.gear) { const gear = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 10), trimM); gear.position.set(0.12, 0.12, 0.06); gear.rotation.y = 1.2; hat.add(gear); }
  if (OUT.feather) { const fth = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x1f8f7a, emissive: 0x0a3a40, side: THREE.DoubleSide })); fth.position.set(0.13, 0.28, -0.02); fth.rotation.z = -0.35; hat.add(fth); }
  // coat trim (gold piping down the front, cuffs) and the chrome cyber hand
  { const pip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.02), trimM); pip.position.set(0, 0.95, 0.27); wolf.add(pip);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 18, Math.PI * 1.4), coatM); collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.8); collar.position.y = 1.5; wolf.add(collar);
    if (OUT.cyberHand) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0xc7cdd3, { metalness: 1, roughness: 0.18 })); hand.position.set(-0.3, 1.0, 0.42); wolf.add(hand); }
    if (OUT.monocle) { const mono = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.4) })); mono.position.set(0.06, 0.03, 0.16); head.add(mono); } }
  const lantern = new THREE.Group(); lantern.position.set(0.38, 0.85, 0.05); wolf.add(lantern);
  lantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), mat(0xb08a3a, { metalness: 0.9, roughness: 0.35 })));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.6) })); lantern.add(flame);
  const lanternLight = new THREE.PointLight(0xffa640, 6, 7, 2); lantern.add(lanternLight);
  // ================================================================ v10e WOLFGANG: approved sprite atlas, 2.5D. The placeholder group above stays as the invisible
  // authoritative transform (navigation, map, trolley all read `wolf`); every placeholder mesh is hidden. No fallback: a missing asset is an engine error.
  const ATL = await (await fetch('atlas_map.json')).json();
  const texL = new THREE.TextureLoader();
  let atlasTex, normalTex;
  try { [atlasTex, normalTex] = await Promise.all([texL.loadAsync('Master_Sprite_Atlas.png'), texL.loadAsync('Master_Normal_Atlas.png')]); }
  catch (e) { throw new Error('WOLFGANG ASSET LOAD FAILED (Master_Sprite_Atlas.png / Master_Normal_Atlas.png): refusing to render a placeholder'); }
  if (!atlasTex.image || atlasTex.image.width !== ATL.atlas_w || normalTex.image.width !== ATL.atlas_w) throw new Error('WOLFGANG ATLAS SIZE MISMATCH');
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8; normalTex.colorSpace = THREE.NoColorSpace;
  const SPS = (ATL.animations.walk_side.world_height_m || 1.95) / ATL.cell_h;              // metres per atlas pixel (1.95 m per 512 px cell)
  // Lighting decision (v10e): the painted atlas already carries its own form shading, so Wolfgang is NOT re-lit by the scene's live lights
  // (they tinted him orange/red and crushed the coat). He is tinted by the SAME baked irradiance the floor receives at his feet (bake v2),
  // so he sits in the store's light; the normal atlas (luminance-embossed, not authored normals) is not used.
  const irrAt = (x, z) => { if (!LMF) return 0.9; const im = LMF.image, Wd = im.width, Hd = im.height, d = im.data, u = (x + 36) / 72, v = (26 - z) / 52; let acc = 0, n = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = Math.round(clamp(u, 0, 1) * (Wd - 1)) + di * 6, j = Math.round(clamp(v, 0, 1) * (Hd - 1)) + dj * 6; if (i < 0 || j < 0 || i >= Wd || j >= Hd) continue;
      const k = (j * Wd + i) * 4, toF = typeof d[k] === 'number' && d instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (q => q); acc += (toF(d[k]) + toF(d[k + 1]) + toF(d[k + 2])) / 3; n++; } return n ? acc / n : 0.9; };
  const sprMat = new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, alphaTest: 0.06, side: THREE.DoubleSide });
  if (BAKE) for (const D of DOORS) { const L_ = Math.min(1.1, irrAt(D.d.x, D.d.z)); D.g.traverse(o => { if (o.isMesh && !o.userData.bk) { const m0 = o.material;
      o.material = new THREE.MeshBasicMaterial({ color: m0.color.clone().multiplyScalar(L_), transparent: m0.transparent, opacity: m0.opacity, map: m0.map || null }); o.userData.bk = true; } }); }
  const sprGeo = new THREE.PlaneGeometry(1, 1), sprite = new THREE.Mesh(sprGeo, sprMat); sprite.renderOrder = 3;
  const sprGroup = new THREE.Group(); const sprTilt = new THREE.Group(); sprGroup.add(sprTilt); sprTilt.add(sprite); scene.add(sprGroup);
  const uvA = sprGeo.attributes.uv;
  const setFrame = (anim, i, mirror) => { const fr = ATL.animations[anim].frames[i], [x, y, w, h] = fr.rect, [px, py] = fr.pivot, AW = ATL.atlas_w, AH = ATL.atlas_h;
    const u0 = x / AW, u1 = (x + w) / AW, v0 = 1 - (y + h) / AH, v1 = 1 - y / AH;            // atlas rects are top-left origin (atlas_map v_flip_note)
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    const L = mirror ? u1 : u0, R = mirror ? u0 : u1; uvA.setXY(0, L, v1); uvA.setXY(1, R, v1); uvA.setXY(2, L, v0); uvA.setXY(3, R, v0); uvA.needsUpdate = true;
    sprite.scale.set(w * SPS, h * SPS, 1); const ox = (mirror ? -1 : 1) * (w / 2 - px) * SPS; sprite.position.set(ox, (py - h / 2) * SPS, 0); /* pivot (feet) at the group origin */
  };
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
      const mk = c => new THREE.MeshBasicMaterial({ map: atlasTex, alphaTest: 0.5, side: THREE.DoubleSide, color: c });
      this.mats = [mk(0xffffff), mk(0xffffff), mk(0x8a8a90)]; this.body = buildSkin(bodyRig, this.mats[0], 0);
      this.legs = { near: buildSkin(legRig, this.mats[1], -1.5), far: buildSkin(legRig, this.mats[2], -3.0) };
      const at = bodyRig.leg_attach, lb = bodyRig.bones.find(b => b[0] === 'legs'), hipX = lb[2]; this.hipY0 = lb[3]; this.groundY = bodyRig.pivot[1];
      for (const k of ['near', 'far']) { const L = this.legs[k]; this.body.B.legs.add(L.mesh); L.mesh.position.set(at[k][0] - hipX, 0, 0); L.mesh.scale.setScalar(legRig.scale_to_push || 1); }
      const J = legRig.joints; this.l1 = J.knee[1] - J.hip[1]; this.l2 = J.ankle[1] - J.knee[1]; this.soleD = J.sole - J.ankle[1];
      { const hd = bodyRig.bones.find(b => b[0] === 'head'), sh = new THREE.Shape(); bodyRig.mouth.forEach(([x, y], i) => i ? sh.lineTo(x - hd[2], -(y - hd[3])) : sh.moveTo(x - hd[2], -(y - hd[3])));
        this.mouthM = new THREE.MeshBasicMaterial({ color: 0xd2d6db, side: THREE.DoubleSide }); const mm = new THREE.Mesh(new THREE.ShapeGeometry(sh), this.mouthM); mm.position.z = -0.6; this.body.B.head.add(mm); }   /* closed-mouth fill (v9 mouth polygon) */
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
    set mirror(m) { this.flip.scale.set(m ? -1 : 1, 1, 1); }
    tint(c) { this.mouthM.color.setHex(0xd2d6db).multiply(c); this.mats[0].color.copy(c); this.mats[1].color.copy(c); this.mats[2].color.copy(c).multiplyScalar(0.55); } }
  if (!ATL.rigs || !ATL.rigs.push_body || !ATL.rigs.leg) throw new Error('WOLFGANG PUSH RIG MISSING in atlas_map.json');
  const pushRig = new CutoutPush(ATL.rigs.push_body, ATL.rigs.leg); scene.add(pushRig.root);
  const CART_AHEAD = (560 - ATL.rigs.push_body.pivot[0]) * SPS;                             // drawn cart centre ahead of the rig pivot (measured: 0.87 m)
  const WSTAT = { frames: 0, front: 0, side: 0, side_mirrored: 0, back: 0, idle: 0, push_rig: 0, push_front_back_no_contact: 0 }; window.wolfStats = WSTAT;
  // thread belt anchor: the thread rises from the floor to a fixed point at his belt (hip height, camera side) so it never ends in mid-air
  const beltM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.58, 0.09) }), belt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), beltM); belt.visible = false; scene.add(belt);
  const feet = [-1, 1].map(sd => { const f_ = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), mat(0x1a1a1c)); f_.position.set(sd * 0.12, 0.04, 0); wolf.add(f_); return f_; });
  const trolley = new THREE.Group(); scene.add(trolley);
  { const wire = mat(0xb8bec4, { metalness: 0.9, roughness: 0.3, wireframe: false }); const bas = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.85), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0.55 }));
    bas.position.y = 0.72; trolley.add(bas); const rim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.89), wire); rim.position.y = 0.98; trolley.add(rim);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.06), mat(COL.red)); handle.position.set(0, 1.02, -0.5); trolley.add(handle);
    const box_ = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.72), mat(COL.birch)); box_.position.y = 1.02; trolley.add(box_); trolley.userData.box = box_;
    for (const [x, z] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.35], [0.25, 0.35]]) { const w_ = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), mat(0x222222)); w_.rotation.z = Math.PI / 2; w_.position.set(x, 0.06, z); trolley.add(w_); }
    trolley.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.18), mat(COL.teal)); bag.position.set(-0.36, 0.6, 0); wolf.add(bag);

  // ---------------------------------------------------------------- MINO-7000: bull-headed industrial floor polisher
  const mino = new THREE.Group(); scene.add(mino);
  const steel = mat(0x5d6268, { metalness: 0.7, roughness: 0.35 }), red = mat(COL.red, { roughness: 0.5 });
  { const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.3), red); base.position.y = 0.4; mino.add(base);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), steel); hood.position.set(0, 0.85, -0.1); mino.add(hood);
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.5), steel); headM.position.set(0, 1.1, 0.5); mino.add(headM);
    for (const sd of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 10), mat(0xe8e2d4, { roughness: 0.4 })); horn.position.set(sd * 0.42, 1.4, 0.48); horn.rotation.z = -sd * 1.0; mino.add(horn); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.35, 0.2) })); eye.position.set(0, 1.12, 0.76); mino.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), mat(0xc8b27a, { metalness: 1, roughness: 0.3 })); ring.position.set(0, 0.92, 0.77); mino.add(ring);
    mino.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
  const brushes = [-0.28, 0.28].map(x => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20), mat(0x1c1c1e)); b.position.set(x, 0.08, 0.1); mino.add(b);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), mat(0xe8e2d4)); bar.position.y = 0.05; b.add(bar); return b; });
  const sensorLight = new THREE.SpotLight(0xff2a1a, 30, 16, 0.32, 0.6, 1.5); sensorLight.position.set(0, 1.1, 0.8); mino.add(sensorLight); mino.add(sensorLight.target); sensorLight.target.position.set(0, 0, 6);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(11, 32, -0.3 + Math.PI / 2, 0.6), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  fan.rotation.x = -Math.PI / 2; const fanPivot = new THREE.Group(); fanPivot.add(fan); scene.add(fanPivot); fan.visible = false;
  // occluded fan: 25 rays from MINO, each stopped by the first wall / tall unit / closed door (same rays feed the map)
  const FANR = 25, FANA = 0.3, FANL = 11, fanG = new THREE.BufferGeometry(); fanG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((FANR - 1) * 9), 3));
  const fan2 = new THREE.Mesh(fanG, fan.material); fan2.frustumCulled = false; fanPivot.add(fan2); const FANPTS = [];
  const updateFan = (m, yawS, f) => { const pa = fanG.attributes.position.array; FANPTS.length = 0;
    for (let i = 0; i < FANR; i++) { const a = -FANA + 2 * FANA * i / (FANR - 1), L = rayLen(m.x, m.z, yawS + a, FANL, f); FANPTS.push([m.x + Math.sin(yawS + a) * L, m.z + Math.cos(yawS + a) * L, a, L]); }
    for (let i = 0; i < FANR - 1; i++) { const [, , a0, l0] = FANPTS[i], [, , a1, l1] = FANPTS[i + 1]; pa.set([0, 0, 0, Math.sin(a0) * l0, 0, Math.cos(a0) * l0, Math.sin(a1) * l1, 0, Math.cos(a1) * l1], i * 9); }
    fanG.attributes.position.needsUpdate = true; };
  const OCC = WD.solids.filter(s => s.h >= 1.4);
  const doorR = d => d.axis === 'x' ? { x0: d.x - d.w / 2, z0: d.z - 0.08, x1: d.x + d.w / 2, z1: d.z + 0.08 } : { x0: d.x - 0.08, z0: d.z - d.w / 2, x1: d.x + 0.08, z1: d.z + d.w / 2 };
  const segRect = (ax, az, bx, bz, r) => { let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return 1; } else { const t = q / p; if (p < 0) { if (t > t1) return 1; if (t > t0) t0 = t; } else { if (t < t0) return 1; if (t < t1) t1 = t; } } } return t0; };
  const rayLen = (ax, az, ang, L, f) => { const bx = ax + Math.sin(ang) * L, bz = az + Math.cos(ang) * L; let t = 1;
    for (const r of OCC) t = Math.min(t, segRect(ax, az, bx, bz, r)); WD.doors.forEach((d, di) => { if (TL.door_open[di][f] < 0.5) t = Math.min(t, segRect(ax, az, bx, bz, doorR(d))); }); return t * L; };
  const los = (m, w, f) => { const L = Math.hypot(w.x - m.x, w.z - m.z); return rayLen(m.x, m.z, Math.atan2(w.x - m.x, w.z - m.z), L, f) >= L - 1e-3; };
  window.losAt = f => { const m = minoXZ(f), w = posAt(S[f]); return m ? los(m, w, f) : null; };
  // sensor yaw per frame: sweeps +-60 deg until Wolfgang falls inside the beam within 16 m (detection), then locks on with a limited turn rate
  const MSN = TL.mino_states || [], mstate = f => MSN[(TL.mino_state || [])[f]] || 'chase';
  const SENS = new Float32Array(N); let DETECT = -1; { let ys = 0;
    for (let f = F.minoReveal; f < N; f++) { const m = minoXZ(f); if (!m) continue; const st = mstate(f), body = TL.mino_yaw ? TL.mino_yaw[f] : 0, t = (f - F.minoReveal) / FPS; let tgt;
      if (st === 'chase') { const ls = TL.mino_last_seen[f], p = posAt(ls >= 0 ? ls : S[f]); tgt = Math.atan2(p.x - m.x, p.z - m.z); if (DETECT < 0) DETECT = f; }   // aims at the LAST SEEN point
      else if (st === 'search') tgt = body + Math.sin(t * 1.6) * 1.5;          // wide sweep where it lost him
      else if (st === 'patrol') tgt = body + Math.sin(t * 2.4) * 1.05;
      else if (st === 'track') tgt = body + Math.sin(t * 3.0) * 0.35;          // nose down the thread
      else tgt = body;
      let d = tgt - ys; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ys += clamp(d, -0.12, 0.12); SENS[f] = ys; } }
  const warnRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 48), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  warnRing.rotation.x = -Math.PI / 2; scene.add(warnRing);

  wolf.traverse(o => { if (o.isMesh) o.visible = false; }); lanternLight.intensity = 0; wolf.userData.placeholderHidden = true;
  // ---------------------------------------------------------------- dynamic ribbons: amber thread (on the walked route) and MINO's polished trail
  const ribbon = (matr, maxN) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(maxN * 6), 3)); g.setIndex(Array.from({ length: (maxN - 1) * 6 }, (_, i) => { const q = (i / 6) | 0, k = i % 6; return [0, 1, 2, 2, 1, 3][k] + q * 2; }));
    const m = new THREE.Mesh(g, matr); m.frustumCulled = false; scene.add(m); return { m, g, maxN }; };
  const setRibbon = (R, a, b, w, y, off = 0) => { const pos = R.g.attributes.position.array; const n = Math.min(R.maxN, Math.max(2, Math.ceil((b - a) / 0.25) + 1));
    for (let i = 0; i < R.maxN; i++) { const s = a + (b - a) * Math.min(1, i / (n - 1)), p = posAt(s), t = headAt(s), nx = -t.z, nz = t.x;
      pos.set([p.x + nx * (off - w / 2), y, p.z + nz * (off - w / 2), p.x + nx * (off + w / 2), y, p.z + nz * (off + w / 2)], i * 6); }
    R.g.attributes.position.needsUpdate = true; R.g.setDrawRange(0, (n - 1) * 6); R.m.visible = b > a; };
  const thread = ribbon(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.75, 0.78, 0.1) }), 2400);
  const trail = ribbon(new THREE.MeshBasicMaterial({ color: 0xf4f7fb, transparent: true, opacity: 0.35, depthWrite: false }), 200);

  // ---------------------------------------------------------------- overhead Bureau floor-plan camera (primary camera, all song)
  const CAMSMOOTH = new Array(N); { const raw = []; for (let f = 0; f < N; f++) raw.push(posAt(S[f]));
    for (let f = 0; f < N; f++) { const sec = secAt(f).name, k = /Chorus/.test(sec) ? 8 : 24; let x = 0, z = 0, n = 0; for (let j = f - k; j <= f + k; j++) { const p = raw[clamp(j, 0, N - 1)]; x += p.x; z += p.z; n++; } CAMSMOOTH[f] = V3(x / n, 0, z / n); } }
  const overAt = f => { const sec = secAt(f).name, t = f / FPS, P = CAMSMOOTH[f];
    let h = 24, fov = 40, back = 0.42;
    if (sec === 'Intro') { const u = smooth((f - 30) / (F.pickBox - 30)); h = lerp(82, 22, u); }
    else if (/Pre-Chorus/.test(sec)) h = 20; else if (sec === 'Final Chorus') h = 15; else if (/Chorus/.test(sec)) h = 15.5; else if (/Break/.test(sec)) h = 19; else if (/Verse/.test(sec)) h = 21;
    if (f >= F.minoReveal && f < F.minoReveal + 150) h = lerp(h, 17, smooth((f - F.minoReveal) / 40));
    let tgt = P.clone(); if (sec === 'Intro') tgt.lerpVectors(V3(0, 0, 2), P, smooth((f - 30) / (F.pickBox - 30)));
    if (f >= F.ext) { const u = smooth((f - F.ext) / 240); h = lerp(16, 95, u); tgt.lerpVectors(P, V3(0, 0, -6), u); }
    const pos = V3(tgt.x, h, tgt.z + h * back); return { pos, look: tgt, fov }; };

  // ---- shot director: manifest camera_mode is the intent; the overhead floor plan stays the anchor
  const SOLC = WD.solids.filter(o => o.h > 0.5);
  const blockedAt = (x, y, z) => SOLC.some(o => y < o.h + 0.25 && x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3) || Math.abs(x) > 35.7 || z > 25.7 || (z < -25.7 && z > -26.5);
  const clampCam = (from, to) => { const d = to.clone().sub(from), L = d.length(); d.normalize(); let ok = 0.5; for (let u = 0.3; u <= L; u += 0.1) { const p = from.clone().addScaledVector(d, u); if (blockedAt(p.x, p.y, p.z)) break; ok = u; }
    return from.clone().addScaledVector(d, Math.max(0.5, ok - 0.25)); };
  const yawSm = f => { let sx = 0, sz = 0; for (let j = f - 10; j <= f + 10; j++) { const y = TL.yaw[clamp(j, 0, N - 1)]; sx += Math.sin(y); sz += Math.cos(y); } return Math.atan2(sx, sz); };
  const mYaw = f => { const m = minoXZ(f); if (!m) return 0; const m2 = minoXZ(Math.min(N - 1, f + 3)) || m; const d = m2.clone().sub(m); return d.lengthSq() > 1e-6 ? Math.atan2(d.x, d.z) : headAtYaw(SM[f]); };
  const headAtYaw = s0 => { const h_ = headAt(s0); return Math.atan2(h_.x, h_.z); };
  const shotAt = f => { const mode = (telAt(f).camera_mode || 'MAP'), t = f / FPS, bar = Math.floor(beatAt(t) / 4), mOn = TL.mino_on[f] && SM[f] >= 0 && f >= F.minoReveal + WD.emerge_frames;
    if (QASHOT) return QASHOT; if (mode === 'BLACK') return 'black'; if (MAPCHK[f]) return 'map'; if (mode === 'MAP' && f >= F.minoReveal) { const H_ = (TL.holds || [])[0]; return H_ && f < H_.stop[1] + 15 ? 'w3side' : 'w3'; }   /* tail of capped check-in 4: ground-level door wait */ if (f < F.pickBox && mode !== 'FPV') return 'over'; if (f >= F.ext && mode !== 'FPV') return 'over';
    if (mode === 'FPV') return 'w1'; if (mode === 'SCROLL') return 'w3side'; if (mode === 'MAP_ORBIT') return 'orbit'; if (mode === 'SCAN') return 'pan';
    if (mode === 'CLOSE') return mOn ? 'm1' : 'w3close'; if (mode === 'CHASE_LOW') return mOn ? 'm3low' : 'w3';
    if (mode === 'CHASE_FAST') { const k = ((bar % 4) + 4) % 4; return k < 2 ? 'over' : k === 2 ? 'w3' : (mOn ? 'm3' : 'w3'); }
    return 'over'; };
  const camAt = f => { const shot = shotAt(f); if (shot === 'black') return Object.assign(overAt(f), { shot }); const P = posAt(S[f]), yw = yawSm(f), hh = V3(Math.sin(yw), 0, Math.cos(yw)), nn = V3(-hh.z, 0, hh.x), base = P.clone().setY(1.4);
    if (shot === 'over' || shot === 'map') return Object.assign(overAt(f), { shot });
    if (shot === 'orbit' || shot === 'pan') { const o = overAt(f), k = f - evStartF(f), a = shot === 'orbit' ? k * 0.006 : Math.sin(k * 0.012) * 0.35, r = o.pos.clone().sub(o.look);
      r.applyAxisAngle(V3(0, 1, 0), a); return { pos: o.look.clone().add(r), look: o.look, fov: o.fov, shot }; }
    if (shot === 'w1') { const pos = P.clone().addScaledVector(hh, 0.12).setY(1.62), lookDown = /look down|bag/i.test(telAt(f).special_events || '') || f >= F.halfShelf - 80;
      return { pos, look: P.clone().addScaledVector(hh, lookDown ? 0.9 : 5).setY(lookDown ? 0.3 : 1.05), fov: 62, near: 0.05, shot }; }
    if (shot === 'w3') return { pos: clampCam(base, P.clone().addScaledVector(hh, -3.6).setY(2.5)), look: P.clone().addScaledVector(hh, 2).setY(1.2), fov: 52, near: 0.05, shot };
    if (shot === 'w3close') return { pos: clampCam(base, P.clone().addScaledVector(hh, 2.2).setY(1.75)), look: P.clone().setY(1.55), fov: 40, near: 0.05, shot };
    if (shot === 'w3side') { let best = null; for (const sd of [1, -1]) { const c = clampCam(base, P.clone().addScaledVector(nn, sd * 4.4).setY(1.85)); const d = c.distanceTo(base); if (!best || d > best.d) best = { c, d }; }
      return { pos: best.c, look: P.clone().addScaledVector(hh, 0.8).setY(1.15), fov: 50, near: 0.05, shot }; }
    const m = minoXZ(f); if (!m) return Object.assign(overAt(f), { shot: 'over' }); const my = mYaw(f), mh = V3(Math.sin(my), 0, Math.cos(my)), mb = m.clone().setY(1.2);
    if (shot === 'm1') { const sy = SENS[f] || my, sd = V3(Math.sin(sy), 0, Math.cos(sy)); const pos = m.clone().addScaledVector(mh, 0.85).setY(1.15); return { pos, look: pos.clone().addScaledVector(sd, 6).setY(0.7), fov: 70, near: 0.05, shot }; }
    if (shot === 'm3') return { pos: clampCam(mb, m.clone().addScaledVector(mh, -3.3).setY(2.0)), look: m.clone().addScaledVector(mh, 3).setY(0.9), fov: 56, near: 0.05, shot };
    if (shot === 'm3low') return { pos: clampCam(mb, m.clone().addScaledVector(mh, -2.4).addScaledVector(V3(-mh.z, 0, mh.x), 0.8).setY(0.55)), look: m.clone().addScaledVector(mh, 4).setY(0.9), fov: 60, near: 0.05, shot };
    return Object.assign(overAt(f), { shot: 'over' }); };
  const evStartF = f => { let k = f; const md = telAt(f).camera_mode; while (k > 0 && telAt(k - 1).camera_mode === md) k -= 30; while (k < f && telAt(k).camera_mode !== md) k++; return k; };

  // ---------------------------------------------------------------- HUD: diegetic Bureau receipt + debug
  const SPOOL = WD.spool_m;
  function hud(f) { const th = TL.thread[f], used = th ? th[1] - TL.s_anchor : 0, m = minoXZ(f), w = posAt(S[f]);
    const d = m && TL.mino_on[f] ? m.distanceTo(w) : Infinity, mst = mstate(f), prox = mst === 'patrol' ? 'PATROLLING' : mst === 'track' ? 'FOLLOWING THREAD' : mst === 'search' || mst === 'lost' ? '<b class="a">SEARCHING</b>' : mst !== 'chase' ? 'SCANNING' : d < 6 ? '<b class="r">DANGER</b>' : d < 14 ? '<b class="a">CAUTION</b>' : 'TRACKING';
    const parts = f >= F.halfShelf ? '1 / 2' : f >= F.pickBox ? '1 / 2 (BOXED)' : '0 / 2';
    const exit = f >= F.layArrow ? 'OPEN' : 'RELOCATED';
    $('rcpt').innerHTML = `<div class="hd">BUREAU &amp; CO.</div><div class="sl">HOME, ADMINISTERED.</div><hr>
      <div>CUSTOMER STATUS: ${f >= F.minoReveal && f < F.door ? 'PURSUED' : 'ACTIVE'}</div><div>PURCHASE OBJECTIVE: ONE SHELF</div><div>SHELF PARTS: ${parts}</div>
      <div>THREAD REMAINING: ${f >= F.tie ? Math.max(0, SPOOL - used).toFixed(0) + ' m' : 'NOT ANCHORED'}</div><div>MINO PROXIMITY: ${TL.mino_on[f] ? prox : 'NOT DETECTED'}</div><div>EXIT STATUS: ${exit}</div><hr><div class="ft">#${String(f).padStart(5, '0')}  THANK YOU FOR NAVIGATING</div>`;
    if (DEBUG) { const t = f / FPS, b = beatAt(t), tel = telAt(f), sec = secAt(f).name, zn = WD.zones.find(z => w.x >= z.x0 && w.x <= z.x1 && w.z >= z.z0 && w.z <= z.z1);
      $('debug').textContent = `FRAME ${f} / ${N}  T ${t.toFixed(3)} s  @ ${FPS} fps  ${W}x${H}\nBPM manifest ${M.bpm}  beat ${b}  bar ${(b / 4 + 1).toFixed(1)}\nSECTION ${sec}  STATE ${tel.sprite_state}  CAM ${tel.camera_mode || '-'}\nEVENT ${String(tel.special_events || '').slice(0, 60)}\nZONE ${zn ? zn.name : 'OUTSIDE'}  s ${S[f].toFixed(1)} / ${LEN.toFixed(1)} m  NAV TEST PASS` + (m && TL.mino_on[f] ? `  MINO ${d.toFixed(1)} m` : ''); } }

  // ---------------------------------------------------------------- lyric set dressing: the store says what the song says, where he is when it is sung
  const TONE = { yellow: ['#e8b923', '#1d1f22'], teal: ['#1f5f6b', '#f4f1ea'], red: ['#b3261e', '#f4f1ea'], gold: ['#c9a43a', '#2a1d05'] };
  const boardTex = (txt, tone, wM, hM) => canvasTex(Math.round(Math.max(256, 160 * wM)), Math.round(Math.max(64, 160 * hM)), (c, w, h) => { const [bg, fg] = TONE[tone] || TONE.teal; c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg + '55'; c.lineWidth = Math.max(3, h * 0.04); c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.12 > 0 ? h - h * 0.12 : h); c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = h * 0.56; c.font = `800 ${fs}px DejaVu Sans`; while (c.measureText(txt).width > w * 0.9 && fs > 8) { fs -= 2; c.font = `800 ${fs}px DejaVu Sans`; } c.fillText(txt, w / 2, h / 2 + fs * 0.04); });
  const floorTex = (txt, tone, wM) => canvasTex(Math.round(160 * wM), Math.round(160 * wM / 4.5), (c, w, h) => { const col = (TONE[tone] || TONE.teal)[0]; c.clearRect(0, 0, w, h); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = h * 0.7; c.font = `900 ${fs}px DejaVu Sans`; while (c.measureText(txt).width > w * 0.94 && fs > 8) { fs -= 2; c.font = `900 ${fs}px DejaVu Sans`; } c.fillText(txt, w / 2, h / 2); });
  const DRESS = [], dmat = (c, o) => mat(c, o);
  const label = (txt, x, z, w = 2.6) => { const t = textPlane(txt, w, '#34373c', 'bold 120px DejaVu Sans'); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.03, z + 0.9); t.material.opacity = 0.9; store.add(t); return t; };
  const boxM = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || store).add(o); return o; };
  for (const e of (WD.dress || [])) { if (e.flipOf !== undefined && e.flipOf !== null) { const base = DRESS[e.flipOf]; if (base && base.texts) base.texts.push([e.f, boardTex(e.text, e.tone, base.e.w, base.hM)]); DRESS.push({ e, g: null, mats: [], flip: true }); continue; }
    const g = new THREE.Group(); g.position.set(e.x, 0, e.z); store.add(g); const it = { e, g, mats: [] };
    if (e.kind === 'sign') { const hM = e.big ? 1.3 : 0.9, wM = e.w; const m = new THREE.MeshStandardMaterial({ map: boardTex(e.text, e.tone, wM, hM), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: 0.6 });
      // lightbox: two printed faces leaning 32 deg off vertical (an A-frame), so it reads walking either way, from 3rd person and from overhead
      const yq = Math.round((e.yaw || 0) / (Math.PI / 2)) * (Math.PI / 2); g.rotation.y = yq; const y0 = 3.45 + hM / 2, frameM = dmat(COL.tealDeep, { metalness: 0.5, roughness: 0.4 });
      for (const sd of [1, -1]) { const face = new THREE.Mesh(new THREE.BoxGeometry(wM, hM, 0.05), sd > 0 ? [frameM, frameM, frameM, frameM, m, frameM] : [frameM, frameM, frameM, frameM, frameM, m]);
        face.position.set(0, y0, sd * 0.24); face.rotation.x = -sd * 0.56; face.castShadow = true; g.add(face); }
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(wM + 0.08, 0.06, 0.12), frameM); ridge.position.y = y0 + hM * 0.45; g.add(ridge);
      for (const xx of [-wM / 2 + 0.3, wM / 2 - 0.3]) { const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.2, 4), dmat(0x222222)); cb.position.set(xx, y0 + hM / 2 + 1.1, 0); g.add(cb); }
      it.mats.push(m); m.emissiveMap = m.map;
      it.texts = [[e.f, m.map]]; it.hM = hM; }
    else if (e.kind === 'floor') { const m = new THREE.MeshBasicMaterial({ map: floorTex(e.text, e.tone, e.w), transparent: true, depthWrite: false, opacity: 0.85 });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.w / 4.5), m); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.031; g.add(pl); it.mats.push(m);
      if (e.tile) { const tm = dmat(0xc9a43a, { metalness: 0.6, roughness: 0.3 }); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if ((i + j) % 2 === 0) boxM(0.9, 0.012, 0.9, tm, i * 0.95, 0.01, j * 0.95, g); } }
    else if (e.kind === 'prop') { const sh = e.shape, birch = dmat(COL.birch), dark = dmat(COL.charcoal), white = dmat(0xf2efe8), must = dmat(COL.mustard), tealM = dmat(COL.teal);
      if (sh === 'clock') { boxM(0.08, 2.0, 0.08, dark, 0, 1.0, 0, g); const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 32), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c) => { c.fillStyle = '#f4f1ea'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill(); c.fillStyle = '#1d1f22'; c.font = '900 92px DejaVu Sans'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('9:45', 128, 132); }) }));
        face.position.y = 2.3; g.add(face); }
      else if (sh === 'pencils') { boxM(0.36, 1.0, 0.36, tealM, 0, 0.5, 0, g); for (let i = 0; i < 7; i++) boxM(0.025, 0.3, 0.025, must, Math.cos(i) * 0.09, 1.15, Math.sin(i) * 0.09, g); }
      else if (sh === 'portrait') { boxM(0.1, 1.5, 1.3, dmat(0xb08a3a, { metalness: 0.7, roughness: 0.35 }), 0, 1.5, 0, g); boxM(0.12, 1.3, 1.1, dmat(0x6b5a4e), 0, 1.5, 0, g); }
      else if (sh === 'curtain') { for (let i = 0; i < 12; i++) boxM(0.12, 2.6, 0.4, dmat(i % 2 ? 0x8a2d26 : 0x9e3a30, { roughness: 1 }), Math.sin(i * 1.3) * 0.04, 1.3, -2.2 + i * 0.4, g); }
      else if (sh === 'table') { boxM(1.6, 0.06, 1.0, birch, 0, 0.75, 0, g); for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) boxM(0.05, 0.72, 0.05, dark, x, 0.36, z, g);
        for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20), white); pl.position.set(x, 0.79, z); g.add(pl); } }
      else if (sh === 'window') { boxM(0.1, 2.0, e.d, dark, 0, 1.2, 0, g); const pane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, e.d - 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.1) })); pane.position.y = 1.2; g.add(pane); }
      else if (sh === 'chair') { const c = new THREE.Group(); c.rotation.z = e.tilt || 0.2; c.rotation.y = 0.5; g.add(c); boxM(0.5, 0.05, 0.5, birch, 0, 0.46, 0, c); boxM(0.5, 0.5, 0.05, birch, 0, 0.72, -0.23, c);
        for (const [x, z, h] of [[-0.22, -0.22, 0.46], [0.22, -0.22, 0.4], [-0.22, 0.22, 0.46], [0.22, 0.22, 0.46]]) boxM(0.04, h, 0.04, dark, x, h / 2, z, c); }
      else if (sh === 'flatpack') { for (let i = 0; i < 5; i++) { const b = boxM(1.5 - i * 0.15, 0.025, 0.25, birch, (i - 2) * 0.05, 0.015 + i * 0.002, (i - 2) * 0.22, g); b.rotation.y = (i - 2) * 0.12; } }
      else if (sh === 'throws') { [0x6b3d5a, 0xc9a43a, 0x1f5f6b, 0x9e3a30, 0xe6e0d4].forEach((c, i) => boxM(1.0, 0.18, 0.9, dmat(c, { roughness: 1 }), 0, 0.09 + i * 0.19, 0, g)); }
      else if (sh === 'counter') { boxM(1.8, 0.9, 0.7, white, 0, 0.45, 0, g); const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), dmat(0x8d8a84, { roughness: 1 })); loaf.scale.set(1.5, 0.8, 1); loaf.position.set(0.3, 1.05, 0); g.add(loaf);
        const n7 = textPlane('No. 7', 1.2, '#1f5f6b'); n7.rotation.x = -Math.PI / 2; n7.position.set(-0.4, 0.92, 0); g.add(n7); }
      else if (sh === 'phone') { boxM(0.4, 0.9, 0.4, white, 0, 0.45, 0, g); boxM(0.26, 0.08, 0.18, dmat(0xb3261e), 0, 0.94, 0, g); const cord = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), dark); cord.rotation.x = Math.PI / 2; cord.position.set(0.12, 0.92, 0.1); g.add(cord); }
      else if (sh === 'drawer') { boxM(0.9, 0.8, 0.6, birch, 0, 0.4, 0, g); boxM(0.8, 0.18, 0.5, birch, 0, 0.62, 0.35, g); boxM(0.05, 0.005, 0.6, must, 0.1, 0.72, 0.35, g); boxM(0.08, 0.02, 0.03, dmat(0xc8b27a, { metalness: 1 }), -0.2, 0.72, 0.4, g); }
      else if (sh === 'breakfast') { boxM(1.2, 0.05, 0.8, birch, 0, 0.75, 0, g); for (let i = 0; i < 4; i++) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 12), dmat(0x1f5f6b)); cup.position.set(-0.4 + i * 0.27, 0.82, 0.15); g.add(cup); }
        for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) boxM(0.04, 0.72, 0.04, dark, x, 0.36, z, g); }
      else if (sh === 'mug') { boxM(0.34, 0.8, 0.34, white, 0, 0.4, 0, g); const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.13, 16), dmat(0xb3261e)); mug.position.y = 0.87; g.add(mug); }
      else if (sh === 'tape') { boxM(0.36, 1.1, 0.36, must, 0, 0.55, 0, g); const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), dmat(0xe8b923)); tp.rotation.x = Math.PI / 2; tp.position.y = 1.18; g.add(tp); }
      else if (sh === 'kettle') { boxM(0.45, 0.8, 0.45, white, 0, 0.4, 0, g); const k = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), dmat(0xb0b4b8, { metalness: 0.8, roughness: 0.3 })); k.position.y = 0.92; g.add(k);
        const st = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0x5a3f22, transparent: true, opacity: 0.45, depthWrite: false })); st.rotation.x = -Math.PI / 2; st.position.set(0.5, 0.03, 0.3); g.add(st); }
      else boxM(e.w, e.h || 0.8, e.d || 0.4, birch, 0, (e.h || 0.8) / 2, 0, g);
      it.lab = label(e.text, e.x, e.z, Math.min(4.2, Math.max(2.4, e.text.length * 0.13))); }
    else if (e.anim === 'fourposter') { const fp = new THREE.Group(); g.add(fp); boxM(2.0, 0.45, 2.4, dmat(0x6b3d2a), 0, 0.35, 0, fp); boxM(1.9, 0.12, 2.3, dmat(0xf2efe8), 0, 0.62, 0, fp); boxM(1.9, 0.05, 1.2, dmat(COL.red), 0, 0.68, 0.5, fp);
      for (const [x, z] of [[-0.95, -1.15], [0.95, -1.15], [-0.95, 1.15], [0.95, 1.15]]) boxM(0.09, 2.2, 0.09, dmat(0x6b3d2a), x, 1.1, z, fp); boxM(2.0, 0.08, 2.4, dmat(0x9e3a30), 0, 2.2, 0, fp); it.fp = fp;
      it.lab = label(e.text, e.x, e.z + 0.5, 4.2); }
    else if (e.anim === 'wardrobes') { it.doors = []; for (const s0 of WD.solids.filter(q => q.kind === 'wardrobe_bank')) for (let zz = s0.z0 + 0.6; zz < s0.z1 - 0.6; zz += 1.2) for (const sd of [-1, 1]) {
        const piv = new THREE.Group(); piv.position.set(sd < 0 ? s0.x0 - 0.01 : s0.x1 + 0.01, 0, zz - 0.55); scene.add(piv); const d_ = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.2, 1.1), dmat(0xd8cdb6)); d_.position.set(0, 1.15, 0.55); piv.add(d_); piv.userData.sd = sd; it.doors.push(piv); } }
    else if (e.anim === 'carlights') { const car = new THREE.Group(); car.position.set(e.x, 0, e.z); scene.add(car); // an original compact MPV (Touran proportions, no badges)
      boxM(1.82, 0.85, 4.53, dmat(0x2b3a4e, { metalness: 0.5, roughness: 0.3 }), 0, 0.62, 0, car); boxM(1.66, 0.62, 3.0, dmat(0x0d1218, { roughness: 0.05, metalness: 0.3 }), 0, 1.35, 0.25, car);
      boxM(1.7, 0.06, 2.9, dmat(0x2b3a4e, { metalness: 0.5, roughness: 0.3 }), 0, 1.68, 0.3, car); for (const sx of [-0.78, 0.78]) for (const sz of [-1.4, 1.4]) { const w_ = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), dmat(0x111214)); w_.rotation.z = Math.PI / 2; w_.position.set(sx, 0.33, sz); car.add(w_); }
      it.ind = []; for (const sx of [-0.72, 0.72]) for (const sz of [-2.28, 2.28]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x3a2400 })); l.position.set(sx, 0.85, sz); car.add(l); it.ind.push(l); } it.g = car; }
    DRESS.push(it); }
  const updateDress = f => { for (const it of DRESS) { if (it.flip) continue; const e = it.e; let k = f - e.f;
      if (it.texts && it.texts.length > 1) { let cur = it.texts[0]; for (const t of it.texts) if (f >= t[0] - 6) cur = t; const m = it.mats[0]; if (m.map !== cur[1]) { m.map = cur[1]; m.emissiveMap = cur[1]; m.needsUpdate = true; } k = f - cur[0]; }
      const lit = k < -12 ? 0 : k < 0 ? 1 - (-k) / 12 : k < 90 ? 1 : 1 - Math.min(1, (k - 90) / 45) * 0.8; // light on the line, settle to a dim glow
      for (const m of it.mats) { if (m.isMeshStandardMaterial) m.emissiveIntensity = (e.big ? 1.35 : 1.0) * Math.max(0.12, lit); else m.opacity = 0.35 + 0.5 * Math.max(0, lit); }
      if (e.kind === 'floor' && k < -12) it.mats.forEach(m => m.opacity = 0.35);
      if (it.fp) { const kf = f - TL.F.fourPoster; const u = kf <= 0 ? 0 : smooth(kf / 75); it.fp.position.y = u * 26 + Math.sin(kf * 0.2) * 0.1 * (u > 0); it.fp.rotation.y = u * 1.6; it.fp.rotation.z = u * 0.35; it.fp.visible = u < 0.99; }
      if (it.doors) { const u = k < 0 ? 0 : k < 150 ? Math.sin(k / 150 * Math.PI) : 0; it.doors.forEach((d, i) => d.rotation.y = -d.userData.sd * u * (0.25 + 0.35 * ((i * 7) % 5) / 5) * Math.abs(Math.sin(k * 0.08 + i))); }
      if (it.ind) { const on = k >= 0 && k < 40 && Math.floor(k / 10) % 2 === 0; it.ind.forEach(l => l.material.color.setRGB(on ? 3 : 0.22, on ? 1.6 : 0.14, on ? 0.2 : 0)); } } };
  // ---------------------------------------------------------------- v10d contact shadows (PRACTICAL APPROXIMATION: soft blobs; the baked store does not receive real-time shadow maps)
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
  const v3w = new THREE.Vector3(), mapLog = {};
  function drawMap(f, mode) { if (!mode) { mapC.style.display = 'none'; return; } mapC.style.display = 'block'; mapC.style.opacity = mode === 'full' ? MAPFADE[f].toFixed(3) : '1'; scene.updateMatrixWorld(true);
    if (mapStaticMode !== mode) { mapStatic = drawStatic(mode); mapStaticMode = mode; } const P = mapProj(mode); mx.clearRect(0, 0, W, H); mx.drawImage(mapStatic, 0, 0);
    // doors: drawn from the live leaf transforms
    for (const D of DOORS) { const o = TL.door_open[D.di][f], hw = D.d.w / 2; mx.strokeStyle = o < 0.02 ? C.copper : C.mustard; mx.lineWidth = Math.max(3, P.sc * 0.22); mx.lineCap = 'round';
      for (const lf of D.leaves) { const a = lf.localToWorld(v3w.set(lf.userData.swing ? 0 : -hw / 2, 0, 0)).clone(), b = lf.localToWorld(v3w.set(lf.userData.swing ? -lf.userData.hg * lf.userData.Lp : hw / 2, 0, 0)).clone();
        mx.beginPath(); mx.moveTo(P.x(a.x), P.z(a.z)); mx.lineTo(P.x(b.x), P.z(b.z)); mx.stroke(); } }
    // thread: the same route samples and side offset as the 3D ribbon
    const th = TL.thread[f]; if (th) { mx.save(); mx.strokeStyle = C.amber; mx.lineWidth = Math.max(2.5, P.sc * 0.2); mx.shadowColor = C.amber; mx.shadowBlur = 10; mx.lineJoin = 'round'; mx.beginPath();
      for (let s = th[0], i = 0; s <= th[1] + 1e-6; s += 0.25, i++) { const p = posAt(Math.min(s, th[1])), t = headAt(Math.min(s, th[1])), x = p.x - t.z * 0.18, z = p.z + t.x * 0.18; i ? mx.lineTo(P.x(x), P.z(z)) : mx.moveTo(P.x(x), P.z(z)); } mx.stroke(); mx.restore(); }
    // trolley footprint from the trolley transform (the 3D trolley is hidden while the drawn push-rig cart stands in for it)
    const P_ = trolley.position; if (trolley.visible || pushRig.root.visible) { mx.fillStyle = '#9aa3aa'; mx.beginPath(); [[-0.31, -0.475], [0.31, -0.475], [0.31, 0.475], [-0.31, 0.475]].forEach(([x, z], i) => { const q = trolley.localToWorld(v3w.set(x, 0, z)); i ? mx.lineTo(P.x(q.x), P.z(q.z)) : mx.moveTo(P.x(q.x), P.z(q.z)); }); mx.closePath(); mx.fill(); }
    // MINO: occluded fan from the same rays as the 3D fan, bull-headed polisher icon
    if (mino.visible || (TL.mino_on[f] && minoXZ(f))) { const mp = mino.position; if (FANPTS.length) { mx.fillStyle = 'rgba(255,51,36,0.28)'; mx.beginPath(); mx.moveTo(P.x(mp.x), P.z(mp.z)); FANPTS.forEach(([x, z]) => mx.lineTo(P.x(x), P.z(z))); mx.closePath(); mx.fill(); }
      const r = Math.max(9, P.sc * 0.75), cx = P.x(mp.x), cz = P.z(mp.z), yw = mino.rotation.y; mx.save(); mx.translate(cx, cz); mx.rotate(-yw);
      mx.fillStyle = '#2b2f34'; mx.strokeStyle = C.ink; mx.lineWidth = 2; mx.beginPath(); mx.arc(0, 0, r, 0, 7); mx.fill(); mx.stroke();
      mx.strokeStyle = C.ink; mx.lineWidth = Math.max(2, r * 0.22); mx.beginPath(); mx.moveTo(-r * 0.55, r * 0.55); mx.quadraticCurveTo(-r * 1.25, r * 0.9, -r * 1.05, r * 1.55); mx.moveTo(r * 0.55, r * 0.55); mx.quadraticCurveTo(r * 1.25, r * 0.9, r * 1.05, r * 1.55); mx.stroke();
      mx.fillStyle = C.red; mx.shadowColor = C.red; mx.shadowBlur = 12; mx.beginPath(); mx.arc(0, r * 0.45, r * 0.28, 0, 7); mx.fill(); mx.restore(); }
    if (MAPCHK[f] === 3) { const g0 = TEL.find(t => /MAP_CHECKIN_3/.test(String(t.special_events))).frame, k = f - g0;
      // real MINO: docked, drawn at the closet from world.json (it has not been revealed; mino_on is 0)
      const cx_ = P.x(WD.closet[0]), cz_ = P.z(WD.closet[1]); mx.fillStyle = '#5a5f66'; mx.beginPath(); mx.arc(cx_, cz_, Math.max(7, P.sc * 0.55), 0, 7); mx.fill(); mx.fillStyle = C.ink; mx.font = `700 ${Math.max(10, P.sc * 0.7)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('MINO: DOCKED', cx_, cz_ - P.sc * 1.1);
      if (k >= 40 && k < 130) { const A0 = [2, -15], B0 = [12, -15], u = clamp((k - 40) / 60, 0, 1), bx = P.x(A0[0] + (B0[0] - A0[0]) * u), bz = P.z(A0[1]), rec = clamp((k - 100) / 30, 0, 1);
        mx.save(); mx.globalAlpha = 1 - rec; mx.setLineDash([5, 4]); mx.strokeStyle = C.red; mx.lineWidth = 2; mx.beginPath(); mx.arc(bx, bz, Math.max(9, P.sc * 0.75), 0, 7); mx.stroke(); mx.setLineDash([]);
        if ((k >> 3) % 2 === 0) { mx.fillStyle = C.red; mx.font = `800 ${Math.max(12, P.sc * 0.85)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('TRACKING ERROR', bx, bz - P.sc * 1.3); }
        if (rec > 0) { mx.globalAlpha = rec; mx.strokeStyle = C.ink; mx.setLineDash([2, 5]); mx.beginPath(); mx.moveTo(bx, bz); mx.lineTo(cx_, cz_); mx.stroke(); }
        mx.restore(); if (k >= 100) { mx.fillStyle = C.mustard; mx.font = `700 ${Math.max(11, P.sc * 0.75)}px "DejaVu Sans Mono"`; mx.textAlign = 'center'; mx.fillText('RECONCILED: SIGNAL WAS NOT MINO', P.x(7), P.z(-12.5)); } }
      mapLog.glitch = mapLog.glitch || []; if (k >= 40 && k < 130) mapLog.glitch.push(f); }
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
      proj: { sc: P.sc, ox: P.ox, oy: P.oy, x0: MAPB.x0, z0: MAPB.z0 }, trolley: (trolley.visible || pushRig.root.visible) ? [+(P_.x).toFixed(4), +(P_.z).toFixed(4)] : null, thread: th || null }; }
  window.mapLog = mapLog;
  // ---------------------------------------------------------------- comparison render (bake validation): baked solids + plain floor only, fixed bake camera, no tone mapping / post
  window.renderCompare = () => { scene.traverse(o => { o.visible = false; }); const show = o => { o.traverse(c => { c.visible = true; }); let p = o.parent; while (p) { p.visible = true; p = p.parent; } };
    store.children.filter(o => o.userData.baked && !o.isMesh).forEach(show); show(FLOORS[0]);
    const [cx, cz, ch] = BK.camera_world_xz_h, tg = BK.camera_target_world; camera.position.set(cx, ch, cz); camera.fov = BK.vfov_deg; camera.near = 0.5; camera.lookAt(tg[0], tg[1], tg[2]); camera.updateProjectionMatrix();
    renderer.toneMapping = THREE.NoToneMapping; scene.background = new THREE.Color(0x000000); renderer.setClearColor(0x000000, 1); renderer.render(scene, camera); mapC.style.display = 'none'; $('rcpt').style.display = 'none'; $('debug').textContent = ''; return window.bakeInfo; };
  // ---------------------------------------------------------------- post: bloom for the bright elements (thread, lantern, sensor), film grain for the field-recording feel
  const composer = new X.EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H); composer.addPass(new X.RenderPass(scene, camera));
  const bloom = new X.UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.45, 0.92); composer.addPass(bloom);
  const grain = new X.ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAmt: { value: 0.045 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float uT, uAmt; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uT) * 43758.5453); }\n void main(){ vec4 c = texture2D(tDiffuse, vUv); float n = h(vUv * 1000.0) - 0.5; vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 0.55; gl_FragColor = vec4(c.rgb * v + n * uAmt, c.a); }' });
  composer.addPass(grain); composer.addPass(new X.OutputPass());
  // ---------------------------------------------------------------- frame
  window.renderFrame = f => { f = clamp(f | 0, 0, N - 1);
    const s = S[f], P = posAt(s), yaw = TL.yaw[f], h = V3(Math.sin(yaw), 0, Math.cos(yaw)), sp = Math.abs(S[f] - S[Math.max(0, f - 1)]) * FPS;
    wolf.position.copy(P); wolf.rotation.y = yaw;
    const ph = s / 0.75 * Math.PI, step = Math.min(1, sp / 1.4); feet[0].position.z = Math.sin(ph) * 0.22 * step; feet[1].position.z = -Math.sin(ph) * 0.22 * step;
    feet[0].position.y = 0.04 + Math.max(0, Math.cos(ph)) * 0.06 * step; feet[1].position.y = 0.04 + Math.max(0, -Math.cos(ph)) * 0.06 * step;
    body.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.035 * step; head.position.y = 1.68 + Math.abs(Math.sin(ph)) * 0.035 * step;
    flame.scale.setScalar(0.85 + 0.15 * Math.sin(f * 0.9)); lanternLight.intensity = 5 + Math.sin(f * 0.7) * 0.6;
    const hasTrolley = f >= F.pickBox && f < F.door; trolley.visible = hasTrolley;
    if (hasTrolley) { trolley.position.copy(P).addScaledVector(h, 0.95); trolley.rotation.y = yaw; }
    else if (f >= F.door) { const ps = posAt(S[F.door] - 2); trolley.visible = true; trolley.position.copy(ps); trolley.rotation.y = Math.atan2(headAt(S[F.door] - 2).x, headAt(S[F.door] - 2).z) + 0.5; }
    trolley.userData.box.visible = f >= F.pickBox && f < F.door; bag.visible = f >= F.door;
    // MINO
    const m = minoXZ(f), on = m && TL.mino_on[f]; mino.visible = !!on; warnRing.visible = !!on; trail.m.visible = !!on; fanPivot.visible = !!on;
    if (on) { const k = f - F.minoReveal; let mh; if (k < WD.emerge_frames) { const m2 = minoXZ(f + 1) || m; mh = m2.clone().sub(m); if (mh.lengthSq() < 1e-6) mh = V3(0, 0, 1); mh.normalize(); } else mh = V3(Math.sin(TL.mino_yaw[f]), 0, Math.cos(TL.mino_yaw[f]));
      mino.position.copy(m); mino.rotation.y = Math.atan2(mh.x, mh.z); brushes.forEach((b, i) => b.rotation.y = f * 0.6 * (i ? -1 : 1));
      const d = m.distanceTo(P), mst = mstate(f), alert = mst === 'chase' ? clamp((16 - d) / 8, 0.35, 1) : mst === 'search' || mst === 'lost' ? 0.3 : 0; fanPivot.position.set(m.x, 0.04, m.z); fanPivot.rotation.y = SENS[f]; updateFan(m, SENS[f], f); fan.material.opacity = mst === 'chase' ? 0.3 : mst === 'search' ? 0.24 : 0.16 + 0.05 * Math.sin(f * 0.4);
      sensorLight.target.position.set(Math.sin(SENS[f] - mino.rotation.y) * 6, 0, Math.cos(SENS[f] - mino.rotation.y) * 6); warnRing.position.set(m.x, 0.05, m.z); warnRing.material.opacity = alert * (0.55 + 0.45 * Math.sin(f * 0.5));
      warnRing.scale.setScalar(1 + 0.25 * Math.sin(f * 0.25)); sensorLight.intensity = 20 + 25 * alert;
      if (k >= WD.emerge_frames) { let a = SM[f], b = SM[f]; for (let q = Math.max(F.minoReveal + WD.emerge_frames, f - 150); q <= f; q++) { a = Math.min(a, SM[q]); b = Math.max(b, SM[q]); } setRibbon(trail, Math.max(0, a), b, 0.95, 0.012); } else trail.m.visible = false; }
    wBlob.position.set(P.x, 0.012, P.z); tBlob.visible = BAKE && trolley.visible; tBlob.position.set(trolley.position.x, 0.013, trolley.position.z); tBlob.rotation.y = trolley.rotation.y;
    mBlob.visible = BAKE && !!on; if (on) { mBlob.position.set(m.x, 0.014, m.z); mBlob.rotation.y = mino.rotation.y; }
    // thread
    const th = TL.thread[f]; if (th) setRibbon(thread, th[0], th[1], 0.07, 0.022, -0.18); else thread.m.visible = false;
    updateDoors(f); RELOC.forEach(o => o.visible = f < F.layArrow); updateDress(f);
    const gl = updateArrows(f, P); LURE.forEach(o => o.visible = gl > 0.05);
    ZLAB.forEach(([o, p0], i) => { o.position.copy(p0); if (gl > 0) { o.position.x += (hsh(i, f >> 2) - 0.5) * 1.6 * gl; o.material.opacity = 0.85 * (1 - 0.5 * gl * hsh(i + 7, f >> 1)); } else o.material.opacity = 0.85; });
    document.body.style.setProperty('--gl', gl.toFixed(3)); $('glitch').style.opacity = gl;
    // camera
    const c = camAt(f); CEIL.forEach(o => o.visible = c.pos.y > 40); camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.near = c.near || 0.5; if (QA) camera.setViewOffset(W, H, W * 0.21, 0, W, H); camera.updateProjectionMatrix();   /* QA: subject framed in the left 58%, map panel on the right */
    const fp1 = c.shot === 'w1'; /* v10e: placeholder meshes stay hidden; the sprite handles first person */ bag.visible = false;   /* no approved carry pose: flatpack bag withheld (gap) */ if (fp1 && bag.visible) { bag.position.set(0, 1.0, 0.55); bag.rotation.x = -0.5; } else { bag.position.set(-0.36, 0.6, 0); bag.rotation.x = 0; } mino.visible = mino.visible && c.shot !== 'm1'; fanPivot.visible = fanPivot.visible && c.shot !== 'm1';
    { const H_ = (TL.holds || [])[0]; if (H_ && !QA && !Q.get('qacam') && f >= H_.stop[0] - 10 && f < H_.stop[1] + 15) {   // O1 door wait: locked side camera, door and Wolfgang both in frame
        if (!H_.cam) { const fs = H_.stop[0], Pw0 = posAt(S[fs]), y0 = TL.yaw[fs], fw = V3(Math.sin(y0), 0, Math.cos(y0)), sideV = V3(-fw.z, 0, fw.x); let best = null;
          for (const sg of [1, -1]) { const d0 = rayLen(Pw0.x, Pw0.z, Math.atan2(sideV.x * sg, sideV.z * sg), 4.5, fs); if (!best || d0 > best.d) best = { sg, d: d0 }; }
          const dist = Math.min(3.6, best.d - 0.4), cpos = Pw0.clone().addScaledVector(sideV, best.sg * dist).addScaledVector(fw, -0.6).setY(1.45), look = Pw0.clone().addScaledVector(fw, 1.1).setY(1.05);
          H_.cam = { cpos, look }; }
        camera.position.copy(H_.cam.cpos); camera.lookAt(H_.cam.look); camera.fov = 46; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); } }
    if (Q.get('qacam')) { const [ang, dist, hh, lh] = Q.get('qacam').split(',').map(Number), A_ = yaw + ang * Math.PI / 180, Pq = wolf.position;     // QA review camera: angle from his facing, distance, height, look height
      camera.position.set(Pq.x + Math.sin(A_) * dist, hh, Pq.z + Math.cos(A_) * dist); camera.lookAt(Pq.x, lh, Pq.z); camera.fov = +(Q.get('qafov') || 40); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }
    { // ---- v10e Wolfgang sprite pose (camera-relative view selection; distance-driven walk; idle when stopped; side push rig)
      const fp = c.shot === 'w1', cp = camera.position, Pw = wolf.position, spd = Math.abs(S[f] - S[Math.max(0, f - 1)]) * FPS, idle = spd < 0.12;
      const camAng = Math.atan2(cp.x - Pw.x, cp.z - Pw.z); let rel = yaw - camAng; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), hv = V3(Math.sin(yaw), 0, Math.cos(yaw)), goesRight = hv.dot(right) >= 0;
      const view = Math.abs(rel) < 0.87 ? 'front' : Math.abs(rel) > 2.27 ? 'back' : 'side';
      const elev = Math.atan2(cp.y - 1.0, Math.hypot(cp.x - Pw.x, cp.z - Pw.z)), tilt = clamp((elev - 0.35) * 0.8, 0, 0.95);
      const pushing = hasTrolley && view === 'side';   /* side view with trolley: push rig, hands on the handle; amp 0 when stopped (no walking in place) */
      sprGroup.visible = !fp && !pushing; pushRig.root.visible = !fp && pushing; WSTAT.frames++;
      const L_ = Math.min(1, irrAt(Pw.x, Pw.z)) * 0.92, tintC = new THREE.Color(L_, L_, L_ * 1.02); sprMat.color.copy(tintC); pushRig.tint(tintC);
      if (pushing) { WSTAT.push_rig++; pushRig.mirror = !goesRight; pushRig.root.position.copy(P).addScaledVector(h, 0.95 - CART_AHEAD); pushRig.root.rotation.set(0, camAng, 0); pushRig.tilt.rotation.x = -tilt;
        pushRig.pose(((S[f] / 1.5) % 1 + 1) % 1, idle ? 0 : clamp(spd / 1.4, 0, 1)); if (idle) WSTAT.idle++; trolley.visible = false; if (!goesRight) WSTAT.side_mirrored++; }
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
        const rh = V3(-hv.z, 0, hv.x), top = V3(Pw.x - rh.x * 0.26 + toC.x * 0.04, 0.9, Pw.z - rh.z * 0.26 + toC.z * 0.04),   /* spool clipped on his right hip */ bot = V3(ex, 0.022, ez), mid = top.clone().add(bot).multiplyScalar(0.5), len = top.distanceTo(bot);
        belt.position.copy(mid); belt.scale.set(1, len, 1); belt.quaternion.setFromUnitVectors(V3(0, 1, 0), top.clone().sub(bot).normalize()); }
      window.wolfPose = { view, idle, pushing, mirrored: pushing ? !goesRight : (view === 'side' && !goesRight && !idle), tilt: +tilt.toFixed(3) }; }
    $('minopov').style.display = c.shot === 'm1' ? 'block' : 'none'; $('shot').textContent = DEBUG ? c.shot : '';
    if (c.shot === 'black') { renderer.setClearColor(0x000000, 1); renderer.clear(); hud(f); drawMap(f, ''); $('rcpt').style.display = 'none'; return true; } else $('rcpt').style.display = '';
    sun.position.copy(c.look).add(BAKE ? V3(-3, 40, 4) : V3(-14, 40, 18)); sun.target.position.copy(c.look); sun.castShadow = !BAKE; const ext = f >= F.ext; hemi.intensity = ext ? 0.55 : BAKE ? 0.85 : 1.15; if (BAKE) sun.intensity = 1.1; scene.background.setHex(ext ? 0x0a0e16 : 0x101418);
    hud(f); drawMap(f, QA ? 'inset' : (c.shot === 'map' && !Q.get('qacam')) ? 'full' : ''); if (c.shot === 'map' && !QA) $('rcpt').style.display = 'none';
    if (DEBUG) $('debug').textContent += `\nLIGHT  ${BAKE ? 'BAKED v2 (Cycles irradiance x albedo); actors live-lit; contact shadows = blob approx' : 'LIVE grey-block'}\nDOOR   ${DOORS.map(D => { const o = TL.door_open[D.di][f], p = TL.door_open[D.di][Math.max(0, f - 1)]; return o > 0.001 || p > 0.001 ? D.d.id + ':' + (o >= 0.999 ? 'OPEN' : o <= 0.001 ? 'CLOSED' : o > p ? 'OPENING' : 'CLOSING') : ''; }).filter(Boolean).join(' ') || 'all closed'}\nMINO LOS ${window.losAt(f) === null ? '-' : window.losAt(f) ? 'CLEAR' : 'BLOCKED'}  STATE ${TL.mino_on[f] ? mstate(f).toUpperCase() : 'OFF'}  LAST-SEEN s=${TL.mino_last_seen ? TL.mino_last_seen[f] : '-'}\nWOLF   ${window.wolfPose ? window.wolfPose.view + (window.wolfPose.pushing ? ' PUSH-RIG' : '') + (window.wolfPose.idle ? ' IDLE' : '') + (window.wolfPose.mirrored ? ' MIRRORED' : '') : '-'}  (sprite atlas, 2.5D)`;
    grain.uniforms.uT.value = (f % 97) * 1.37; composer.render(); return true; };
  window.exportTelemetry = r => ({ track_name: M.track_name, bpm: M.bpm, resolution_target: r, total_frames_at_30fps: N, telemetry: M.telemetry });
  window.engineReport = { engine: 'v10-bureau-greyblock', frames: N, route_m: +LEN.toFixed(1), doors: WD.doors.length, solids: WD.solids.length };
  window.renderFrame(0); window.engineReady = true;
}
