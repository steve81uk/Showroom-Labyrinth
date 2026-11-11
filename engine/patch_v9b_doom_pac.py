#!/usr/bin/env python3
"""Engine v9b patch: PBR surfaces + env map + GTAO + fluorescent pools + alarm (Doom 3D mode),
Pac-Man top-down layer, Doom status bar with reactive Wolfgang face, FPV trolley 'weapon',
kill-feed, achievements, speedrun split. Applies to labyrinth_renderer.js in place."""
import sys
p = 'labyrinth_renderer.js'
s = open(p).read()

def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n:
        sys.exit(f'anchor count {c} != {n}: {a[:90]!r}')
    s = s.replace(a, b)

# ---------------------------------------------------------------- imports
R("import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';",
  "import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';\n"
  "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';\n"
  "import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';")
R("sceneMain(THREE, { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, BufferGeometryUtils })",
  "sceneMain(THREE, { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, BufferGeometryUtils, RoomEnvironment, GTAOPass })")

# ---------------------------------------------------------------- environment + lights
R("  const scene = new THREE.Scene();\n  const camera = new THREE.PerspectiveCamera(50, ASPECT, 0.1, 900);",
  "  const scene = new THREE.Scene();\n  const camera = new THREE.PerspectiveCamera(50, ASPECT, 0.1, 900); scene.add(camera);\n"
  "  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new X.RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32; }")
# renderer must exist before PMREM: move scene creation below renderer creation by creating renderer earlier
R("  // ---------------------------------------------------------------- renderer\n  const canvas = $('c');",
  "  // ---------------------------------------------------------------- renderer\n  const canvas = $('c');")
R("const hemi = new THREE.HemisphereLight(0xfff1e0, 0xa29d94, 0.8);", "const hemi = new THREE.HemisphereLight(0xfff1e0, 0x8f8a80, 0.35);")
R("const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);", "const sun = new THREE.DirectionalLight(0xfff1dc, 0.9);")
R("  const minoL = new THREE.PointLight(0xff2a1a, 0, 8, 1.7); scene.add(minoL);      // MINO red sensor spill",
  "  const minoL = new THREE.PointLight(0xff2a1a, 0, 8, 1.7); scene.add(minoL);      // MINO red sensor spill\n"
  "  const fluo = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xfff0d8, 0, 11, 2); scene.add(l); return l; });   // pools under the nearest ceiling panels\n"
  "  const alarmL = new THREE.PointLight(0xff1a10, 0, 16, 1.5); scene.add(alarmL);   // pursuit beacon")

