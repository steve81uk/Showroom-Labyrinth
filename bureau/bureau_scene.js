// =====================================================================================================================
// BUREAU & CO. grey-block scene (Engine v10, navigation phase). Browser side, injected by bureau_render.js.
// Reads bureau/world.json + bureau/timeline.json (built and collision-tested by bureau_world.js). Every frame is a
// pure function of the frame number. No final textures, fur, rain or particles in this phase, by design.
// =====================================================================================================================
async function sceneMain(THREE, X) {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1920, H = +Q.get('h') || 1080, DEBUG = Q.get('debug') === '1';
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
  const RELOC = [], LURE = [], ZLAB = [];
  const store = new THREE.Group(); scene.add(store);
  { const fl = new THREE.Mesh(new THREE.PlaneGeometry(72, 52), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; store.add(fl);
    const ZT = { entrance: 0xc9c0ae, bedrooms: 0xc6bba6, kitchens: 0xbfc0b9, hall: 0xb3b8b5, wardrobes: 0xc2b9ab, service: 0xa9aaa6, core: 0xbcb5a8 };
    for (const z of WD.zones) { const p = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), mat(ZT[z.id] || COL.concrete, { roughness: 0.95 }));
      p.rotation.x = -Math.PI / 2; p.position.set((z.x0 + z.x1) / 2, 0.004, (z.z0 + z.z1) / 2); p.receiveShadow = true; store.add(p);
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
  for (const k in bins) { const m = new THREE.Mesh(merge(bins[k]), MAT[k]); m.castShadow = true; m.receiveShadow = true; store.add(m); }
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
    store.add(new THREE.Mesh(merge(pg), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }))); }

  // ---------------------------------------------------------------- doors (sliding pairs / swing doors / exit shutter), animated from the door state machine
  const DOORS = WD.doors.map((d, di) => { const g = new THREE.Group(); g.position.set(d.x, 0, d.z); if (d.axis === 'z') g.rotation.y = Math.PI / 2; scene.add(g);
    const leaves = []; const hw = d.w / 2;
    if (d.kind === 'sliding') { const gl = new THREE.MeshStandardMaterial({ color: 0x9fd0d8, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }), fr = mat(COL.tealDeep, { metalness: 0.5, roughness: 0.4 });
      for (const sd of [-1, 1]) { const leaf = new THREE.Group(); const pane = new THREE.Mesh(new THREE.BoxGeometry(hw, 2.5, 0.05), gl); pane.position.y = 1.25; leaf.add(pane);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.08), fr); edge.position.set(-sd * hw / 2, 1.25, 0); leaf.add(edge); leaf.userData = { closed: sd * hw / 2, sd }; g.add(leaf); leaves.push(leaf); }
      const hdr = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.4, 0.3, 0.3), fr); hdr.position.y = 2.65; g.add(hdr); }
    else { const dm = mat(d.staff ? COL.mustard : COL.teal, { roughness: 0.6 }); const leaf = new THREE.Group(); const p = new THREE.Mesh(new THREE.BoxGeometry(d.w, 2.3, 0.06), dm); p.position.set(d.w / 2, 1.15, 0); leaf.add(p);
      leaf.position.x = -hw; leaf.userData = { swing: true }; g.add(leaf); leaves.push(leaf); p.castShadow = true; }
    let shutter = null; if (d.id === 'exit') { shutter = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.2, 2.8, 0.08), mat(COL.mustard, { roughness: 0.5, metalness: 0.3 })); shutter.position.set(0, 1.4, 0.2); g.add(shutter);
      const lab = textPlane('EXIT RELOCATED', 3.2, '#b3261e'); lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.03, 1.2); g.add(lab); shutter.userData.lab = lab; }
    return { d, di, g, leaves, shutter }; });
  const updateDoors = f => { for (const D of DOORS) { const o = TL.door_open[D.di][f];
    for (const lf of D.leaves) { if (lf.userData.swing) lf.rotation.y = -o * Math.PI / 2 * 0.95; else lf.position.x = lf.userData.closed + lf.userData.sd * o * (D.d.w / 2 - 0.05); }
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
  const coatM = mat(0x2b1f36, { roughness: 0.9 }), furM = mat(0x8e9298, { roughness: 1 }), hatM = mat(0x111214, { roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 1.15, 16), coatM); body.position.y = 0.95; body.castShadow = true; wolf.add(body);
  const tails = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 16, 1, true), coatM); tails.position.y = 0.38; wolf.add(tails);
  const head = new THREE.Group(); head.position.y = 1.68; wolf.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), furM)); const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 10), furM); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.03, 0.2); head.add(snout);
  for (const sd of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), furM); ear.position.set(sd * 0.1, 0.17, -0.02); ear.rotation.z = -sd * 0.25; head.add(ear);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 16), mat(0xc8b27a, { metalness: 1, roughness: 0.3 })); ring.position.set(sd * 0.06, 0.03, 0.15); head.add(ring); }
  const hat = new THREE.Group(); hat.position.y = 0.14; head.add(hat); hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 20), hatM));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.3, 20), hatM); crown.position.y = 0.16; hat.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.05, 20), mat(COL.red)); band.position.y = 0.05; hat.add(band);
  const lantern = new THREE.Group(); lantern.position.set(0.38, 0.85, 0.05); wolf.add(lantern);
  lantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), mat(0xb08a3a, { metalness: 0.9, roughness: 0.35 })));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.6) })); lantern.add(flame);
  const lanternLight = new THREE.PointLight(0xffa640, 6, 7, 2); lantern.add(lanternLight);
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
  fan.rotation.x = -Math.PI / 2; const fanPivot = new THREE.Group(); fanPivot.add(fan); scene.add(fanPivot);
  // sensor yaw per frame: sweeps +-60 deg until Wolfgang falls inside the beam within 16 m (detection), then locks on with a limited turn rate
  const SENS = new Float32Array(N); let DETECT = -1; { let ys = 0;
    for (let f = F.minoReveal; f < N; f++) { const m = minoXZ(f); if (!m) continue; const nx = minoXZ(Math.min(N - 1, f + 1)) || m, body = (f - F.minoReveal < WD.emerge_frames) ? Math.atan2(nx.x - m.x, nx.z - m.z) : Math.atan2(...(() => { const h_ = headAt(SM[f]); return [h_.x, h_.z]; })());
      const w = posAt(S[f]), toW = Math.atan2(w.x - m.x, w.z - m.z); let tgt;
      if (DETECT < 0) { tgt = body + Math.sin((f - F.minoReveal) / FPS * 2.4) * 1.05; let d = toW - tgt; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        if (f - F.minoReveal > WD.emerge_frames && Math.abs(d) < 0.25 && m.distanceTo(w) < 16) DETECT = f; }
      else tgt = toW;
      let d = tgt - ys; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ys += clamp(d, -0.12, 0.12); SENS[f] = ys; } }
  const warnRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 48), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  warnRing.rotation.x = -Math.PI / 2; scene.add(warnRing);

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
  const camAt = f => { const sec = secAt(f).name, t = f / FPS, P = CAMSMOOTH[f];
    let h = 24, fov = 40, back = 0.42;
    if (sec === 'Intro') { const u = smooth((f - 30) / (F.pickBox - 30)); h = lerp(82, 22, u); }
    else if (/Pre-Chorus/.test(sec)) h = 20; else if (sec === 'Final Chorus') h = 15; else if (/Chorus/.test(sec)) h = 15.5; else if (/Break/.test(sec)) h = 19; else if (/Verse/.test(sec)) h = 21;
    if (f >= F.minoReveal && f < F.minoReveal + 150) h = lerp(h, 17, smooth((f - F.minoReveal) / 40));
    let tgt = P.clone(); if (sec === 'Intro') tgt.lerpVectors(V3(0, 0, 2), P, smooth((f - 30) / (F.pickBox - 30)));
    if (f >= F.ext) { const u = smooth((f - F.ext) / 240); h = lerp(16, 95, u); tgt.lerpVectors(P, V3(0, 0, -6), u); }
    const pos = V3(tgt.x, h, tgt.z + h * back); return { pos, look: tgt, fov }; };

  // ---------------------------------------------------------------- HUD: diegetic Bureau receipt + debug
  const SPOOL = WD.spool_m;
  function hud(f) { const th = TL.thread[f], used = th ? th[1] - TL.s_anchor : 0, m = minoXZ(f), w = posAt(S[f]);
    const d = m && TL.mino_on[f] ? m.distanceTo(w) : Infinity, prox = DETECT < 0 || f < DETECT ? 'SCANNING' : d < 6 ? '<b class="r">DANGER</b>' : d < 14 ? '<b class="a">CAUTION</b>' : 'TRACKING';
    const parts = f >= F.halfShelf ? '1 / 2' : f >= F.pickBox ? '1 / 2 (BOXED)' : '0 / 2';
    const exit = f >= F.layArrow ? 'OPEN' : 'RELOCATED';
    $('rcpt').innerHTML = `<div class="hd">BUREAU &amp; CO.</div><div class="sl">HOME, ADMINISTERED.</div><hr>
      <div>CUSTOMER STATUS: ${f >= F.minoReveal && f < F.door ? 'PURSUED' : 'ACTIVE'}</div><div>PURCHASE OBJECTIVE: ONE SHELF</div><div>SHELF PARTS: ${parts}</div>
      <div>THREAD REMAINING: ${f >= F.tie ? Math.max(0, SPOOL - used).toFixed(0) + ' m' : 'NOT ANCHORED'}</div><div>MINO PROXIMITY: ${TL.mino_on[f] ? prox : 'NOT DETECTED'}</div><div>EXIT STATUS: ${exit}</div><hr><div class="ft">#${String(f).padStart(5, '0')}  THANK YOU FOR NAVIGATING</div>`;
    if (DEBUG) { const t = f / FPS, b = beatAt(t), tel = telAt(f), sec = secAt(f).name, zn = WD.zones.find(z => w.x >= z.x0 && w.x <= z.x1 && w.z >= z.z0 && w.z <= z.z1);
      $('debug').textContent = `FRAME ${f} / ${N}  T ${t.toFixed(3)} s  @ ${FPS} fps  ${W}x${H}\nBPM manifest ${M.bpm}  beat ${b}  bar ${(b / 4 + 1).toFixed(1)}\nSECTION ${sec}  STATE ${tel.sprite_state}  CAM ${tel.camera_mode || '-'}\nEVENT ${String(tel.special_events || '').slice(0, 60)}\nZONE ${zn ? zn.name : 'OUTSIDE'}  s ${S[f].toFixed(1)} / ${LEN.toFixed(1)} m  NAV TEST PASS` + (m && TL.mino_on[f] ? `  MINO ${d.toFixed(1)} m` : ''); } }

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
    if (on) { const k = f - F.minoReveal; let mh; if (k < WD.emerge_frames) { const m2 = minoXZ(f + 1) || m; mh = m2.clone().sub(m); if (mh.lengthSq() < 1e-6) mh = V3(0, 0, 1); mh.normalize(); } else mh = headAt(SM[f]);
      mino.position.copy(m); mino.rotation.y = Math.atan2(mh.x, mh.z); brushes.forEach((b, i) => b.rotation.y = f * 0.6 * (i ? -1 : 1));
      const d = m.distanceTo(P), alert = DETECT >= 0 && f >= DETECT ? clamp((16 - d) / 8, 0.35, 1) : 0; fanPivot.position.set(m.x, 0.04, m.z); fanPivot.rotation.y = SENS[f]; fan.material.opacity = DETECT >= 0 && f >= DETECT ? 0.3 : 0.18 + 0.06 * Math.sin(f * 0.4);
      sensorLight.target.position.set(Math.sin(SENS[f] - mino.rotation.y) * 6, 0, Math.cos(SENS[f] - mino.rotation.y) * 6); warnRing.position.set(m.x, 0.05, m.z); warnRing.material.opacity = alert * (0.55 + 0.45 * Math.sin(f * 0.5));
      warnRing.scale.setScalar(1 + 0.25 * Math.sin(f * 0.25)); sensorLight.intensity = 20 + 25 * alert;
      if (k >= WD.emerge_frames) setRibbon(trail, Math.max(0, SM[f] - 14), SM[f] - 0.5, 0.95, 0.012); else trail.m.visible = false; }
    // thread
    const th = TL.thread[f]; if (th) setRibbon(thread, th[0], th[1], 0.07, 0.022, -0.18); else thread.m.visible = false;
    updateDoors(f); RELOC.forEach(o => o.visible = f < F.layArrow);
    const gl = updateArrows(f, P); LURE.forEach(o => o.visible = gl > 0.05);
    ZLAB.forEach(([o, p0], i) => { o.position.copy(p0); if (gl > 0) { o.position.x += (hsh(i, f >> 2) - 0.5) * 1.6 * gl; o.material.opacity = 0.85 * (1 - 0.5 * gl * hsh(i + 7, f >> 1)); } else o.material.opacity = 0.85; });
    document.body.style.setProperty('--gl', gl.toFixed(3)); $('glitch').style.opacity = gl;
    // camera
    const c = camAt(f); CEIL.forEach(o => o.visible = c.pos.y > 40); camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
    sun.position.copy(c.look).add(V3(-14, 40, 18)); sun.target.position.copy(c.look); const ext = f >= F.ext; hemi.intensity = ext ? 0.55 : 1.15; scene.background.setHex(ext ? 0x0a0e16 : 0x101418);
    hud(f); grain.uniforms.uT.value = (f % 97) * 1.37; composer.render(); return true; };
  window.exportTelemetry = r => ({ track_name: M.track_name, bpm: M.bpm, resolution_target: r, total_frames_at_30fps: N, telemetry: M.telemetry });
  window.engineReport = { engine: 'v10-bureau-greyblock', frames: N, route_m: +LEN.toFixed(1), doors: WD.doors.length, solids: WD.solids.length };
  window.renderFrame(0); window.engineReady = true;
}