# ---------------------------------------------------------------- PBR surface library
R("  // ---------------------------------------------------------------- materials\n  const mat = {};",
r"""  // ---------------------------------------------------------------- PBR surface library (procedural, deterministic): albedo + normal + roughness
  const TEXN = CPU ? 512 : 1024;
  const mkCanvas = (w = TEXN, h = TEXN) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function heightToNormal(src, strength) { const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const out = mkCanvas(w, h), o = out.getContext('2d'), id = o.createImageData(w, h), q = id.data;
    const Hh = (x, y) => d[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (Hh(x + 1, y) - Hh(x - 1, y)) * strength, dy = (Hh(x, y + 1) - Hh(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4; q[i] = (-dx / l * 0.5 + 0.5) * 255; q[i + 1] = (dy / l * 0.5 + 0.5) * 255; q[i + 2] = (1 / l * 0.5 + 0.5) * 255; q[i + 3] = 255; }
    o.putImageData(id, 0, 0); return out; }
  const noiseLayer = (c, seed, n, sMin, sMax, alpha, light) => { const r = rng(seed), w = c.canvas.width, h = c.canvas.height, k = w / 512;
    for (let i = 0; i < n; i++) { const v = light ? 255 : 0, sz = (sMin + r() * (sMax - sMin)) * k; c.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`; const x = r() * w, y = r() * h;
      c.fillRect(x, y, sz, sz); if (x + sz > w) c.fillRect(x - w, y, sz, sz); if (y + sz > h) c.fillRect(x, y - h, sz, sz); } };
  function surface(seed, paint, rough0, nStr) {
    const a = mkCanvas(), hg = mkCanvas(), rg = mkCanvas(), ca = a.getContext('2d'), ch = hg.getContext('2d'), cr = rg.getContext('2d');
    ch.fillStyle = '#808080'; ch.fillRect(0, 0, TEXN, TEXN); const rv = rough0 * 255 | 0; cr.fillStyle = `rgb(${rv},${rv},${rv})`; cr.fillRect(0, 0, TEXN, TEXN);
    ca.save(); ch.save(); cr.save(); const k = TEXN / 512; ca.scale(k, k); ch.scale(k, k); cr.scale(k, k);
    paint(ca, ch, cr, 512, 512, rng(seed)); ca.restore(); ch.restore(); cr.restore();
    const T = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return { map: T(a, true), normalMap: T(heightToNormal(hg, nStr), false), roughnessMap: T(rg, false) }; }
  const blots = (c, R, n, col, rMin, rMax) => { for (let i = 0; i < n; i++) { const x = R() * 512, y = R() * 512, r = rMin + R() * (rMax - rMin), g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); } };
  const SURF = {
    floor: surface(11, (a, hh, r, w, h, R) => { a.fillStyle = '#8b8e93'; a.fillRect(0, 0, w, h);
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { const v = (R() - 0.5) * 16; a.fillStyle = `rgba(${130 + v | 0},${132 + v | 0},${137 + v | 0},0.45)`; a.fillRect(tx * 128, ty * 128, 128, 128); }
      noiseLayer(a, 3, 6000, 1, 5, 0.10, false); noiseLayer(a, 4, 5000, 1, 4, 0.08, true); blots(a, R, 18, 'rgba(60,55,50,0.10)', 20, 70);
      for (let i = 0; i < 90; i++) { const x = R() * w, y = R() * h, x2 = x + R() * 120 - 60, y2 = y + R() * 120 - 60;
        a.strokeStyle = `rgba(35,35,40,${0.05 + R() * 0.12})`; a.lineWidth = 0.6 + R() * 1.8; a.beginPath(); a.moveTo(x, y); a.quadraticCurveTo((x + x2) / 2 + R() * 30 - 15, (y + y2) / 2 + R() * 30 - 15, x2, y2); a.stroke();
        r.strokeStyle = 'rgba(210,210,210,0.55)'; r.lineWidth = 3; r.beginPath(); r.moveTo(x, y); r.lineTo(x2, y2); r.stroke(); }
      a.fillStyle = 'rgba(28,30,34,0.6)'; hh.fillStyle = '#1c1c1c'; r.fillStyle = '#e0e0e0';
      for (let k = 0; k <= 4; k++) { a.fillRect(k * 128 - 1.5, 0, 3, h); a.fillRect(0, k * 128 - 1.5, w, 3); hh.fillRect(k * 128 - 2, 0, 4, h); hh.fillRect(0, k * 128 - 2, w, 4); r.fillRect(k * 128 - 2, 0, 4, h); r.fillRect(0, k * 128 - 2, w, 4); }
      noiseLayer(hh, 5, 4000, 1, 3, 0.15, true); blots(r, R, 30, 'rgba(255,255,255,0.35)', 15, 60); }, 0.28, 3.0),
    wall: surface(21, (a, hh, r, w, h, R) => { a.fillStyle = '#d4cbbb'; a.fillRect(0, 0, w, h); noiseLayer(a, 7, 6000, 1, 4, 0.06, false); noiseLayer(a, 8, 3000, 2, 6, 0.05, true);
      noiseLayer(hh, 9, 30000, 1, 2, 0.22, true); noiseLayer(hh, 10, 30000, 1, 2, 0.22, false);
      for (const x of [0, 256, 512]) { a.fillStyle = 'rgba(80,70,60,0.4)'; a.fillRect(x - 1.5, 0, 3, h * 0.93); hh.fillStyle = '#262626'; hh.fillRect(x - 2.5, 0, 5, h * 0.93); }
      const g = a.createLinearGradient(0, h * 0.7, 0, h); g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, 'rgba(55,45,35,0.32)'); a.fillStyle = g; a.fillRect(0, 0, w, h);
      blots(a, R, 6, 'rgba(120,95,60,0.07)', 30, 90);
      for (let i = 0; i < 50; i++) { a.fillStyle = `rgba(45,40,35,${0.05 + R() * 0.14})`; a.fillRect(R() * w, h * (0.74 + R() * 0.18), 10 + R() * 70, 1 + R() * 3); }
      a.fillStyle = '#34312e'; a.fillRect(0, h * 0.93, w, h * 0.07); a.fillStyle = 'rgba(255,255,255,0.08)'; a.fillRect(0, h * 0.93, w, 2);
      hh.fillStyle = '#d0d0d0'; hh.fillRect(0, h * 0.93, w, h * 0.07); r.fillStyle = '#6a6a6a'; r.fillRect(0, h * 0.93, w, h * 0.07); }, 0.88, 2.4),
    wood: surface(31, (a, hh, r, w, h, R) => { a.fillStyle = '#e9e2d6'; a.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const y = R() * h, amp = 3 + R() * 9, fq = 0.008 + R() * 0.02, ph = R() * 6; a.strokeStyle = `rgba(${115 + R() * 40 | 0},${92 + R() * 30 | 0},70,${0.07 + R() * 0.2})`;
        a.lineWidth = 0.5 + R() * 1.6; a.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * fq + ph) * amp; x ? a.lineTo(x, yy) : a.moveTo(x, yy); } a.stroke();
        hh.strokeStyle = `rgba(0,0,0,${0.1 + R() * 0.2})`; hh.lineWidth = a.lineWidth; hh.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * fq + ph) * amp; x ? hh.lineTo(x, yy) : hh.moveTo(x, yy); } hh.stroke(); }
      blots(a, R, 5, 'rgba(110,80,50,0.12)', 10, 30); }, 0.55, 1.4),
    fabric: surface(41, (a, hh, r, w, h, R) => { a.fillStyle = '#e6e6e6'; a.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) { a.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.06})`; a.fillRect(0, y, w, 2); hh.fillStyle = 'rgba(255,255,255,0.35)'; hh.fillRect(0, y, w, 2); }
      for (let x = 0; x < w; x += 4) { a.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.05})`; a.fillRect(x, 0, 2, h); hh.fillStyle = 'rgba(0,0,0,0.25)'; hh.fillRect(x, 0, 2, h); }
      noiseLayer(a, 12, 2500, 2, 9, 0.05, false); blots(a, R, 8, 'rgba(0,0,0,0.05)', 20, 60); }, 0.95, 1.6),
    lam: surface(51, (a, hh, r, w, h, R) => { a.fillStyle = '#efede8'; a.fillRect(0, 0, w, h); noiseLayer(a, 13, 900, 4, 20, 0.04, false);
      noiseLayer(hh, 14, 9000, 1, 2, 0.1, true); blots(r, R, 30, 'rgba(255,255,255,0.3)', 15, 70);
      for (let i = 0; i < 20; i++) { a.strokeStyle = `rgba(0,0,0,${0.04 + R() * 0.06})`; a.lineWidth = 0.6; a.beginPath(); const x = R() * w, y = R() * h; a.moveTo(x, y); a.lineTo(x + R() * 40 - 20, y + R() * 10 - 5); a.stroke(); } }, 0.4, 0.8),
    ceil: surface(61, (a, hh, r, w, h, R) => { a.fillStyle = '#c9c4ba'; a.fillRect(0, 0, w, h); noiseLayer(a, 16, 26000, 1, 2, 0.25, false); noiseLayer(hh, 17, 26000, 1, 2, 0.5, false);
      blots(a, R, 7, 'rgba(140,105,55,0.16)', 20, 55);
      a.fillStyle = '#8a857c'; hh.fillStyle = '#1e1e1e'; for (let k = 0; k <= 4; k++) { a.fillRect(k * 128 - 2, 0, 4, h); a.fillRect(0, k * 128 - 2, w, 4); hh.fillRect(k * 128 - 2, 0, 4, h); hh.fillRect(0, k * 128 - 2, w, 4); } }, 0.95, 2.0),
  };
  // world-space UVs so textures keep real-world scale on merged boxes of any size
  function worldUV(g, su, sv) { const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Math.abs(Nn.getX(i)), ny = Math.abs(Nn.getY(i));
      if (ny > 0.5) U.setXY(i, x / su, z / su); else if (nx > 0.5) U.setXY(i, z / su, y / sv); else U.setXY(i, x / su, y / sv); } U.needsUpdate = true; return g; }
  const UVS = { wall: [2.4, 2.7], wood: [1.1, 1.1], fabric: [0.7, 0.7], lam: [1.4, 1.4] };
  const SURF_OF = {};   // material key -> surface family
  // ---------------------------------------------------------------- materials
  const mat = {};""")

R("""  const std = (k, o) => mat[k] || (mat[k] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)));
  std('wall', { color: 0xe9e1d3 }); std('wallTop', { color: 0x2b3038 });
  std('birch', { color: 0xd9c19a }); std('oak', { color: 0xa47a4c }); std('white', { color: 0xf4f2ee }); std('black', { color: 0x26282c });
  std('grey', { color: 0x8c9096 }); std('fabricBlue', { color: 0x3d5a80 }); std('fabricSand', { color: 0xc9b79c }); std('fabricRed', { color: 0x9b3b32 });
  std('fabricGreen', { color: 0x5b7f5a }); std('linen', { color: 0xf7f4ee }); std('steel', { color: 0xc8ccd2, metalness: 0.9, roughness: 0.3 });
  std('lampGlow', { color: 0xfff1cc, emissive: 0xffc070, emissiveIntensity: 0.7 }); std('books', { color: 0x7a4b8c });
  std('booksB', { color: 0xd8a03c }); std('booksC', { color: 0x2f7a7a }); std('rug', { color: 0xb8664a, roughness: 0.95 });""",
"""  const std = (k, o) => mat[k] || (mat[k] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)));
  const pb = (k, fam, o) => { SURF_OF[k] = fam; const t = SURF[fam]; return std(k, Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }, o)); };
  pb('wall', 'wall', { color: 0xf4ede2 }); std('wallTop', { color: 0x2b3038 });
  pb('birch', 'wood', { color: 0xe2c79a }); pb('oak', 'wood', { color: 0xa9784a }); pb('white', 'lam', { color: 0xf6f4f0 }); pb('black', 'lam', { color: 0x2a2c30 });
  pb('grey', 'lam', { color: 0x8c9096 }); pb('fabricBlue', 'fabric', { color: 0x3d5a80 }); pb('fabricSand', 'fabric', { color: 0xcdb99b }); pb('fabricRed', 'fabric', { color: 0x9b3b32 });
  pb('fabricGreen', 'fabric', { color: 0x5b7f5a }); pb('linen', 'fabric', { color: 0xf7f4ee }); std('steel', { color: 0xc8ccd2, metalness: 0.95, roughness: 0.28 });
  std('lampGlow', { color: 0xfff1cc, emissive: 0xffc070, emissiveIntensity: 0.7 }); pb('books', 'fabric', { color: 0x7a4b8c });
  pb('booksB', 'fabric', { color: 0xd8a03c }); pb('booksC', 'fabric', { color: 0x2f7a7a }); pb('rug', 'fabric', { color: 0xb8664a });""")

# floor + ceiling use the surface library with their own repeats
R("""  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 }));""",
"""  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
  const FS = SURF.floor, floorRep = [MAZE_W / 4, MAZE_D / 4];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ map: rep(FS.map, ...floorRep), normalMap: rep(FS.normalMap, ...floorRep),
    roughnessMap: rep(FS.roughnessMap, ...floorRep), roughness: 1, metalness: 0.05, envMapIntensity: 1.6 }));""")
R("""  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.9, emissive: 0x3a3833, emissiveIntensity: 1 }));""",
"""  const CSF = SURF.ceil, ceilRep = [MAZE_W / 2.4, MAZE_D / 2.4];
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ map: rep(CSF.map, ...ceilRep), normalMap: rep(CSF.normalMap, ...ceilRep), roughness: 0.95,
    color: 0xd8d3c8, emissive: 0x2a2824, emissiveIntensity: 1 }));""")
R("""    const g = new THREE.PlaneGeometry(1.2, 0.6); g.rotateX(Math.PI / 2); g.translate(x + ox * CS * 0.22, CEIL_H - 0.01, z + oz * CS * 0.22); panelGeo.push(g); } }""",
"""    const g = new THREE.PlaneGeometry(1.2, 0.6); g.rotateX(Math.PI / 2); g.translate(x + ox * CS * 0.22, CEIL_H - 0.01, z + oz * CS * 0.22); panelGeo.push(g);
    PANELS.push({ p: V3(x + ox * CS * 0.22, CEIL_H - 0.2, z + oz * CS * 0.22), faulty: hash(c * 4 + ox + 2 * oz, 77) < 0.13, id: c * 4 + (ox + 1) + (oz + 1) / 2 }); } }""")
R("  const panelGeo = []; for (let c = 0; c < C * R; c++) {", "  const PANELS = [];\n  const panelGeo = []; for (let c = 0; c < C * R; c++) {")
# world UVs at merge
R("  for (const k in bins) { const m = new THREE.Mesh(merge(bins[k]), mat[k]);",
  "  for (const k in bins) { if (SURF_OF[k]) { const [su, sv] = UVS[SURF_OF[k]]; bins[k].forEach(g => worldUV(g, su, sv)); }\n    const m = new THREE.Mesh(merge(bins[k]), mat[k]);")
R("  flatBox.position.set(0, 0.55, 0.02);", "  flatBox.name = 'flatbox'; flatBox.position.set(0, 0.55, 0.02);")

# ---------------------------------------------------------------- GTAO in the composer
R("  const rp = new X.RenderPass(scene, camera); composer.addPass(rp);",
  "  const rp = new X.RenderPass(scene, camera); composer.addPass(rp);\n"
  "  const gtao = new X.GTAOPass(scene, camera, W, H); gtao.blendIntensity = 1.0;\n"
  "  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: CPU ? 10 : 16 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });\n"
  "  composer.addPass(gtao);")

# ---------------------------------------------------------------- new systems: Pac-Man layer, FPV weapon, Doom face + bar data, feed, achievements
R("  // ---------------------------------------------------------------- camera director",
r"""  // ---------------------------------------------------------------- PAC-MAN LAYER (top-down / map grammar)
  const pac = new THREE.Group(); pac.visible = false; scene.add(pac);
  const PM = 3, PW = MAZE_W + PM * 2, PD = MAZE_D + PM * 2, PPX = 2048 / PW;
  const pacBoard = canvasTex(2048, Math.round(PD * PPX), (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const X0 = x => (x + PW / 2) * PPX, Z0 = z => (z + PD / 2) * PPX, segs = [];
    for (let k = 0; k < C * R; k++) { const [x, z] = cellXZ(k), o = MZ.open[k], hc = CS / 2;
      if (!o[0]) segs.push([x + hc, z - hc, x + hc, z + hc]); if (!o[1] && k % C === 0) segs.push([x - hc, z - hc, x - hc, z + hc]);
      if (!o[2]) segs.push([x - hc, z + hc, x + hc, z + hc]);
      if (((k / C) | 0) === 0 && !o[3]) { if (k === MZ.exit) { segs.push([x - hc, z - hc, x - hc * 0.4, z - hc]); segs.push([x + hc * 0.4, z - hc, x + hc, z - hc]); } else segs.push([x - hc, z - hc, x + hc, z - hc]); }
      if (k === MZ.pathCells[0]) { segs.pop(); segs.push([x - hc, z + hc, x - hc * 0.4, z + hc]); segs.push([x + hc * 0.4, z + hc, x + hc, z + hc]); } }
    const stroke = (wd, col) => { c.strokeStyle = col; c.lineWidth = wd * PPX; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      for (const [a, b, d, e] of segs) { c.moveTo(X0(a), Z0(b)); c.lineTo(X0(d), Z0(e)); } c.stroke(); };
    c.shadowColor = '#2a3cff'; c.shadowBlur = 18; stroke(1.5, '#2121ff'); c.shadowBlur = 0; stroke(1.5 - 0.38, '#000');   // merged double outline
    c.fillStyle = '#ffb8ff'; c.font = `bold ${Math.round(1.4 * PPX)}px DejaVu Sans Mono`; c.textAlign = 'center';
    c.fillText('EXIT', X0(exitXZ[0]), Z0(-MAZE_D / 2 - 1.2)); c.fillText('IN', X0(cellXZ(MZ.pathCells[0])[0]), Z0(MAZE_D / 2 + 2.0)); });
  const pacPlane = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: pacBoard, toneMapped: false })); pacPlane.position.y = 0.03; pac.add(pacPlane);
  // pellets: the yellow arrows become dots; power pellets sit on the story beats
  const POWER = [F.pickBox, F.threadFound, F.badge, F.minoReveal].map(fr => S[fr]);
  const pellets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb8ae, toneMapped: false }), nArrows); pac.add(pellets);
  const powerP = new THREE.InstancedMesh(new THREE.SphereGeometry(0.85, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb8ae, toneMapped: false }), POWER.length); pac.add(powerP);
  const pacTexs = [0, 0.18, 0.36, 0.5].map(m => canvasTex(256, 256, (c) => { c.fillStyle = '#ffe600'; c.beginPath(); c.moveTo(128, 128); c.arc(128, 128, 110, m * Math.PI / 2 + 0.001, Math.PI * 2 - m * Math.PI / 2); c.closePath(); c.fill();
    c.fillStyle = '#9a9a9a'; for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(118 + sx * 0, 30); c.lineTo(78 + (sx > 0 ? 70 : 0), 4); c.lineTo(68 + (sx > 0 ? 95 : 0), 52); c.closePath(); c.fill(); }
    c.strokeStyle = '#19f0ff'; c.lineWidth = 9; c.beginPath(); c.arc(150, 72, 20, 0, 7); c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(150, 72, 8, 0, 7); c.fill(); }));
  const pacMan = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: pacTexs[0], transparent: true, toneMapped: false, depthWrite: false })); pacMan.position.y = 0.3; pac.add(pacMan);
  const ghostTex = (col, horns) => canvasTex(256, 256, (c) => { c.fillStyle = col; c.beginPath(); c.moveTo(28, 230); c.lineTo(28, 120); c.arc(128, 120, 100, Math.PI, 0); c.lineTo(228, 230);
      for (let k = 0; k < 4; k++) { c.lineTo(228 - k * 50 - 25, 200); c.lineTo(228 - (k + 1) * 50, 230); } c.closePath(); c.fill();
      if (horns) { c.fillStyle = '#cfd6de'; c.beginPath(); c.moveTo(48, 70); c.quadraticCurveTo(10, 30, 24, 0); c.quadraticCurveTo(50, 40, 74, 44); c.fill(); c.beginPath(); c.moveTo(208, 70); c.quadraticCurveTo(246, 30, 232, 0); c.quadraticCurveTo(206, 40, 182, 44); c.fill();
        c.strokeStyle = '#d4a017'; c.lineWidth = 10; c.beginPath(); c.arc(128, 168, 22, 0.2, Math.PI - 0.2); c.stroke(); }
      c.fillStyle = '#fff'; for (const ex of [88, 168]) { c.beginPath(); c.ellipse(ex, 110, 26, 32, 0, 0, 7); c.fill(); } });
  const GH = [{ col: '#ff2a1a', horns: true, name: 'MINO' }, { col: '#ffb8ff', name: 'PINKY' }, { col: '#00ffff', name: 'INKY' }, { col: '#ffb852', name: 'CLYDE' }].map((g, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ghostTex(g.col, g.horns), transparent: true, toneMapped: false, depthWrite: false }));
    m.position.y = 0.35; const pup = [0, 1].map(() => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2121ff, toneMapped: false })); p.position.y = 0.4; pac.add(p); return p; });
    pac.add(m); return Object.assign(g, { m, pup }); });
  // staff ghosts wander the maze graph (deterministic random walk, one cell per 0.9 s)
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const walks = [1, 2, 3].map(gi => { const r = rng(900 + gi), seq = [(Math.floor(r() * R) * C + Math.floor(r() * C))]; let prev = -1;
    for (let k = 0; k < 260; k++) { const c = seq[seq.length - 1], i = c % C, j = (c / C) | 0, opts = [];
      for (let d = 0; d < 4; d++) if (MZ.open[c][d]) { const n = (j + DIRS[d][1]) * C + i + DIRS[d][0]; if (n !== prev || opts.length === 0) opts.push(n); }
      const nx = opts.length > 1 ? opts.filter(n => n !== prev) : opts; prev = c; seq.push(nx[Math.floor(r() * nx.length)]); } return seq; });
  const ghostPos = (gi, f) => { const t = f / FPS / 0.9, k = Math.floor(t), e = smooth(t - k), seq = walks[gi], a = cellXZ(seq[k % seq.length]), b = cellXZ(seq[(k + 1) % seq.length]);
    return V3(lerp(a[0], b[0], e), 0, lerp(a[1], b[1], e)); };
  const CI3 = (TEL.find(t => /MAP CHECKIN 3/.test(t.special_events)) || { frame: 2668 }).frame;
  function updatePac(f) {
    const P = posAt(S[f]), h = HEAD[f]; let eaten = 0;
    for (let i = 0; i < nArrows; i++) { const a = ARW[i], on = a.s > S[f]; if (!on) eaten++; dummy.position.copy(posAt(a.s)).setY(0.3); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(on ? 1 : 0); dummy.updateMatrix(); pellets.setMatrixAt(i, dummy.matrix); }
    pellets.instanceMatrix.needsUpdate = true;
    let pw = 0; POWER.forEach((s, i) => { const on = s > S[f]; if (!on) pw++; dummy.position.copy(posAt(s)).setY(0.4); dummy.scale.setScalar(on ? (f % 16 < 8 ? 1 : 0.001) : 0); dummy.updateMatrix(); powerP.setMatrixAt(i, dummy.matrix); });
    powerP.instanceMatrix.needsUpdate = true;
    const moving = S[Math.min(N - 1, f + 1)] - S[f] > 0.002;
    const mouth = moving ? [0, 1, 2, 3, 2, 1][Math.floor(((beatPos[f] * 2) % 1 + 1) % 1 * 6)] : 1;
    pacMan.material.map = pacTexs[mouth]; pacMan.position.set(P.x, 0.3, P.z); pacMan.rotation.y = Math.atan2(-h.z, h.x);
    // ghosts
    const targets = [];
    const minoMap = f >= CI3 && f < CI3 + 150 ? (() => { const a = cellXZ(MZ.pathCells[Math.min(MZ.pathCells.length - 1, 30)]), t = (f - CI3) / 150; return V3(a[0] - CS * 3 + t * CS * 6, 0, a[1] + Math.sin(t * 3) * 1.2); })()
      : minoOn(f) ? posAt(SM[f]) : null;
    GH.forEach((g, i) => { const p = i === 0 ? minoMap : ghostPos(i - 1, f); g.m.visible = !!p; g.pup.forEach(q => q.visible = !!p); if (!p) return;
      g.m.position.set(p.x, 0.35 + i * 0.01, p.z); const d = P.clone().sub(p).setY(0); d.lengthSq() > 1e-6 ? d.normalize() : d.set(1, 0, 0);
      g.pup.forEach((q, k) => q.position.set(p.x + (k ? 0.53 : -0.53) + d.x * 0.2, 0.42, p.z - 0.24 + d.z * 0.26)); });
    return { eaten, pw };
  }
  // pellets eaten up to frame f (score), precomputed
  const EATEN = new Int32Array(N); { let k = 0; for (let f = 0; f < N; f++) { while (k < nArrows && ARW[k].s <= S[f]) k++; EATEN[f] = k; } }
  const scoreAt = f => EATEN[f] * 10 + POWER.filter(s => s <= S[f]).length * 50;

  // ---------------------------------------------------------------- FPV 'weapon': the trolley handle in his paws (Doom view model)
  const weapon = new THREE.Group(); camera.add(weapon); weapon.visible = false;
  { const tc = trolley.clone(true); tc.rotation.y = Math.PI; tc.position.set(0, -1.5, -1.24); weapon.add(tc); weapon.userData.box = tc.getObjectByName('flatbox');
    const coat = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.85 }), fur = new THREE.MeshStandardMaterial({ color: 0xd9dadc, roughness: 0.95 }), pad = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.7 });
    for (const sx of [-1, 1]) { const a = V3(sx * 0.42, -0.86, -0.32), b = V3(sx * 0.2, -0.46, -0.68), d = b.clone().sub(a), L = d.length();
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, L, 14), coat); sl.position.copy(a).add(b).multiplyScalar(0.5); sl.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); weapon.add(sl);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 16), fur); cuff.position.copy(b).addScaledVector(d, -0.05); cuff.quaternion.copy(sl.quaternion); cuff.rotateX(Math.PI / 2); weapon.add(cuff);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); paw.scale.set(1.15, 0.85, 1.25); paw.position.copy(b).add(V3(0, 0.025, -0.02)); weapon.add(paw);
      for (let k = -1; k <= 1; k++) { const toe = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pad); toe.position.copy(paw.position).add(V3(k * 0.035, 0.05, -0.06)); weapon.add(toe); } }
    weapon.traverse(o => { o.castShadow = false; }); }

  // ---------------------------------------------------------------- Doom status bar data + reactive face
  const PATIENCE = new Float32Array(N); { let v = 100; for (let f = 0; f < N; f++) { v -= 0.0045; if (minoOn(f) && S[f] - SM[f] < 7) v -= 0.028;
    if (f === F.badge) v -= 15; if (f === F.snap) v += 6; if (f >= doorFrame) v += 1.2; v = clamp(v, 1, 100); PATIENCE[f] = v; } }
  const faceCv = document.createElement('canvas'); faceCv.width = faceCv.height = 128; $('face').appendChild(faceCv);
  const fctx = faceCv.getContext('2d');
  const FACES = {};
  function faceCrop(key, anim, idx) { const a = AM.animations[anim].frames[idx], [x, y, w, h] = a.rect, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.drawImage(atlasTex.image, x, y, w, h, 0, 0, w, h); const d = c.getImageData(0, 0, w, h).data; let top = h;
    for (let yy = 0; yy < h && top === h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 128) { top = yy; break; }
    const side = Math.round((a.pivot[1] - top) * 0.25); let sx = 0, n = 0; for (let yy = top; yy < top + side * 0.8; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 128) { sx += xx; n++; }
    FACES[key] = { cv, cx: n ? sx / n : w / 2, top, side }; }
  faceCrop('front', 'walk_front', 0); faceCrop('look', 'actions2', 3); faceCrop('startle', 'actions2', 5);
  function drawFace(f) {
    const st = telAt(f).sprite_state, bp = beatPos[f], bar = Math.floor(bp / 8), ph = ((bp % 8) + 8) % 8;
    const scared = st === 'freeze' || st === 'step_back' || (minoOn(f) && S[f] - SM[f] < 5) || (f - F.snap >= 0 && f - F.snap < 20);
    let key = 'front', mir = false; if (scared) key = 'startle'; else if (ph >= 6 && ph < 7) { key = 'look'; mir = bar % 2 === 0; }
    const F0 = FACES[key]; fctx.fillStyle = '#1b120c'; fctx.fillRect(0, 0, 128, 128); fctx.save();
    if (mir) { fctx.translate(128, 0); fctx.scale(-1, 1); }
    const s = F0.side * 1.15; fctx.drawImage(F0.cv, F0.cx - s / 2, F0.top - s * 0.06, s, s, 0, 0, 128, 128); fctx.restore();
    const red = 1 - PATIENCE[f] / 100; if (red > 0.25) { fctx.fillStyle = `rgba(160,0,0,${(red - 0.25) * 0.5})`; fctx.fillRect(0, 0, 128, 128); }
    const g = fctx.createRadialGradient(64, 64, 40, 64, 64, 92); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); fctx.fillStyle = g; fctx.fillRect(0, 0, 128, 128);
  }
  // ---------------------------------------------------------------- kill-feed, achievements, speedrun split
  const erasedM = Math.max(0, SM[F.erase1 - 1] - S[F.tie]);
  const FEED = [[F.pickBox, 'WOLFGANG picked up <b>DAEDALUS (1/2)</b>'], [F.threadFound, 'WOLFGANG found <b>THREAD</b>'], [F.tie, '<b>THREAD</b> anchored to ARIADNE bed'],
    [F.badge, 'SYSTEM promoted <b>WOLFGANG</b>'], [F.rise1, 'MAP updated without consent'], [F.snap, '<b>SHOWROOM</b> unfolded'], [F.minoReveal, '<b class="r">MINO-7000</b> has entered the aisle'],
    [F.erase0, '<b class="r">MINO-7000</b> is erasing <b>THREAD</b>'], [F.erase1, `<b class="r">MINO-7000</b> erased ${erasedM.toFixed(0)} m of <b>THREAD</b>`], [F.minoan, 'SHELVING became <b>COLUMNS</b>'],
    [F.finalChorus, '<b>ARROWS</b> are swarming'], [F.layArrow, '<b class="r">MINO-7000</b> obeyed an <b>ARROW</b>'], [doorFrame, 'WOLFGANG left the building']].sort((a, b) => a[0] - b[0]);
  const ACH = [[F.pickBox, 'FLAT-PACK ACQUIRED', 'DAEDALUS shelf, 1 of 2'], [F.badge, 'PERMANENT ASSISTANT', 'Promoted without applying'], [F.tie, 'ARIADNE PROTOCOL', 'Tied a thread to a single bed'],
    [F.minoReveal + 40, 'CLEAN-UP ON AISLE EVERYWHERE', 'Met MINO-7000'], [F.layArrow + 20, 'FOLLOW THE YELLOW', 'Made the cleaner obey an arrow'], [doorFrame + 10, 'EXIT FOUND', 'Any% speedrun complete']];
  const SPLITS = M.sections.map((x, i) => ({ f: sec2f(x.start_s), name: x.name.toUpperCase(), d: (hash(i, 5) - 0.62) * 1.4 }));
  const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  function updateGameHUD(f, mode, pacOn) {
    const hudOff = f >= F.hudOff || mode === 'BLACK' || f < 326;
    // Doom bar
    const doomOn = !hudOff && !pacOn && mode !== 'CLOSE' && mode !== 'EXT';
    $('doom').style.display = doomOn ? 'flex' : 'none';
    if (doomOn) { drawFace(f);
      $('d_ammo').textContent = String(nArrows - EATEN[f]); $('d_pat').textContent = Math.round(PATIENCE[f]) + '%';
      $('d_rec').textContent = String(Math.max(0, Math.floor((S[f] - L0) / CS) + 1));
      $('k_b').className = 'key b' + (f >= F.pickBox ? ' on' : ''); $('k_y').className = 'key y' + (f >= F.threadFound ? ' on' : ''); $('k_r').className = 'key r' + (f >= F.badge ? ' on' : '');
      const flashA = f % 8 < 4 && PATIENCE[f] < 25; $('d_pat').style.color = flashA ? '#ffd400' : ''; }
    // Pac HUD
    $('pac').style.display = pacOn && f < F.black ? 'block' : 'none';
    if (pacOn) { const sc = scoreAt(f), ready = CHECKINS.some(c => f >= c.f && f - c.f < 40);
      $('pac').innerHTML = `<div class="top"><span class="${f % 30 < 15 ? '' : 'dim'}">1UP</span> <b>${String(sc).padStart(6, '0')}</b><span class="hs">HIGH SCORE <b>ASTERION</b></span></div>` +
        (ready ? '<div class="ready">READY!</div>' : '') + `<div class="bot"><span class="lives">${'<i></i>'.repeat(1)}</span><span class="fruit">${f >= F.pickBox ? '<em class="bx"></em>' : ''}${f >= F.threadFound ? '<em class="sp"></em>' : ''}${f >= F.badge ? '<em class="bd"></em>' : ''}</span></div>`; }
    // feed
    const fe = hudOff || pacOn ? [] : FEED.filter(([fr]) => f >= fr && f - fr < 180).slice(-4);
    $('feed').innerHTML = fe.map(([fr, t]) => `<div style="opacity:${(1 - smooth((f - fr - 150) / 30)).toFixed(2)}">${t}</div>`).join('');
    // achievement toast
    const ac = ACH.find(([fr]) => f >= fr && f - fr < 105);
    if (ac && mode !== 'BLACK') { const k = f - ac[0], y = k < 10 ? 1 - easeOutCubic(k / 10) : k > 90 ? smooth((k - 90) / 15) : 0;
      $('ach').innerHTML = `<div style="transform:translateY(${(y * 140).toFixed(1)}%);opacity:${(1 - y).toFixed(2)}"><i></i><span><small>ACHIEVEMENT UNLOCKED</small><br>${ac[1]}<br><em>${ac[2]}</em></span></div>`; }
    else $('ach').innerHTML = '';
    // speedrun split
    const sp = SPLITS.filter(x => f >= x.f).pop();
    const showSplit = !hudOff && !pacOn && mode !== 'CLOSE';
    $('split').innerHTML = showSplit ? `<b>${fmtT(f / FPS)}</b> ${sp ? sp.name : ''} <span class="${sp && sp.d < 0 ? 'g' : 'r'}">${sp ? (sp.d < 0 ? '' : '+') + sp.d.toFixed(2) : ''}</span>` : '';
  }

  // ---------------------------------------------------------------- camera director""")

# pac board needs exit coords before use
R("  // ---------------------------------------------------------------- PAC-MAN LAYER (top-down / map grammar)",
  "  const exitXZ = cellXZ(MZ.exit);\n  // ---------------------------------------------------------------- PAC-MAN LAYER (top-down / map grammar)")

# CHECKINS must be defined before updateGameHUD uses it at runtime (it is defined later in HUD section: fine, runtime only)

# ---------------------------------------------------------------- per-frame wiring
R("    // thread, arrows\n    updateThread(f); updateArrows(f);",
r"""    // thread, arrows
    updateThread(f); updateArrows(f);
    // PAC-MAN switch: any camera above 26 m sees the store as the arcade board it really is
    const pacAt = ff => cameraAt(clamp(ff, 0, N - 1)).pos.y > 26;
    const pacOn = camera.position.y > 26 && mode !== 'BLACK';
    const pacEdge = !pacOn ? 0 : [1, 2, 3].some(k => !pacAt(f - k)) ? 1 : 0;
    pac.visible = pacOn; world.visible = !pacOn; arrows.visible = !pacOn;
    if (pacOn) { updatePac(f); wolf.root.visible = mino.root.visible = blob.visible = trolley.visible = bag.visible = false; ring.visible = mRing.visible = false; }
    // FPV weapon
    weapon.visible = mode === 'FPV' && f < doorFrame && !pacOn;
    if (weapon.visible) { const bp2 = beatPos[f]; weapon.position.set(Math.sin(bp2 * Math.PI) * 0.018, -Math.abs(Math.sin(bp2 * Math.PI)) * 0.022, 0); weapon.rotation.z = Math.sin(bp2 * Math.PI) * 0.015;
      weapon.userData.box.visible = f >= F.pickBox; }""")
R("    park.visible = outside || mapView || mode === 'EXT' || f >= F.hudOff;",
  "    park.visible = (outside || mapView || mode === 'EXT' || f >= F.hudOff) && !pacOn; doorGlow.visible = !pacOn; fourPoster.visible = fourPoster.visible;")
R("    scene.background = outside ? skyExt : sky;\n    scene.fog = (mode === 'MAP' || mode === 'MAP_ORBIT' || outside) ? null : (scene.fog || new THREE.Fog(0xd9d3c8, 26, 85));",
r"""    scene.background = pacOn ? new THREE.Color(0) : outside ? skyExt : sky;
    scene.fog = (pacOn || mode === 'MAP' || mode === 'MAP_ORBIT' || outside) ? null : (scene.fog || new THREE.Fog(0x2a2622, 20, 78));
    // fluorescent pools: the six panels nearest the camera focus; faulty tubes flicker
    { const focus = mode === 'FPV' ? camera.position.clone().setY(0) : P; const near = PANELS.map(q => [q, q.p.distanceToSquared(focus.clone().setY(q.p.y))]).sort((a, b) => a[1] - b[1]).slice(0, 6);
      const lvl = f < 170 ? smooth(f / 170) : 1;
      fluo.forEach((l, k) => { const [q] = near[k]; l.position.copy(q.p); const d = Math.sqrt(near[k][1]);
        const fl = q.faulty ? (hash(q.id, f >> 1) > 0.35 ? 1 : 0.08) : 1; l.intensity = pacOn || outside ? 0 : 26 * smooth(1 - (d - 4) / 7) * fl * lvl; }); }
    // pursuit alarm: red beacon sweeps on the beat while MINO hunts
    { const pursuit = (f >= F.minoReveal && f < F.minoReveal + 420) || (f >= F.erase0 && f < F.erase1) || (f >= F.finalChorus && f < F.layArrow);
      alarmL.intensity = pursuit && !pacOn ? 28 * Math.pow(0.5 + 0.5 * Math.cos(beatPos[f] * Math.PI), 2) : 0;
      alarmL.position.copy(P).add(V3(Math.cos(f * 0.21) * 3, 2.6, Math.sin(f * 0.21) * 3)); }
    gtao.enabled = !pacOn && !CPU_AO_OFF;""")
R("    fu.uFade.value = mode === 'BLACK' ? 0 : Math.min(smooth(f / 12), smooth((N - 1 - f) / 20));",
  "    fu.uFade.value = mode === 'BLACK' ? 0 : Math.min(smooth(f / 12), smooth((N - 1 - f) / 20));\n"
  "    if (pacEdge) { fu.uGlitch.value = 1; fu.uFlash.value = Math.max(fu.uFlash.value, 0.35); }\n"
  "    if (pacOn) { fu.uCyan.value = 0; fu.uAmber.value = 0; fu.uCold.value = 0; fu.uCA.value = 0.4; fu.uVig.value = 0.2; }")
R("    bloom.strength = 0.45 + (chorus ? 0.35 * kick : 0.1 * kick);",
  "    bloom.strength = pacOn ? 0.9 : 0.4 + (chorus ? 0.35 * kick : 0.1 * kick); bloom.threshold = pacOn ? 0.2 : 0.92;")
R("    updateHUD(f, mode); updateMapCard(f, mode);", "    updateHUD(f, mode, pacOn); updateMapCard(f, mode); updateGameHUD(f, mode, pacOn);")
R("  function updateHUD(f, mode) {", "  function updateHUD(f, mode, pacOn) {")
R("    $('hud').style.display = off ? 'none' : 'block'; $('mini').style.display = off || mode === 'MAP' || mode === 'MAP_ORBIT' ? 'none' : 'block';",
  "    $('hud').style.display = off || pacOn ? 'none' : 'block'; $('mini').style.display = off || pacOn || mode === 'MAP' || mode === 'MAP_ORBIT' ? 'none' : 'block';")
R("      `<div class=\"row inv\">INVENTORY ${inv.length ? inv.map(s => `<span>${s}</span>`).join('') : '<i>empty</i>'}</div>${badge}` : '');",
  "      `${badge}` : '');")
R("  const CPU = Q.get('quality') === 'cpu';", "  const CPU = Q.get('quality') === 'cpu';\n  const CPU_AO_OFF = Q.get('ao') === '0';")
# hemi intensities
R("if (f < 170) hemi.intensity = 0.25 + 0.55 * smooth(f / 170); else hemi.intensity = outside ? 1.4 : 0.8;",
  "if (f < 170) hemi.intensity = 0.12 + 0.23 * smooth(f / 170); else hemi.intensity = outside ? 1.4 : 0.35;")
R("    floor.material.color.setHex(0xffffff).lerp(new THREE.Color(0xe7c48e), minoan * 0.7);",
  "    floor.material.color.setHex(0xffffff).lerp(new THREE.Color(0xe7c48e), minoan * 0.7);\n    mat.wall.color.setHex(0xf4ede2).lerp(new THREE.Color(0xe8b98a), minoan * 0.6);")

# ---------------------------------------------------------------- DOM + CSS
R('<div id="card"></div><div id="debug"></div></div>',
  '<div id="card"></div><div id="feed"></div><div id="split"></div><div id="ach"></div><div id="pac"></div>'
  '<div id="doom"><div class="cell"><div class="num" id="d_ammo">0</div><div class="lab">ARROWS</div></div><div class="cell"><div class="num" id="d_pat">100%</div><div class="lab">PATIENCE</div></div>'
  '<div id="face"></div><div class="cell"><div class="num" id="d_rec">0</div><div class="lab">ROOMS</div></div>'
  '<div class="keys"><div class="key b" id="k_b">BOX</div><div class="key y" id="k_y">THREAD</div><div class="key r" id="k_r">BADGE</div></div></div><div id="debug"></div></div>')
R("body.clean #hud, body.clean #mini{display:none}", "body.clean #hud, body.clean #mini, body.clean #doom, body.clean #feed, body.clean #split, body.clean #ach, body.clean #pac{display:none!important}")
R("#debug:empty{display:none}", r"""#doom{position:absolute;left:0;right:0;bottom:0;height:12.5vh;display:flex;align-items:stretch;gap:.4vh;padding:.5vh;box-sizing:border-box;
  background:linear-gradient(180deg,#6b6155 0%,#4a4239 18%,#3a332c 100%);border-top:.45vh solid #8a7f71;box-shadow:inset 0 .4vh 0 #9b8f80}
#doom .cell{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;border:.35vh solid;border-color:#2a241e #7d7265 #7d7265 #2a241e;background:#3d362f}
#doom .num{font-family:"DejaVu Sans Condensed","DejaVu Sans",Impact,sans-serif;font-weight:900;font-size:calc(6.4*var(--u));line-height:1;color:#c8170f;
  text-shadow:.35vh .35vh 0 #2b0402,-.12vh -.12vh 0 #ff7a5c;letter-spacing:-.03em}
#doom .lab{font-family:"DejaVu Sans",sans-serif;font-weight:700;font-size:calc(1.45*var(--u));color:#dacfbd;letter-spacing:.24em;margin-top:.5vh;text-shadow:0 .15vh 0 #000}
#face{width:11.5vh;border:.35vh solid;border-color:#2a241e #7d7265 #7d7265 #2a241e;background:#1b120c;line-height:0}
#face canvas{width:100%;height:100%}
#doom .keys{width:12vh;display:flex;flex-direction:column;justify-content:center;gap:.5vh;padding:0 .8vh;border:.35vh solid;border-color:#2a241e #7d7265 #7d7265 #2a241e;background:#3d362f}
#doom .key{height:2.4vh;line-height:2.4vh;text-align:center;font-family:"DejaVu Sans",sans-serif;font-weight:700;font-size:calc(1.25*var(--u));color:#111;opacity:.14;border-radius:.4vh;border:.2vh solid #000}
#doom .key.on{opacity:1;box-shadow:0 0 1vh currentColor}
#doom .key.b{background:#3a6cff}#doom .key.y{background:#ffd400}#doom .key.r{background:#e8202a}
#feed{position:absolute;right:2.4vw;top:calc(3.4vh + 22*var(--u));text-align:right;font-family:"DejaVu Sans Mono",monospace;font-size:calc(1.6*var(--u));line-height:1.7;color:#e9f6f8}
#feed div{display:inline-block;clear:both;float:right;background:#000000a0;padding:.1vh .8vh;margin-top:.4vh;border-right:.4vh solid #19f0ff}
#feed b{color:#ffd400}#feed b.r{color:#ff4a3a}
#split{position:absolute;left:50%;transform:translateX(-50%);top:2.2vh;font-family:"DejaVu Sans Mono",monospace;font-size:calc(1.7*var(--u));color:#dfe;background:#000000a8;padding:.4vh 1.2vh;border:1px solid #ffffff30}
#split:empty{display:none}#split b{color:#fff}#split .g{color:#3dff8a}#split .r{color:#ff4a3a}
#ach{position:absolute;left:50%;transform:translateX(-50%);bottom:16vh;overflow:hidden}
#ach>div{display:flex;align-items:center;gap:1.4vh;background:linear-gradient(90deg,#101418f0,#1b232af0);border:1px solid #ffd40088;border-radius:6vh;padding:1vh 3vh 1vh 1vh;
  font-family:"DejaVu Sans",sans-serif;color:#fff;font-size:calc(2*var(--u));line-height:1.25;box-shadow:0 0 2vh #000}
#ach i{width:6vh;height:6vh;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6b0,#ffd400 45%,#b8860b);box-shadow:0 0 1.6vh #ffd400aa}
#ach small{color:#ffd400;letter-spacing:.2em;font-size:calc(1.3*var(--u))}#ach em{color:#b9c6cf;font-size:calc(1.5*var(--u))}
#pac{position:absolute;inset:0;font-family:"DejaVu Sans Mono",monospace;font-weight:700;color:#fff;text-transform:uppercase}
#pac .top{position:absolute;left:0;right:0;top:2vh;text-align:center;font-size:calc(3*var(--u));letter-spacing:.12em}
#pac .top b{margin:0 3vw 0 1vw}#pac .top .dim{opacity:.15}#pac .hs{color:#ffb8ff}#pac .hs b{color:#fff}
#pac .ready{position:absolute;left:0;right:0;top:46%;text-align:center;font-size:calc(5*var(--u));color:#ffe600;letter-spacing:.15em;text-shadow:0 0 2vh #ffe60088}
#pac .bot{position:absolute;left:4vw;right:4vw;bottom:2.5vh;display:flex;justify-content:space-between}
#pac .lives i{display:inline-block;width:3.2vh;height:3.2vh;border-radius:50%;background:conic-gradient(from 120deg,transparent 0 60deg,#ffe600 60deg 360deg);margin-right:1vh}
#pac .fruit em{display:inline-block;width:3.6vh;height:2.6vh;margin-left:1.2vh;border:.3vh solid #000}
#pac .fruit .bx{background:linear-gradient(#1d3f8f 0 35%,#c4a77d 35%)}#pac .fruit .sp{background:#ffa31a;border-radius:50%;width:2.8vh;height:2.8vh}#pac .fruit .bd{background:#ffd400}
#debug:empty{display:none}""")
R("#card{position:absolute;left:0;right:0;bottom:9vh;text-align:center}", "#card{position:absolute;left:0;right:0;bottom:18vh;text-align:center}")
R("#debug{position:absolute;left:1.2vw;bottom:1.4vh;", "#debug{position:absolute;left:1.2vw;bottom:14vh;")

open(p, 'w').write(s)
print('patched OK')
