'use strict';
// =====================================================================================================================
// The Absurdity Bureau :: labyrinth_renderer.js  (Engine v9 "Labyrinth", track: The Showroom Labyrinth)
// ---------------------------------------------------------------------------------------------------------------------
// One file: Node render farm (static server + Puppeteer + FFmpeg, forked from v7.1 RTTR) AND the Three.js scene
// (sceneMain, serialised into the page). Every frame is a pure function of (frame, manifest.json, atlas_map.json).
// No Math.random, no clocks, no requestAnimationFrame: Puppeteer calls window.renderFrame(f), waits for gl.finish().
//
// Track folder (--root) must contain:
//   manifest.json  atlas_map.json  audio_master.wav  Master_Sprite_Atlas.png  Master_Normal_Atlas.png
//
//   node labyrinth_renderer.js --root .. --spot 300,1500,2100      stills (PNG) with DEBUG overlay
//   node labyrinth_renderer.js --root .. --strip                   TEST_STRIP_MODE: 300 frames over the chorus-1 snap
//   node labyrinth_renderer.js --root .. --range 3000 3600         any slice [start, end)
//   node labyrinth_renderer.js --root .. --master --pipe           full master (needs STRIP_APPROVED)
//   node labyrinth_renderer.js --root .. --serve                   live preview (?f=1234, arrow keys scrub)
// Options: --res 1920x1080 | 1080x1920   --workers 2   --crf 16   --quality high|cpu   --debug / --no-debug   --out renders
// Env:     FFMPEG_PATH, CHROME_PATH, CHROME_ARGS ("--use-angle=d3d11" Windows GPU, "--use-angle=swiftshader" no GPU)
// =====================================================================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');

const argv = process.argv.slice(2);
const has = k => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

const ROOT = path.resolve(arg('--root', process.cwd()));
const THREE_DIR = path.resolve(path.dirname(require.resolve('three')), '..');
const PORT = Number(arg('--port', 8717));
const STRIP = has('--strip'), MASTER = has('--master'), RANGE = has('--range'), SERVE = has('--serve'), SPOT = has('--spot');
const PIPE = has('--pipe');
const QUALITY = arg('--quality', 'high');
const CRF = arg('--crf', '16');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TRACK_TAG = 'The_Showroom_Labyrinth';
const STRIP_RANGE = [1908, 2208];   // 1:03.6 to 1:13.6: build, arrow lifts like vinyl, CHORUS SNAP at 1:07.83
const log = (...a) => console.log(...a);

if (!STRIP && !MASTER && !RANGE && !SERVE && !SPOT) {
  log('Usage: node labyrinth_renderer.js --strip | --master [--pipe] | --range <a> <b> | --spot f1,f2 | --serve  [--res WxH]');
  process.exit(1);
}

// =====================================================================================================================
// BROWSER SIDE
// =====================================================================================================================
async function sceneMain(THREE, X) {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1920, H = +Q.get('h') || 1080;
  if (W < H) document.body.classList.add('portrait');
  if (Q.get('clean') === '1') document.body.classList.add('clean');
  const DEBUG = Q.get('debug') === '1';
  const CPU = Q.get('quality') === 'cpu';
  const CPU_AO_OFF = Q.get('ao') === '0';
  const DBG_NOENV = Q.get('noenv') === '1', DBG_NOFLUO = Q.get('nofluo') === '1', DBG_NOBLOOM = Q.get('nobloom') === '1';
  const ASPECT = W / H;
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- maths (deterministic)
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const smoother = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const htmlEsc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- data layer
  const M = await (await fetch('manifest.json')).json();
  const AM = await (await fetch('atlas_map.json')).json();
  const A = M.acoustic, FPS = M.fps, N = M.total_frames_at_30fps;
  const sec2f = s => Math.round(s * FPS);
  const TEL = M.telemetry.slice().sort((a, b) => a.frame - b.frame).map(t => Object.assign({}, t, { special_events: String(t.special_events || '').replace(/_/g, ' ') }));
  const telIdx = new Int32Array(N); { let k = 0; for (let f = 0; f < N; f++) { while (k + 1 < TEL.length && TEL[k + 1].frame <= f) k++; telIdx[f] = k; } }
  const telAt = f => TEL[telIdx[clamp(f, 0, N - 1)]];
  const evStart = f => TEL[telIdx[f]].frame, evEnd = f => (telIdx[f] + 1 < TEL.length ? TEL[telIdx[f] + 1].frame : N);
  const findEv = re => TEL.find(t => re.test(t.special_events) || re.test(t.lyric || ''));
  const secAt = f => { const t = f / FPS; let s = M.sections[0]; for (const x of M.sections) if (x.start_s <= t + 1e-6) s = x; return s; };
  // beat grid
  const BEATS = A.beats_s;
  const beatPos = new Float32Array(N);
  { let i = 0; for (let f = 0; f < N; f++) { const t = f / FPS; while (i + 1 < BEATS.length && BEATS[i + 1] <= t) i++;
    if (t < BEATS[0]) beatPos[f] = (t - BEATS[0]) / (BEATS[1] - BEATS[0]);
    else if (i + 1 < BEATS.length) beatPos[f] = i + (t - BEATS[i]) / (BEATS[i + 1] - BEATS[i]);
    else beatPos[f] = i + (t - BEATS[i]) / (BEATS[i] - BEATS[i - 1]); } }
  const norm = arr => { const m = Math.max(1e-6, ...arr); return arr.map(v => v / m); };
  const ENV = { kick: norm(A.kick_env_30fps), bass: norm(A.bass_env_30fps), hats: norm(A.hats_env_30fps), onset: norm(A.onset_env_30fps), rms: norm(A.rms_30fps) };
  const env = (k, f) => ENV[k][clamp(f, 0, N - 1)];

  // ---------------------------------------------------------------- key story frames (anchored to lyric/events, never hard-coded)
  const fOf = (re, d) => { const e = findEv(re); return e ? e.frame : d; };
  const F = {
    pickBox: fOf(/DAEDALUS shelf/i, 1091), badge: fOf(/badge changes/i, 1327), threadFound: fOf(/thread found/i, 1371),
    tie: fOf(/thread tied/i, 1410), rise1: fOf(/RISE 1/i, 1490), fourPoster: sec2f(50.62), snap: fOf(/CHORUS SNAP/i, 2035),
    vinyl: fOf(/arrow lifts like vinyl/i, 1992), minoReveal: fOf(/MINO7000 reveal/i, 2981), erase0: fOf(/MINO pursues/i, 3886),
    erase1: fOf(/BREAK2/i, 4841), minoan: fOf(/BREAK2/i, 4841), finalChorus: fOf(/FINAL CHORUS/i, 5254), icarus: fOf(/ICARUS/i, 5336),
    hudOff: fOf(/hud off/i, 5606), layArrow: fOf(/lays one arrow/i, 5736), ext: fOf(/car park/i, 5988), halfShelf: fOf(/half shelf/i, 6217),
    black: fOf(/hard cut/i, 6302)
  };

  // ---------------------------------------------------------------- locomotion: speed per sprite state -> distance s(f)
  const SPEED = { walk: 1.45, push_trolley: 1.35, run: 4.4, idle: 0, idle_trolley: 0, freeze: 0, slowmo: 0.7, turn_left: 1.3,
    turn_right: 1.3, look_left: 0.7, look_right: 0.7, look_down: 0.6, tie_thread: 0, step_back: 0 };
  const sRaw = new Float64Array(N); { let v = 0, s = 0; for (let f = 0; f < N; f++) { const st = telAt(f).sprite_state;
    const tgt = SPEED[st] ?? 1.2; v += (tgt - v) * 0.12; s += v / FPS; sRaw[f] = s; } }
  const doorFrame = Math.min(N - 1, F.layArrow + sec2f(2.2));

  // ---------------------------------------------------------------- maze (seeded recursive backtracker, seed chosen so cells are ~7 m)
  const C = 15, R = 11;
  function buildMaze(seed) {
    const r = rng(seed), open = Array.from({ length: C * R }, () => [false, false, false, false]); // +x,-x,+z,-z
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]], OPP = [1, 0, 3, 2];
    const seen = new Uint8Array(C * R), stack = [[0, R - 1]]; seen[(R - 1) * C] = 1;
    while (stack.length) { const [i, j] = stack[stack.length - 1]; const nb = [];
      for (let d = 0; d < 4; d++) { const a = i + D[d][0], b = j + D[d][1]; if (a >= 0 && a < C && b >= 0 && b < R && !seen[b * C + a]) nb.push(d); }
      if (!nb.length) { stack.pop(); continue; }
      const d = nb[Math.floor(r() * nb.length)], a = i + D[d][0], b = j + D[d][1];
      open[j * C + i][d] = true; open[b * C + a][OPP[d]] = true; seen[b * C + a] = 1; stack.push([a, b]); }
    // BFS from entrance, exit = farthest cell on the top edge (j = 0)
    const dist = new Int32Array(C * R).fill(-1), prev = new Int32Array(C * R).fill(-1), q = [(R - 1) * C]; dist[q[0]] = 0;
    while (q.length) { const c = q.shift(), i = c % C, j = (c / C) | 0;
      for (let d = 0; d < 4; d++) if (open[c][d]) { const n = (j + D[d][1]) * C + i + D[d][0]; if (dist[n] < 0) { dist[n] = dist[c] + 1; prev[n] = c; q.push(n); } } }
    let ex = 0; for (let i = 0; i < C; i++) if (dist[i] > dist[ex]) ex = i;
    const pathCells = []; for (let c = ex; c >= 0; c = prev[c]) pathCells.unshift(c);
    return { open, pathCells, exit: ex };
  }
  const sDoorRaw = sRaw[doorFrame];
  let MZ = null, best = 1e9, SEED = 0;
  for (let sd = 1; sd <= 400; sd++) { const m = buildMaze(sd); const cs = sDoorRaw / (m.pathCells.length);
    const sc = Math.abs(cs - 7.2) + (m.pathCells.length < 40 ? 99 : 0); if (sc < best) { best = sc; MZ = m; SEED = sd; } }
  const CS = sDoorRaw / MZ.pathCells.length;     // cell size (m): the route through the maze is exactly as long as his walk
  const WALL_H = 2.7, CEIL_H = 3.0;
  const cellXZ = c => [(c % C - (C - 1) / 2) * CS, (((c / C) | 0) - (R - 1) / 2) * CS];
  const onPath = new Uint8Array(C * R); MZ.pathCells.forEach(c => onPath[c] = 1);
  const MAZE_W = C * CS, MAZE_D = R * CS;

  // route curve: entrance (outside bottom) -> cell centres -> exit door (top) -> car park
  const pts = [];
  { const [x0, z0] = cellXZ(MZ.pathCells[0]); pts.push(V3(x0, 0, z0 + CS * 0.5));
    MZ.pathCells.forEach(c => { const [x, z] = cellXZ(c); pts.push(V3(x, 0, z)); });
    const [xe, ze] = cellXZ(MZ.exit); for (const k of [0.5, 1.6, 3.0, 4.6, 6.5]) pts.push(V3(xe, 0, ze - CS * k)); }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); curve.arcLengthDivisions = 6000;
  const LEN = curve.getLength();
  // distance along the curve of the door plane (z = top edge)
  const doorZ = -MAZE_D / 2;
  let LDOOR = 0; { const n = 6000; for (let k = 0; k <= n; k++) { const p = curve.getPointAt(k / n); if (p.z <= doorZ) { LDOOR = LEN * k / n; break; } } }
  const L0 = (() => { const n = 4000; for (let k = 0; k <= n; k++) { const p = curve.getPointAt(k / n); const [x, z] = cellXZ(MZ.pathCells[0]); if (Math.hypot(p.x - x, p.z - z) < 0.05 || p.z <= z) return LEN * k / n; } return 0; })();
  const KS = (LDOOR - L0) / sDoorRaw;
  const S = new Float64Array(N); for (let f = 0; f < N; f++) S[f] = clamp(L0 + sRaw[f] * KS, 0, LEN - 0.01);
  const posAt = s => curve.getPointAt(clamp(s / LEN, 0, 1));
  const headAt = s => { const a = posAt(Math.max(0, s - 0.6)), b = posAt(Math.min(LEN, s + 0.6)); const h = b.sub(a); h.y = 0; return h.lengthSq() < 1e-8 ? V3(0, 0, -1) : h.normalize(); };
  const HEAD = []; { let last = V3(0, 0, -1); for (let f = 0; f < N; f++) { const h = (f > 0 && Math.abs(S[f] - S[f - 1]) < 1e-5) ? last : headAt(S[f]); HEAD.push(h); last = h; } }
  // MINO: follows the route behind him once revealed; erases thread in chorus 2
  const SM = new Float64Array(N); { for (let f = 0; f < N; f++) { const lag = f < F.erase0 ? 9 : f < F.erase1 ? lerp(9, 4.5, smooth((f - F.erase0) / 300)) : 7;
    SM[f] = Math.max(L0, S[f] - lag); } }
  const minoOn = f => f >= F.minoReveal - 45 && f < doorFrame + 30;

  // ---------------------------------------------------------------- renderer
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.86;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const loadTex = url => new Promise(res => new THREE.TextureLoader().load(url, t => res(t), undefined, () => res(null)));
  const atlasTex = await loadTex('Master_Sprite_Atlas.png'), normalTex = await loadTex('Master_Normal_Atlas.png');
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  for (const t of [atlasTex, normalTex]) { t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, ASPECT, 0.1, 900); scene.add(camera);
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new X.RoomEnvironment(), 0.04).texture; scene.environmentIntensity = DBG_NOENV ? 0 : 0.32; }
  const hemi = new THREE.HemisphereLight(0xfff1e0, 0x8f8a80, 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.9); sun.castShadow = true;
  sun.shadow.mapSize.set(CPU ? 1024 : 2048, CPU ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); scene.add(sun, sun.target);
  const keyL = new THREE.PointLight(0xffb45a, 9, 8, 1.6); scene.add(keyL);       // amber key on his face
  const rimL = new THREE.PointLight(0x19f0ff, 3.2, 5, 1.8); scene.add(rimL);       // cyan monocle rim
  const minoL = new THREE.PointLight(0xff2a1a, 0, 8, 1.7); scene.add(minoL);      // MINO red sensor spill
  const fluo = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xfff0d8, 0, 11, 2); scene.add(l); return l; });   // pools under the nearest ceiling panels
  const alarmL = new THREE.PointLight(0xff1a10, 0, 16, 1.5); scene.add(alarmL);   // pursuit beacon

  // ---------------------------------------------------------------- PBR surface library (procedural, deterministic): albedo + normal + roughness
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
  const mat = {};
  const std = (k, o) => mat[k] || (mat[k] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)));
  const pb = (k, fam, o) => { SURF_OF[k] = fam; const t = SURF[fam]; return std(k, Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }, o)); };
  pb('wall', 'wall', { color: 0xf4ede2 }); std('wallTop', { color: 0x2b3038 });
  pb('birch', 'wood', { color: 0xe2c79a }); pb('oak', 'wood', { color: 0xa9784a }); pb('white', 'lam', { color: 0xf6f4f0 }); pb('black', 'lam', { color: 0x2a2c30 });
  pb('grey', 'lam', { color: 0x8c9096 }); pb('fabricBlue', 'fabric', { color: 0x3d5a80 }); pb('fabricSand', 'fabric', { color: 0xcdb99b }); pb('fabricRed', 'fabric', { color: 0x9b3b32 });
  pb('fabricGreen', 'fabric', { color: 0x5b7f5a }); pb('linen', 'fabric', { color: 0xf7f4ee }); std('steel', { color: 0xc8ccd2, metalness: 0.95, roughness: 0.28 });
  std('lampGlow', { color: 0xfff1cc, emissive: 0xffc070, emissiveIntensity: 0.7 }); pb('books', 'fabric', { color: 0x7a4b8c });
  pb('booksB', 'fabric', { color: 0xd8a03c }); pb('booksC', 'fabric', { color: 0x2f7a7a }); pb('rug', 'fabric', { color: 0xb8664a });
  std('minoan', { color: 0xb3261e, roughness: 0.6 });

  // ---------------------------------------------------------------- static world: walls, floor, ceiling, furniture (merged by material)
  const world = new THREE.Group(); scene.add(world);
  const merge = X.BufferGeometryUtils.mergeGeometries;
  const bins = {};   // material key -> [geometries]
  const box = (k, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); (bins[k] || (bins[k] = [])).push(g); };
  const cyl = (k, r1, r2, h, x, y, z, seg = 14) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y + h / 2, z); (bins[k] || (bins[k] = [])).push(g); };
  // floor: polished concrete with tile seams
  const floorTex = canvasTex(1024, 1024, (c, w, h) => { c.fillStyle = '#9fa2a6'; c.fillRect(0, 0, w, h);
    const r = rng(7); for (let i = 0; i < 9000; i++) { const v = 170 + r() * 30 | 0; c.fillStyle = `rgba(${v},${v},${v + 4},0.12)`; c.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    c.strokeStyle = 'rgba(80,84,90,0.35)'; c.lineWidth = 3; for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(k * w / 4, 0); c.lineTo(k * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, k * h / 4); c.lineTo(w, k * h / 4); c.stroke(); } });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(MAZE_W / 6, MAZE_D / 6);
  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
  const FS = SURF.floor, floorRep = [MAZE_W / 4, MAZE_D / 4];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ map: rep(FS.map, ...floorRep), normalMap: rep(FS.normalMap, ...floorRep),
    roughnessMap: rep(FS.roughnessMap, ...floorRep), roughness: 1, metalness: 0.05, envMapIntensity: 1.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  // ceiling (faces down: invisible from above, so map shots see straight into the maze)
  const CSF = SURF.ceil, ceilRep = [MAZE_W / 2.4, MAZE_D / 2.4];
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_D), new THREE.MeshStandardMaterial({ map: rep(CSF.map, ...ceilRep), normalMap: rep(CSF.normalMap, ...ceilRep), roughness: 0.95,
    color: 0xd8d3c8, emissive: 0x2a2824, emissiveIntensity: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL_H; world.add(ceil);
  const PANELS = [];
  const panelGeo = []; for (let c = 0; c < C * R; c++) { const [x, z] = cellXZ(c); for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const g = new THREE.PlaneGeometry(1.2, 0.6); g.rotateX(Math.PI / 2); g.translate(x + ox * CS * 0.22, CEIL_H - 0.01, z + oz * CS * 0.22); panelGeo.push(g);
    PANELS.push({ p: V3(x + ox * CS * 0.22, CEIL_H - 0.2, z + oz * CS * 0.22), faulty: hash(c * 4 + ox + 2 * oz, 77) < 0.13, id: c * 4 + (ox + 1) + (oz + 1) / 2 }); } }
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.2 });
  const panels = new THREE.Mesh(merge(panelGeo), panelMat); world.add(panels);
  // walls (closed sides). Each internal wall is emitted once.
  const T = 0.16;
  for (let c = 0; c < C * R; c++) { const i = c % C, j = (c / C) | 0, [x, z] = cellXZ(c), o = MZ.open[c];
    if (!o[0]) box('wall', T, WALL_H, CS + T, x + CS / 2, 0, z);
    if (!o[2]) box('wall', CS + T, WALL_H, T, x, 0, z + CS / 2);
    if (i === 0 && !o[1]) box('wall', T, WALL_H, CS + T, x - CS / 2, 0, z);
    if (j === 0 && !o[3] && c !== MZ.exit) box('wall', CS + T, WALL_H, T, x, 0, z - CS / 2);
    if (j === 0 && c === MZ.exit) { box('wall', CS * 0.3, WALL_H, T, x - CS * 0.35, 0, z - CS / 2); box('wall', CS * 0.3, WALL_H, T, x + CS * 0.35, 0, z - CS / 2); }
    if (j === R - 1 && c === MZ.pathCells[0]) { box('wall', CS * 0.3, WALL_H, T, x - CS * 0.35, 0, z + CS / 2); box('wall', CS * 0.3, WALL_H, T, x + CS * 0.35, 0, z + CS / 2); }
  }
  // wall caps: dark top edge makes the maze read as a map from above
  for (const g of bins.wall) { const gg = g.clone(); gg.computeBoundingBox(); const b = gg.boundingBox;
    const cap = new THREE.BoxGeometry(b.max.x - b.min.x + 0.02, 0.05, b.max.z - b.min.z + 0.02); cap.translate((b.max.x + b.min.x) / 2, WALL_H + 0.025, (b.max.z + b.min.z) / 2); (bins.wallTop || (bins.wallTop = [])).push(cap); }

  // furniture kits: built against a wall. Local frame: wall at z = 0, room toward +z, x along the wall.
  const ROOMS = ['bedroom', 'kitchen', 'office', 'living', 'bedroom', 'storage'];
  const roomOf = c => ROOMS[Math.floor(hash(c, SEED) * ROOMS.length)];
  const KIT = {
    bed: (p) => { p('oak', 1.7, 0.3, 2.1, 0, 0, 1.05); p('linen', 1.6, 0.22, 1.95, 0, 0.3, 1.05); p('oak', 1.8, 1.0, 0.08, 0, 0, 0.04);
      p('white', 0.6, 0.14, 0.38, -0.42, 0.52, 0.3); p('white', 0.6, 0.14, 0.38, 0.42, 0.52, 0.3); p('fabricBlue', 1.62, 0.06, 1.0, 0, 0.53, 1.45); },
    side: (p) => { p('birch', 0.45, 0.55, 0.4, 0, 0, 0.22); p('lampGlow', 0.22, 0.28, 0.22, 0, 0.55, 0.22); },
    wardrobe: (p) => { p('white', 1.8, 2.1, 0.6, 0, 0, 0.3); p('grey', 0.02, 1.9, 0.62, 0, 0.1, 0.31); },
    counter: (p) => { p('white', 2.6, 0.88, 0.62, 0, 0, 0.31); p('black', 2.62, 0.04, 0.64, 0, 0.88, 0.32); p('white', 2.6, 0.7, 0.35, 0, 1.45, 0.18); p('steel', 0.5, 0.02, 0.4, 0.5, 0.9, 0.3); },
    table: (p) => { p('birch', 1.4, 0.04, 0.8, 0, 0.72, 1.4); for (const [a, b] of [[-0.62, 1.05], [0.62, 1.05], [-0.62, 1.75], [0.62, 1.75]]) p('birch', 0.05, 0.72, 0.05, a, 0, b);
      for (const a of [-0.4, 0.4]) { p('black', 0.42, 0.04, 0.42, a, 0.45, 2.0); p('black', 0.42, 0.45, 0.04, a, 0.45, 2.2); } },
    desk: (p) => { p('white', 1.4, 0.03, 0.7, 0, 0.73, 0.35); p('white', 0.04, 0.73, 0.7, -0.68, 0, 0.35); p('white', 0.4, 0.73, 0.6, 0.48, 0, 0.32); p('black', 0.5, 0.32, 0.03, 0, 0.76, 0.12); },
    shelf: (p) => { p('birch', 1.6, 1.9, 0.04, 0, 0, 0.02); for (let k = 0; k < 5; k++) p('birch', 1.6, 0.03, 0.38, 0, 0.05 + k * 0.45, 0.2);
      for (let k = 0; k < 4; k++) for (let b = 0; b < 5; b++) p(['books', 'booksB', 'booksC'][(k + b) % 3], 0.22, 0.3 + 0.06 * ((k * 3 + b) % 3), 0.28, -0.6 + b * 0.3, 0.08 + k * 0.45, 0.2); },
    sofa: (p) => { p('fabricSand', 2.1, 0.42, 0.9, 0, 0, 0.55); p('fabricSand', 2.1, 0.45, 0.22, 0, 0.42, 0.13); p('fabricSand', 0.2, 0.25, 0.9, -1.0, 0.42, 0.55); p('fabricSand', 0.2, 0.25, 0.9, 1.0, 0.42, 0.55);
      p('rug', 2.2, 0.01, 1.6, 0, 0, 1.9); p('oak', 1.0, 0.38, 0.55, 0, 0, 1.9); },
    rack: (p) => { for (const a of [-1.2, 1.2]) p('steel', 0.06, 2.2, 0.06, a, 0, 0.5); for (let k = 0; k < 3; k++) { p('grey', 2.5, 0.04, 0.9, 0, 0.1 + k * 0.85, 0.5);
      p('oak', 0.9, 0.12, 0.7, -0.6, 0.14 + k * 0.85, 0.5); p('oak', 0.9, 0.12, 0.7, 0.55, 0.14 + k * 0.85, 0.5); } },
  };
  const ROOMKIT = { bedroom: ['bed', 'side', 'wardrobe'], kitchen: ['counter', 'table', 'counter'], office: ['desk', 'shelf', 'shelf'], living: ['sofa', 'shelf', 'side'], storage: ['rack', 'rack', 'shelf'] };
  const tags = [];   // price-tag anchors
  const clocks = []; // wall clocks (9:45 in every room)
  const lamps = [];  // Icarus lamps
  const columns = []; // shelf uprights that become Minoan columns
  for (let c = 0; c < C * R; c++) {
    const [x, z] = cellXZ(c), o = MZ.open[c], room = roomOf(c), kit = ROOMKIT[room];
    // wall sides as (normal into room, along)
    const sides = [[0, V3(-1, 0, 0)], [1, V3(1, 0, 0)], [2, V3(0, 0, -1)], [3, V3(0, 0, 1)]].filter(([d]) => !o[d]);
    let k = 0;
    for (const [d, n] of sides) {
      const name = kit[(k++ + c) % kit.length];
      if (onPath[c] && name === 'table' && sides.length < 3) continue;
      const ry = Math.atan2(n.x, n.z);              // local +z -> n
      const wx = x - n.x * (CS / 2 - T / 2), wz = z - n.z * (CS / 2 - T / 2);
      const p = (m, w, h, dd, lx, ly, lz) => { const g = new THREE.BoxGeometry(w, h, dd); g.translate(lx, ly + h / 2, lz); g.rotateY(ry); g.translate(wx, 0, wz); (bins[m] || (bins[m] = [])).push(g); };
      KIT[name](p);
      const toW = (lx, ly, lz) => { const v = V3(lx, ly, lz).applyAxisAngle(V3(0, 1, 0), ry); return v.add(V3(wx, 0, wz)); };
      tags.push({ p: toW(0.25, name === 'bed' ? 0.75 : name === 'wardrobe' ? 1.2 : 0.95, name === 'bed' ? 2.12 : 0.75), ry, cell: c, kind: name });
      if (name === 'side') lamps.push({ p: toW(0, 0.83, 0.22), cell: c });
      if (name === 'shelf' || name === 'rack') columns.push({ p: toW(0, 0, 0.2), ry, cell: c });
      if (k === 1 && onPath[c]) clocks.push({ p: toW(-1.6, 1.95, 0.02), ry, cell: c });
    }
  }
  const staticGroup = new THREE.Group(); world.add(staticGroup);
  for (const k in bins) { if (SURF_OF[k]) { const [su, sv] = UVS[SURF_OF[k]]; bins[k].forEach(g => worldUV(g, su, sv)); }
    const m = new THREE.Mesh(merge(bins[k]), mat[k]); m.castShadow = k !== 'wallTop'; m.receiveShadow = true; staticGroup.add(m); }

  // ---------------------------------------------------------------- textured props: price tags, clocks, arrows
  const TAGS = ['DAEDALUS 49.99', 'MINOS 129.00', 'ARIADNE 19.99', 'KNOSSOS 7.50', 'LABRYS 34.00', 'ICARUS 12.99', 'THESEUS 89.00', 'PASIPHAE 64.00',
    'ASTERION 210.00', 'CRETE 3.99', 'MAZE 0.00', 'EXIT n/a', 'W 80 x D 30 x H 192', 'SOLD SEPARATELY', 'YOU 1.00', 'TIME 9:45'];
  const tagTex = canvasTex(1024, 512, (c, w, h) => { for (let i = 0; i < 16; i++) { const x = (i % 4) * 256, y = (i / 4 | 0) * 128;
    c.fillStyle = '#ffffff'; c.fillRect(x + 4, y + 4, 248, 120); c.fillStyle = '#ffd400'; c.fillRect(x + 4, y + 4, 248, 18);
    c.fillStyle = '#111'; c.font = 'bold 30px DejaVu Sans'; c.textAlign = 'center'; const [n, ...r] = TAGS[i].split(' ');
    c.fillText(n, x + 128, y + 62); c.font = '24px DejaVu Sans'; c.fillText(r.join(' '), x + 128, y + 100); } });
  const tagGeo = tags.map((t, i) => { const g = new THREE.PlaneGeometry(0.34, 0.17); const id = (hash(t.cell, i) * 12) | 0; const u0 = (id % 4) / 4, v0 = 1 - ((id / 4 | 0) + 1) / 4;
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 4);
    g.rotateY(t.ry); g.translate(t.p.x, t.p.y, t.p.z); return g; });
  const tagMat = new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tagTex, emissiveIntensity: 0.25 });
  const tagMesh = new THREE.Mesh(merge(tagGeo), tagMat); world.add(tagMesh);
  const clockTex = canvasTex(256, 256, (c) => { c.fillStyle = '#fafafa'; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill(); c.lineWidth = 10; c.strokeStyle = '#222'; c.stroke();
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.fillStyle = '#222'; c.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 10, 6, 20); }
    const hand = (a, l, wd) => { c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * l, 128 - Math.cos(a) * l); c.stroke(); };
    hand((9.75 / 12) * Math.PI * 2, 60, 12); hand((45 / 60) * Math.PI * 2, 92, 7); });
  const clockMesh = new THREE.Mesh(merge(clocks.map(k => { const g = new THREE.CircleGeometry(0.28, 32); g.rotateY(k.ry); g.translate(k.p.x, k.p.y, k.p.z); return g; })),
    new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.5 })); world.add(clockMesh);
  // floor arrows: the imposed route (the lie). Instanced, pointing along the route.
  const arrowTex = canvasTex(256, 256, (c) => { c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(128, 18); c.lineTo(230, 130); c.lineTo(166, 130); c.lineTo(166, 238);
    c.lineTo(90, 238); c.lineTo(90, 130); c.lineTo(26, 130); c.closePath(); c.fill(); });
  const ARROW_STEP = 3.2, nArrows = Math.floor(LDOOR / ARROW_STEP);
  const arrowMat = new THREE.MeshStandardMaterial({ map: arrowTex, transparent: true, alphaTest: 0.4, roughness: 0.5, emissive: 0xffd400, emissiveMap: arrowTex, emissiveIntensity: 0.35, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2 });
  const arrowGeo = new THREE.PlaneGeometry(0.9, 0.9); arrowGeo.rotateX(-Math.PI / 2);
  const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, nArrows); arrows.receiveShadow = true; world.add(arrows);
  const ARW = []; for (let i = 0; i < nArrows; i++) { const s = (i + 0.5) * ARROW_STEP; const p = posAt(s), h = headAt(s);
    const side = (hash(i, 3) - 0.5) * 0.6; ARW.push({ s, p: p.clone().add(V3(-h.z, 0, h.x).multiplyScalar(side)), yaw: Math.atan2(h.x, h.z) }); }
  const dummy = new THREE.Object3D();
  function updateArrows(f) {
    const pk = smooth((f - F.finalChorus) / 90) * (f < F.hudOff ? 1 : 1 - smooth((f - F.hudOff) / 60));   // final chorus: arrows peel up and swarm
    const vinyl = f >= F.vinyl && f < F.snap + 20 ? smooth((f - F.vinyl) / 30) * (1 - smooth((f - F.snap) / 20)) : 0;
    for (let i = 0; i < nArrows; i++) { const a = ARW[i]; dummy.position.copy(a.p); dummy.position.y = 0.012; dummy.rotation.set(0, a.yaw, 0); dummy.scale.set(1, 1, 1);
      const d = a.s - S[f];
      if (vinyl > 0 && Math.abs(d - 1.2) < 1.6) { dummy.position.y += vinyl * 0.6; dummy.rotation.x = vinyl * -1.1; dummy.rotation.y += (f - F.vinyl) * 0.35; }
      if (pk > 0 && d > -30 && d < 30) { const w = hash(i, 9), ph = f * 0.07 + w * 6;
        dummy.position.y = lerp(0.012, 0.6 + 1.6 * w, pk); dummy.rotation.x = -pk * (1.2 + 0.3 * Math.sin(ph));
        const p = posAt(S[f]); dummy.position.x = lerp(a.p.x, p.x + Math.sin(ph) * (2 + 3 * w), pk * 0.55); dummy.position.z = lerp(a.p.z, p.z + Math.cos(ph) * (2 + 3 * w), pk * 0.55); }
      dummy.updateMatrix(); arrows.setMatrixAt(i, dummy.matrix); }
    arrows.instanceMatrix.needsUpdate = true;
    arrowMat.emissiveIntensity = 0.3 + 0.9 * env('kick', f) * (/Chorus/.test(secAt(f).name) ? 1 : 0.35);
  }

  // ---------------------------------------------------------------- sprite animator (Master_Sprite_Atlas.png + normal map)
  class TextureAnimator {
    constructor(worldH, name) {
      this.map = atlasTex.clone(); this.nmap = normalTex.clone(); this.map.needsUpdate = this.nmap.needsUpdate = true;
      this.mat = new THREE.MeshStandardMaterial({ map: this.map, normalMap: this.nmap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
      this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.map, alphaTest: 0.5, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, 0.5, 0);
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.castShadow = true; this.mesh.customDepthMaterial = this.depth;
      this.root = new THREE.Group(); this.root.add(this.mesh); this.worldH = worldH; this.name = name;
    }
    set(anim, idx, mirror) {
      const a = AM.animations[anim], fr = a.frames[((idx % a.frames.length) + a.frames.length) % a.frames.length];
      const [x, y, w, h] = fr.rect, s = (a.world_height_m || this.worldH) / AM.cell_h;
      for (const t of [this.map, this.nmap]) { t.repeat.set((mirror ? -w : w) / AM.atlas_w, h / AM.atlas_h); t.offset.set((mirror ? x + w : x) / AM.atlas_w, 1 - (y + h) / AM.atlas_h); }
      this.mat.normalScale.set(mirror ? -1 : 1, 1);
      const px = mirror ? w - fr.pivot[0] : fr.pivot[0];
      this.mesh.scale.set(w * s, h * s, 1); this.mesh.position.set(-px * s, -(h - fr.pivot[1]) * s, 0);
      this.cur = `${anim}[${idx % a.frames.length}]${mirror ? 'M' : ''}`;
    }
  }
  const wolf = new TextureAnimator(1.95, 'wolf'); scene.add(wolf.root);
  const mino = new TextureAnimator(1.7, 'mino'); scene.add(mino.root);

  // ---------------------------------------------------------------- FACE TRACKS: lip-sync from word timings x vocal energy, blinks, ear flicks
  const MOUTH = new Float32Array(N), BLINK = new Float32Array(N).fill(1);
  { const tgt = new Float32Array(N);
    for (const w of A.words) { const f0 = Math.floor(w.start_s * FPS), f1 = Math.max(f0 + 1, Math.ceil(w.end_s * FPS)); const syl = Math.max(1, (String(w.w).toLowerCase().match(/[aeiouy]+/g) || []).length);
      for (let f = f0; f < f1 && f < N; f++) { const u = (f - f0) / (f1 - f0); tgt[f] = Math.max(tgt[f], (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * syl * u))) * (0.55 + 0.45 * ENV.rms[f])); } }
    let m = 0; for (let f = 0; f < N; f++) { m = tgt[f] > m ? lerp(m, tgt[f], 0.7) : m * 0.55; MOUTH[f] = m; }
    if (Q.get('mouth') === '1') MOUTH.fill(1); if (Q.get('mouth') === '0') MOUTH.fill(0);
    let next = 40; for (let f = 0; f < N; f++) { if (f >= next) { const seq = [0.55, 0.12, 0.08, 0.35, 0.75]; for (let k = 0; k < seq.length && f + k < N; k++) BLINK[f + k] = seq[k];
      next = f + 75 + Math.floor(hash(f, 41) * 90); } } }
  // ---------------------------------------------------------------- SKELETAL CUTOUT RIG: 2D drawing, bone-driven walk (SkinnedMesh x3)
  // body = push frame with legs erased; legs = one fully drawn leg (from walk_side[0]) used twice, near and far
  function buildSkin(rig, mat, zOff) {
    const an = AM.animations[rig.anim], fr = an.frames[rig.frame], [ax, ay] = fr.rect, [pvx, pvy] = rig.pivot;
    const nV = rig.vertices.length, pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4);
    rig.vertices.forEach(([x, y], i) => { pos.set([x - pvx, pvy - y, zOff], i * 3); uv.set([(ax + x) / AM.atlas_w, 1 - (ay + y) / AM.atlas_h], i * 2); si.set(rig.skinIndex[i], i * 4); sw.set(rig.skinWeight[i], i * 4); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(rig.index); g.computeVertexNormals();
    const B = {}, P = {}; rig.bones.forEach(([n, , x, y]) => { P[n] = [x, y]; });
    rig.bones.forEach(([n, par, x, y]) => { const b = new THREE.Bone(); b.name = n; const [px, py] = par ? P[par] : [pvx, pvy]; b.position.set(x - px, -(y - py), 0); B[n] = b; if (par) B[par].add(b); });
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasTex, alphaTest: 0.5, side: THREE.DoubleSide });
    const rootBone = B[rig.bones[0][0]]; mesh.add(rootBone); mesh.bind(new THREE.Skeleton(rig.bones.map(b => B[b[0]])));
    const rest = {}; for (const n in B) rest[n] = B[n].position.clone();
    return { mesh, B, rest, P };
  }
  class CutoutPush {
    constructor(bodyRig, legRig) {
      const mk = c => new THREE.MeshStandardMaterial({ map: atlasTex, normalMap: normalTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, color: c });
      this.mats = [mk(0xffffff), mk(0xffffff), mk(0x8a8a90)];
      this.body = buildSkin(bodyRig, this.mats[0], 0);
      this.legs = { near: buildSkin(legRig, this.mats[1], -1.5), far: buildSkin(legRig, this.mats[2], -3.0) };
      const at = bodyRig.leg_attach, hipY = bodyRig.bones.find(b => b[0] === 'legs')[3], hipX = bodyRig.bones.find(b => b[0] === 'legs')[2];
      for (const k of ['near', 'far']) { const L = this.legs[k]; this.body.B.legs.add(L.mesh); L.mesh.position.set(at[k][0] - hipX, 0, 0); L.mesh.scale.setScalar(legRig.scale_to_push || 1); }
      const J = legRig.joints; this.l1 = J.knee[1] - J.hip[1]; this.l2 = J.ankle[1] - J.knee[1]; this.soleD = J.sole - J.ankle[1];
      this.hipY0 = hipY; this.groundY = bodyRig.pivot[1];
      this.s = (AM.animations[bodyRig.anim].world_height_m || 1.95) / AM.cell_h;
      this.root = new THREE.Group(); this.root.add(this.body.mesh); this.body.mesh.scale.setScalar(this.s); this.root.visible = false;
      // mouth interior: sits behind the drawing, revealed when the jaw drops
      if (bodyRig.mouth && this.body.B.head) { const hd = bodyRig.bones.find(b => b[0] === 'head'), sh = new THREE.Shape();
        bodyRig.mouth.forEach(([x, y], i) => i ? sh.lineTo(x - hd[2], -(y - hd[3])) : sh.moveTo(x - hd[2], -(y - hd[3])));
        const mm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x2a0b0d, side: THREE.DoubleSide })); mm.position.z = -0.6; this.body.B.head.add(mm);
        const tongue = new THREE.Mesh(new THREE.CircleGeometry(7, 12), new THREE.MeshBasicMaterial({ color: 0x8a2f35 })); tongue.scale.set(1.6, 0.55, 1); tongue.position.set(372 - hd[2], -(127 - hd[3]), -0.5); this.body.B.head.add(tongue); }
    }
    // phase 0..1 per two-step cycle; amp 0..1 scales the stride with actual speed
    pose(phase, amp, f) {
      const d2r = Math.PI / 180, ph = phase * Math.PI * 2, bd = this.body, B = bd.B;
      for (const n in B) { B[n].rotation.set(0, 0, 0); B[n].position.copy(bd.rest[n]); }
      const th0 = -7 * d2r * amp - 3 * d2r, A = 27 * d2r * amp, K = 0.8 * amp;
      let depth = 0;
      for (const [k, o] of [['near', 0], ['far', Math.PI]]) {
        const L = this.legs[k], LB = L.B; for (const n in LB) { LB[n].rotation.set(0, 0, 0); LB[n].position.copy(L.rest[n]); }
        // swing = the half-cycle where the thigh moves forward (sin q < 0). Knee flex peaks early in the swing (lift),
        // then extends to reach for the next contact; stance keeps a slight bend.
        const q = ph + o, th = th0 + A * Math.cos(q), sw = Math.max(0, -Math.sin(q)), early = Math.max(0, Math.cos(q)) > 0 ? 1 : 0.55;
        const flex = K * Math.pow(sw, 1.4) * early + 0.06 * amp;
        // heel peel just before the swing: trailing foot rolls onto its toe
        const peel = 0.35 * amp * Math.max(0, Math.sin(q - Math.PI * 0.5)) * (Math.cos(q) < 0 ? 1 : 0);
        LB.hip.rotation.z = th; LB.knee.rotation.z = -flex; LB.ankle.rotation.z = flex - th + peel;
        depth = Math.max(depth, this.l1 * Math.cos(th) + this.l2 * Math.cos(th - flex) + this.soleD * Math.cos(peel) - 4 * Math.sin(peel));
      }
      // ground solve: the lowest sole touches the floor; the leg attach point rides up and down, the body follows at 55%
      const attachY = this.groundY - depth * (this.legs.near.mesh.scale.x);
      const rel = attachY - this.hipY0;
      B.legs.position.y = bd.rest.legs.y - rel * 0.45;
      B.hip.position.y = bd.rest.hip.y - rel * 0.55;
      B.trolley.position.y = bd.rest.trolley.y + (f % 4 < 2 ? 0.4 : 0) * env('hats', f);
      B.spine.rotation.z = -0.03 * amp * Math.cos(ph * 2); B.head.rotation.z = 0.04 * amp * Math.sin(ph * 2 + 0.6);
      B.coat.rotation.z = 0.035 * amp * Math.sin(ph * 2 - 0.4);
      B.tail0.rotation.z = 0.10 * Math.sin(ph * 2 - 0.5) * (0.4 + amp); B.tail1.rotation.z = 0.16 * Math.sin(ph * 2 - 1.1) * (0.4 + amp); B.tail2.rotation.z = 0.22 * Math.sin(ph * 2 - 1.7) * (0.4 + amp);
      // face: jaw on the vocal, blink, ears flick on hats and perk on kicks
      if (B.jaw) { B.jaw.rotation.z = -0.5 * MOUTH[f]; B.head.rotation.z += 0.04 * MOUTH[f]; }
      if (B.eye) B.eye.scale.y = BLINK[f];
      if (B.earF) { const hat = env('hats', f), kk = env('kick', f); B.earF.rotation.z = -0.12 * hat + 0.06 * kk; B.earB.rotation.z = -0.08 * env('hats', Math.max(0, f - 2)) + 0.05 * kk; }
      this.root.updateMatrixWorld(true);
    }
    set mirror(m) { this.root.scale.set(m ? -1 : 1, 1, 1); this.mats.forEach(x => x.normalScale.set(m ? -1 : 1, 1)); }
  }
  const pushRig = AM.rigs && AM.rigs.push_body && AM.rigs.leg ? new CutoutPush(AM.rigs.push_body, AM.rigs.leg) : null;
  if (pushRig) scene.add(pushRig.root);
  // contact blob under feet (keeps him grounded in map / top shots where the cast shadow is thin)
  const blobTex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); scene.add(blob);
  // you-are-here ring (map grammar)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x19f0ff, transparent: true, depthWrite: false })); scene.add(ring);
  const mRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false })); scene.add(mRing);

  // trolley (3D, chrome wire) with the DAEDALUS flat-pack box
  const trolley = new THREE.Group(); scene.add(trolley);
  { const chrome = mat.steel, add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chrome); m.position.set(x, y, z); m.castShadow = true; trolley.add(m); };
    for (const x of [-0.27, 0.27]) for (const z of [-0.4, 0.4]) { add(0.03, 0.55, 0.03, x, 0.42, z); const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateZ(Math.PI / 2), mat.black); wh.name = 'wheel'; wh.position.set(x, 0.06, z); trolley.add(wh);
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.012), mat.steel); hub.position.copy(wh.position); hub.name = 'wheel'; trolley.add(hub); }
    for (const y of [0.45, 0.95]) { add(0.58, 0.02, 0.02, 0, y, -0.42); add(0.58, 0.02, 0.02, 0, y, 0.42); add(0.02, 0.02, 0.86, -0.29, y, 0); add(0.02, 0.02, 0.86, 0.29, y, 0); }
    for (let k = -3; k <= 3; k++) { add(0.01, 0.5, 0.01, k * 0.09, 0.7, 0.42); add(0.01, 0.5, 0.01, k * 0.09, 0.7, -0.42); }
    for (let k = -4; k <= 4; k++) { add(0.01, 0.5, 0.01, -0.29, 0.7, k * 0.1); add(0.01, 0.5, 0.01, 0.29, 0.7, k * 0.1); }
    add(0.6, 0.03, 0.03, 0, 1.05, -0.52); const hm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8262e, roughness: 0.5 })); hm.position.set(0, 1.07, -0.52); trolley.add(hm); }
  const boxTex = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#c4a77d'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d3f8f'; c.fillRect(0, 0, w, 54);
    c.fillStyle = '#ffd400'; c.font = 'bold 40px DejaVu Sans'; c.textAlign = 'center'; c.fillText('DAEDALUS', w / 2, 42); c.fillStyle = '#3a2c1c'; c.font = '26px DejaVu Sans';
    c.fillText('SHELF  1 of 2', w / 2, 120); c.strokeStyle = '#3a2c1c'; c.lineWidth = 4; c.strokeRect(150, 150, 212, 80); c.beginPath(); c.moveTo(256, 150); c.lineTo(256, 230); c.stroke(); });
  const flatBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.8), [mat.oak, mat.oak, new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.8 }), mat.oak, mat.oak, mat.oak]);
  flatBox.name = 'flatbox'; flatBox.position.set(0, 0.55, 0.02); flatBox.rotation.x = -0.25; flatBox.castShadow = true; trolley.add(flatBox);

  // amber thread (his own route): tube rebuilt from the route between eraseFront and his position
  const threadMat = new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff8c00, emissiveIntensity: 1.6, roughness: 0.4 });
  const thread = new THREE.Mesh(new THREE.BufferGeometry(), threadMat); thread.castShadow = false; scene.add(thread);
  const threadTail = new THREE.Mesh(new THREE.BufferGeometry(), threadMat); scene.add(threadTail);
  let threadKey = '';
  function updateThread(f) {
    if (f < F.tie || f >= F.ext + 30) { thread.visible = threadTail.visible = false; return; }
    const sTie = S[F.tie], sNow = S[f];
    const front = f < F.erase0 ? sTie : f < F.erase1 ? Math.max(sTie, SM[f] - 0.3) : Math.max(sTie, SM[F.erase1 - 1] - 0.3);
    const key = `${front.toFixed(1)}_${sNow.toFixed(1)}`; if (key === threadKey) return; threadKey = key;
    const a = Math.max(front, sTie), b = sNow - 0.25;
    thread.visible = b - a > 0.3;
    if (thread.visible) { const n = Math.max(4, Math.ceil((b - a) / 0.6)), P = [];
      for (let k = 0; k <= n; k++) { const s = lerp(a, b, k / n), p = posAt(s), h = headAt(s); P.push(p.add(V3(-h.z, 0, h.x).multiplyScalar(0.55)).setY(0.06 + 0.015 * Math.sin(s * 3.1))); }
      thread.geometry.dispose(); thread.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), Math.min(1600, n * 2), 0.022, 6, false); }
    // last metre rises to his hand (cuff)
    const p0 = posAt(sNow - 0.25), h0 = HEAD[f]; const hand = posAt(sNow).add(V3(-h0.z, 0, h0.x).multiplyScalar(0.28)).setY(0.95);
    threadTail.geometry.dispose(); threadTail.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0.add(V3(-h0.z, 0, h0.x).multiplyScalar(0.55)).setY(0.06), hand]), 8, 0.02, 6, false);
    threadTail.visible = true;
  }
  // flying four-poster (map check-in 2): a separate bed lifts out of its room and drifts across the map
  const fourPoster = new THREE.Group(); scene.add(fourPoster);
  { const b = (m, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[m]); o.position.set(x, y + h / 2, z); o.castShadow = true; fourPoster.add(o); };
    b('oak', 1.8, 0.35, 2.2, 0, 0, 0); b('linen', 1.7, 0.25, 2.05, 0, 0.35, 0); b('fabricRed', 1.72, 0.06, 1.2, 0, 0.6, 0.4);
    for (const x of [-0.85, 0.85]) for (const z of [-1.05, 1.05]) b('oak', 0.09, 2.2, 0.09, x, 0, z); b('fabricRed', 1.9, 0.08, 2.3, 0, 2.2, 0); }
  const fpCell = MZ.pathCells[Math.min(MZ.pathCells.length - 1, 18)];
  // exit door glow + car park
  const [exX, exZ] = cellXZ(MZ.exit);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(CS * 0.4, 2.6), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85 }));
  doorGlow.position.set(exX, 1.3, -MAZE_D / 2 - 0.05); scene.add(doorGlow);
  // ---------------------------------------------------------------- CAR PARK (v9e): PBR asphalt, modelled cars, bays, lamps, shelter, moving extras
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
  // flat-pack bag he carries outside
  const bag = new THREE.Group(); scene.add(bag);
  { const bm = new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.6, side: THREE.DoubleSide }), bw = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm); m.position.set(x, y, z); m.castShadow = true; bag.add(m); };
    bw(0.62, 0.02, 0.26, 0, -0.27, 0); bw(0.62, 0.55, 0.02, 0, 0, 0.13); bw(0.62, 0.55, 0.02, 0, 0, -0.13); bw(0.02, 0.55, 0.26, 0.31, 0, 0); bw(0.02, 0.55, 0.26, -0.31, 0, 0);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffd400 })); hd.position.set(0, 0.28, 0); bag.add(hd); }
  // half shelf reveal prop (inside the bag, final FPV)
  const halfShelf = new THREE.Group(); scene.add(halfShelf);
  { const raw = new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.95 }); for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.2), mat.birch); s.position.set(0.2, 0.1 + k * 0.22, 0); halfShelf.add(s);
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.2), raw); cut.position.set(0.402, 0.1 + k * 0.22, 0); halfShelf.add(cut); }
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.62, 0.2), mat.birch); up.position.set(0, 0.31, 0); halfShelf.add(up); }
  const sky = new THREE.Color(0x0b0f14), skyExt = new THREE.Color(0x9fb0c0);

  // ---------------------------------------------------------------- post
  const composer = new X.EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H);
  const rp = new X.RenderPass(scene, camera); composer.addPass(rp);
  const gtao = new X.GTAOPass(scene, camera, W, H); gtao.blendIntensity = 1.0;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: CPU ? 10 : 16 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  composer.addPass(gtao);
  const bloom = new X.UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.45, 0.92); composer.addPass(bloom);
  const finalPass = new X.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uFrame: { value: 0 }, uGrain: { value: 0.05 }, uCA: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 },
      uCyan: { value: 0.33 }, uAmber: { value: 0.66 }, uCold: { value: 0 }, uVig: { value: 0.35 }, uRes: { value: new THREE.Vector2(W, H) }, uGlitch: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uFrame,uGrain,uCA,uFade,uFlash,uCyan,uAmber,uCold,uVig,uGlitch; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uFrame*0.6131) * 43758.5453); }
      void main(){ vec2 uv = vUv; vec2 d = (uv - 0.5);
        if (uGlitch > 0.0) { float band = step(0.82, h(vec2(floor(uv.y*48.0), 1.0))); uv.x += band * uGlitch * (h(vec2(floor(uv.y*48.0), 2.0)) - 0.5) * 0.08; }
        float ca = uCA * 0.004; vec3 c = vec3(texture2D(tDiffuse, uv + d*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d*ca).b);
        float l = dot(c, vec3(0.299,0.587,0.114));
        vec3 shadowT = mix(vec3(1.0), vec3(0.80,1.04,1.10), uCyan); vec3 hiT = mix(vec3(1.0), vec3(1.10,1.0,0.82), uAmber);
        c *= mix(shadowT, hiT, smoothstep(0.15, 0.75, l));
        c = mix(c, vec3(l)*vec3(0.92,0.98,1.06), uCold*0.45);
        c *= 1.0 - uVig * dot(d,d) * 1.6;
        c += (h(uv*uRes) - 0.5) * uGrain;
        c = mix(c, vec3(1.0), uFlash);
        gl_FragColor = vec4(c * uFade, 1.0); }`
  });
  const mblur = new X.ShaderPass({ uniforms: { tDiffuse: { value: null }, uVel: { value: new THREE.Vector2() }, uRad: { value: 0 } },
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
    mblur.uniforms.uVel.value.copy(vel.clampLength(0, 0.035)); mblur.uniforms.uRad.value = clamp(rad, -0.04, 0.04); mblur.enabled = true; }

  const exitXZ = cellXZ(MZ.exit);
  // ---------------------------------------------------------------- PAC-MAN LAYER (top-down / map grammar)
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
  const pacMan = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: pacTexs[0], transparent: true, toneMapped: false, depthWrite: false })); pacMan.position.y = 0.3; pac.add(pacMan);
  const ghostTex = (col, horns) => canvasTex(256, 256, (c) => { c.fillStyle = col; c.beginPath(); c.moveTo(28, 230); c.lineTo(28, 120); c.arc(128, 120, 100, Math.PI, 0); c.lineTo(228, 230);
      for (let k = 0; k < 4; k++) { c.lineTo(228 - k * 50 - 25, 200); c.lineTo(228 - (k + 1) * 50, 230); } c.closePath(); c.fill();
      if (horns) { c.fillStyle = '#cfd6de'; c.beginPath(); c.moveTo(48, 70); c.quadraticCurveTo(10, 30, 24, 0); c.quadraticCurveTo(50, 40, 74, 44); c.fill(); c.beginPath(); c.moveTo(208, 70); c.quadraticCurveTo(246, 30, 232, 0); c.quadraticCurveTo(206, 40, 182, 44); c.fill();
        c.strokeStyle = '#d4a017'; c.lineWidth = 10; c.beginPath(); c.arc(128, 168, 22, 0.2, Math.PI - 0.2); c.stroke(); }
      c.fillStyle = '#fff'; for (const ex of [88, 168]) { c.beginPath(); c.ellipse(ex, 110, 26, 32, 0, 0, 7); c.fill(); } });
  const GH = [{ col: '#ff2a1a', horns: true, name: 'MINO' }, { col: '#ffb8ff', name: 'PINKY' }, { col: '#00ffff', name: 'INKY' }, { col: '#ffb852', name: 'CLYDE' }].map((g, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 5.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ghostTex(g.col, g.horns), transparent: true, toneMapped: false, depthWrite: false }));
    m.position.y = 0.35; const pup = [0, 1].map(() => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2121ff, toneMapped: false })); p.position.y = 0.4; pac.add(p); return p; });
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
      g.pup.forEach((q, k) => q.position.set(p.x + (k ? 0.78 : -0.78) + d.x * 0.3, 0.42, p.z - 0.35 + d.z * 0.38)); });
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

  // ---------------------------------------------------------------- camera director
  const MODE = f => (telAt(f).camera_mode || 'CHASE');
  const pose = (pos, look, fov, near = 0.1) => ({ pos, look, fov, near });
  const ctr = V3(0, 0, 0);
  const mapH = fov => (Math.max(MAZE_W / ASPECT, MAZE_D) * 0.5 * 1.12) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  function modePose(mode, f) {
    const P = posAt(S[f]), h = HEAD[f], rt = V3(-h.z, 0, h.x), st = telAt(f).sprite_state, tel = telAt(f);
    const t0 = evStart(f), t1 = evEnd(f), k = clamp((f - t0) / Math.max(1, t1 - t0), 0, 1), bp = beatPos[f];
    const fovT = tel.camera_fov || 50;
    const at = (p, ...v) => { const o = p.clone(); for (const [vec, sc] of v) o.addScaledVector(vec, sc); return o; };
    const UP = V3(0, 1, 0);
    switch (mode) {
      case 'MAP': { const fv = 32; return pose(V3(0, mapH(fv), 0.001), ctr.clone(), fv, 5); }
      case 'MAP_ORBIT': { const a = (f - t0) / FPS * 0.22; return pose(V3(Math.cos(a) * MAZE_W * 0.55, MAZE_W * 0.42, Math.sin(a) * MAZE_D * 0.7), V3(0, 0, 0), 42, 1); }
      case 'SCAN': { const a = modePose('MAP', f), b = modePose('LOCK', f), mid = pose(at(P, [UP, 14], [h, -0.01]), P.clone(), 44, 2);
        if (k < 0.62) { const e = smoother(k / 0.62); return pose(a.pos.clone().lerp(mid.pos, e), a.look.clone().lerp(mid.look, e), lerp(a.fov, mid.fov, e), lerp(5, 2, e)); }
        const e = smoother((k - 0.62) / 0.38); return pose(mid.pos.clone().lerp(b.pos, e), mid.look.clone().lerp(b.look, e), lerp(mid.fov, b.fov, e), lerp(2, 0.1, e)); }
      case 'LOCK': return pose(at(P, [h, 2.8], [rt, -2.0], [UP, 1.75]), at(P, [UP, 1.25]), 40);
      case 'CHASE': { const sw = Math.sin(bp * Math.PI) * 0.06; return pose(at(P, [h, -5.2], [rt, 2.6 + sw], [UP, 2.55]), at(P, [h, 1.6], [UP, 1.05]), 50, 2.4); }
      case 'CHASE_FAST': { const kick = env('kick', f), sh = (hash(f, 1) - 0.5) * 0.12 * kick; return pose(at(P, [h, -3.6], [rt, 1.5 + sh], [UP, 1.65 + sh]), at(P, [h, 3.0], [UP, 1.15]), 64, 1.2); }
      case 'CHASE_LOW': return pose(at(P, [h, -2.6], [rt, 1.1], [UP, 0.32]), at(P, [h, 0.6], [UP, 1.35]), 56, 0.6);
      case 'SCROLL': return pose(at(P, [rt, 7.0], [h, 0.6], [UP, 1.35]), at(P, [h, 0.6], [UP, 1.15]), 34, 5.2);
      case 'TOP_TIGHT': return pose(at(P, [UP, 8.5], [h, -0.01]), at(P, [h, 0.4]), 46, 2);
      case 'CLOSE': { const Mp = posAt(SM[f]), d = P.clone().sub(Mp).setY(0).normalize(); return pose(at(Mp, [d, 1.6], [UP, 1.35]), at(Mp, [UP, 1.3]), 38, 0.1); }
      case 'EXT': { const ez = smoother((f - F.ext - 15) / 105); const near = pose(at(P, [h, -7], [rt, 4], [UP, 2.6]), at(P, [UP, 1.0]), 48, 0.2);
        const far = pose(at(P, [h, 18], [UP, 95]), V3(0, 0, -MAZE_D * 0.05), 46, 5);
        return pose(near.pos.lerp(far.pos, ez), near.look.lerp(far.look, ez), lerp(48, 46, ez), lerp(0.2, 5, ez)); }
      case 'BLACK': return pose(at(P, [UP, 2]), P.clone(), 50);
      case 'FPV': default: {
        let yaw = 0, pitch = -0.1 + Math.sin(bp * Math.PI * 2) * 0.012;
        if (st === 'look_down') pitch = -lerp(0.2, 1.0, smooth(k * 4));
        if (st === 'look_left') yaw = lerp(0, 1.15, smooth(k * 3));
        if (st === 'look_right') yaw = -lerp(0, 1.15, smooth(k * 3));
        if (st === 'turn_left') yaw = lerp(-0.6, 0.6, smoother(k));
        if (st === 'turn_right') yaw = lerp(0.6, -0.6, smoother(k));
        if (st === 'idle' && /ceiling/.test(tel.special_events)) pitch = lerp(0, 1.0, smooth(k * 3));
        const dir = h.clone().applyAxisAngle(UP, yaw); dir.y = Math.sin(pitch); dir.normalize();
        const eye = at(P, [UP, 1.72 + Math.abs(Math.sin(bp * Math.PI)) * 0.035], [h, 0.25]);
        return pose(eye, eye.clone().add(dir), 72, 0.05);
      }
    }
  }
  const HARD = new Set(['FPV', 'BLACK', 'CLOSE']);
  function cameraAt(f) {
    const tel = telAt(f), m = MODE(f), t0 = evStart(f), i = telIdx[f];
    const cur = modePose(m, f);
    if (i === 0) return { ...cur, mode: m };
    const pm = TEL[i - 1].camera_mode || 'CHASE';
    const seamless = /SEAMLESS/.test(tel.special_events);
    if (pm === m || HARD.has(m) || HARD.has(pm)) return { ...cur, mode: m };
    const dur = seamless ? 50 : m === 'SCAN' ? 1 : 14;
    const e = smoother((f - t0) / dur); if (e >= 1) return { ...cur, mode: m };
    const prv = modePose(pm, f);
    return { pos: prv.pos.lerp(cur.pos, e), look: prv.look.lerp(cur.look, e), fov: lerp(prv.fov, cur.fov, e), near: lerp(prv.near, cur.near, e), mode: m };
  }

  // ---------------------------------------------------------------- character state -> atlas frame
  function wolfFrame(f, camPos) {
    const st = telAt(f).sprite_state, bp = beatPos[f], P = posAt(S[f]), h = HEAD[f];
    const toCam = camPos.clone().sub(P).setY(0); const rel = Math.atan2(h.x * toCam.z - h.z * toCam.x, h.x * toCam.x + h.z * toCam.z);
    const a = Math.abs(rel);
    // screen-space facing for side views
    const p1 = P.clone().setY(1).project(camera), p2 = P.clone().add(h).setY(1).project(camera); const faceRight = p2.x >= p1.x;
    const moving = S[Math.min(N - 1, f + 1)] - S[f] > 0.002 || SPEED[st] > 0;
    const walkIdx = Math.floor((((bp / 4) % 1 + 1) % 1) * 6);
    const runIdx = Math.floor(((bp * 2) % 2 + 2) % 2);
    const view = a < 0.85 ? 'front' : a > 2.3 ? 'back' : 'side';
    const trolleyOn = f < doorFrame && f >= 0;
    switch (st) {
      case 'freeze': return ['actions2', 5, false, view, false];
      case 'step_back': return ['actions2b', 3, !faceRight, view, false];
      case 'look_down': return ['actions2', 2, !faceRight, view, trolleyOn && view !== 'side'];
      case 'look_left': return ['actions2', 3, false, view, trolleyOn && view !== 'side'];
      case 'look_right': return ['actions2', 3, true, view, trolleyOn && view !== 'side'];
      case 'tie_thread': return ['actions2', 4, !faceRight, view, false];
      case 'idle': case 'idle_trolley': return view === 'back' ? ['walk_back', 0, false, view, trolleyOn] : view === 'front' ? ['walk_front', 0, false, view, trolleyOn] : ['actions2', 0, !faceRight, view, false];
    }
    const run = st === 'run' || st === 'slowmo';
    if (view === 'front') return ['walk_front', walkIdx, false, view, trolleyOn];
    if (view === 'back') return ['walk_back', walkIdx, false, view, trolleyOn];
    if (run) return runIdx ? ['actions2b', 1, faceRight, view, false] : ['actions2', 1, !faceRight, view, false];
    if (trolleyOn && moving) return ['actions2', 0, !faceRight, view, false];
    return ['walk_side', walkIdx, !faceRight, view, false];
  }
  function minoFrame(f, camPos) {
    const Mp = posAt(SM[f]), h = headAt(SM[f]); const toCam = camPos.clone().sub(Mp).setY(0);
    const rel = Math.atan2(h.x * toCam.z - h.z * toCam.x, h.x * toCam.x + h.z * toCam.z), a = Math.abs(rel);
    const p1 = Mp.clone().setY(1).project(camera), p2 = Mp.clone().add(h).setY(1).project(camera);
    if (a < 0.6) return [0, false]; if (a < 1.2) return [1, p2.x < p1.x]; if (a < 2.4) return [2, p2.x < p1.x]; return [3, false];
  }

  // ---------------------------------------------------------------- HUD (DOM): objective, distance, clock, inventory, minimap
  const mini = document.createElement('canvas'); mini.width = 300; mini.height = Math.round(300 * MAZE_D / MAZE_W); $('mini').appendChild(mini);
  const mc = mini.getContext('2d');
  const mmBase = document.createElement('canvas'); mmBase.width = mini.width; mmBase.height = mini.height;
  { const c = mmBase.getContext('2d'), sx = mini.width / MAZE_W; c.fillStyle = 'rgba(4,14,20,0.72)'; c.fillRect(0, 0, mini.width, mini.height);
    c.strokeStyle = '#9fe9f2'; c.lineWidth = 1.6; c.lineCap = 'square';
    const L = (x0, z0, x1, z1) => { c.beginPath(); c.moveTo((x0 + MAZE_W / 2) * sx, (z0 + MAZE_D / 2) * sx); c.lineTo((x1 + MAZE_W / 2) * sx, (z1 + MAZE_D / 2) * sx); c.stroke(); };
    for (let k = 0; k < C * R; k++) { const [x, z] = cellXZ(k), o = MZ.open[k], hc = CS / 2; if (!o[0]) L(x + hc, z - hc, x + hc, z + hc); if (!o[1]) L(x - hc, z - hc, x - hc, z + hc);
      if (!o[2]) L(x - hc, z + hc, x + hc, z + hc); if (!o[3] && k !== MZ.exit) L(x - hc, z - hc, x + hc, z - hc); } }
  const toMini = p => [(p.x + MAZE_W / 2) * mini.width / MAZE_W, (p.z + MAZE_D / 2) * mini.width / MAZE_W];
  function drawMini(f) {
    mc.clearRect(0, 0, mini.width, mini.height); mc.drawImage(mmBase, 0, 0);
    // remaining imposed route (yellow dashes)
    mc.setLineDash([3, 4]); mc.strokeStyle = '#ffd400'; mc.lineWidth = 1.5; mc.beginPath();
    for (let s = S[f]; s < LDOOR; s += 2) { const [x, y] = toMini(posAt(s)); s === S[f] ? mc.moveTo(x, y) : mc.lineTo(x, y); } mc.stroke(); mc.setLineDash([]);
    if (f >= F.tie) { const sTie = S[F.tie], front = f < F.erase0 ? sTie : f < F.erase1 ? Math.max(sTie, SM[f]) : Math.max(sTie, SM[F.erase1 - 1]);
      mc.strokeStyle = '#ffa31a'; mc.lineWidth = 2.2; mc.beginPath(); for (let s = front; s <= S[f]; s += 1.5) { const [x, y] = toMini(posAt(s)); s === front ? mc.moveTo(x, y) : mc.lineTo(x, y); } mc.stroke(); }
    if (minoOn(f)) { const [x, y] = toMini(posAt(SM[f])); mc.fillStyle = '#ff2a1a'; mc.beginPath(); mc.arc(x, y, 4 + 2 * env('kick', f), 0, 7); mc.fill(); }
    const [x, y] = toMini(posAt(S[f])); mc.fillStyle = '#19f0ff'; mc.beginPath(); mc.arc(x, y, 4.5, 0, 7); mc.fill();
    mc.strokeStyle = 'rgba(25,240,255,0.5)'; mc.beginPath(); mc.arc(x, y, 7 + 4 * ((f % 30) / 30), 0, 7); mc.stroke();
  }
  let objective = 'BUY 1 SHELF';
  const OBJ = TEL.filter(t => /objective=/.test(t.special_events)).map(t => ({ f: t.frame, o: /objective=([A-Z0-9 ]+?)(?:\s+held|,|;|$)/.exec(t.special_events)[1].trim() }));
  const CHECKINS = TEL.filter(t => /MAP CHECKIN \d/.test(t.special_events)).map(t => ({ f: t.frame, n: +/MAP CHECKIN (\d)/.exec(t.special_events)[1] }));
  function updateHUD(f, mode, pacOn) {
    const off = f >= F.hudOff || mode === 'BLACK' || f < evStart(Math.min(N - 1, findEv(/lock_on/i)?.frame ?? 326));
    $('hud').style.display = off || pacOn ? 'none' : 'block'; $('mini').style.display = off || pacOn || mode === 'MAP' || mode === 'MAP_ORBIT' ? 'none' : 'block';
    if (off) return;
    for (const o of OBJ) if (f >= o.f) objective = o.o;
    const dist = Math.max(0, LDOOR - S[f]);
    const inv = [f >= F.pickBox ? 'DAEDALUS (1/2)' : null, f >= F.threadFound ? 'THREAD' : null].filter(Boolean);
    const badge = f >= F.badge ? '<div class="badge">PERMANENT ASSISTANT TO THE SHELVING</div>' : '';
    const fillE = smooth((f - 326) / 45);
    $('hud').innerHTML = `<div class="obj">OBJECTIVE <b>${htmlEsc(objective)}</b></div>` + (fillE > 0.5 ? `<div class="row">EXIT <b>${dist.toFixed(0)} m</b> &nbsp; TIME <b>9:45</b></div>` +
      `${badge}` : '');
    drawMini(f);
  }
  function updateMapCard(f, mode) {
    const ci = CHECKINS.filter(c => f >= c.f).pop();
    const show = (mode === 'MAP' || mode === 'MAP_ORBIT' || (mode === 'EXT' && f > F.ext + 75)) && ci && f - ci.f < 150;
    if (f >= F.halfShelf && f < F.black) { const e = smooth((f - F.halfShelf - 20) / 10); $('card').innerHTML = `<div style="opacity:${e.toFixed(3)}"><div class="v">OTHER HALF SOLD SEPARATELY</div></div>`; return; }
    if (!show) { $('card').innerHTML = ''; return; }
    const e = smooth((f - Math.max(ci.f, mode === 'EXT' ? F.ext + 75 : 0)) / 12);
    const dist = Math.max(0, LDOOR - S[f]);
    const lines = { 1: ['ROUTE OPTIMAL', `EXIT ${dist.toFixed(0)} m`], 2: ['ROOMS RELOCATED', 'YOU ARE HERE'], 3: ['UNREGISTERED CLEANING UNIT', `EXIT ${dist.toFixed(0)} m`],
      4: ['WINDOW DETECTED', 'VIEW: PRODUCT'], 5: ['STORE FOOTPRINT', 'MAZE: 1 of 1'] }[ci.n] || ['', ''];
    $('card').innerHTML = `<div style="opacity:${e.toFixed(3)}"><div class="k">MAP CHECK-IN ${ci.n}/5</div><div class="v">${lines[0]}</div><div class="s">${lines[1]}</div></div>`;
  }

  // ---------------------------------------------------------------- frame entry point
  let lastCam = null;
  async function renderFrame(f) {
    f = clamp(f | 0, 0, N - 1);
    const tel = telAt(f), sec = secAt(f);
    const cam = cameraAt(f); const mode = cam.mode;
    camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.near = cam.near; camera.aspect = ASPECT; camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const P = posAt(S[f]), h = HEAD[f], rt = V3(-h.z, 0, h.x);
    const outside = f >= doorFrame;
    // wolfgang
    const [anim, idx, mirror, view, trolleyVis] = wolfFrame(f, camera.position);
    wolf.set(anim, idx, mirror);
    const topDown = camera.position.y - P.y > 6 && Math.abs(cam.look.y - camera.position.y) / Math.max(0.01, camera.position.distanceTo(cam.look)) > 0.8;
    wolf.root.position.copy(P);
    if (topDown) { wolf.root.quaternion.copy(camera.quaternion); } else { const d = camera.position.clone().sub(P); wolf.root.rotation.set(0, Math.atan2(d.x, d.z), 0); }
    const bounce = anim.startsWith('walk') ? Math.abs(Math.sin(beatPos[f] * Math.PI / 2)) * 0.03 : 0;
    wolf.root.position.y = bounce;
    wolf.root.visible = mode !== 'FPV' && mode !== 'BLACK';
    const useRig = !!pushRig && anim === 'actions2' && idx === 0 && wolf.root.visible;
    if (pushRig) { pushRig.root.visible = useRig;
      if (useRig) { const st = telAt(f).sprite_state, sp = (S[Math.min(N - 1, f + 1)] - S[Math.max(0, f - 1)]) * FPS / 2;
        const amp = clamp(sp / 1.2, 0, 1);       // standing still holds the drawn pose
        pushRig.pose((((beatPos[f] / 4) % 1) + 1) % 1, amp, f);
        pushRig.root.position.copy(wolf.root.position).setY(0); pushRig.root.quaternion.copy(wolf.root.quaternion);
        pushRig.mirror = mirror;
        wolf.root.visible = false; } }
    blob.position.set(P.x, 0.02, P.z); blob.visible = wolf.root.visible;
    // trolley ahead of him
    trolley.visible = trolleyVis && wolf.root.visible && !outside;
    trolley.position.copy(P).addScaledVector(h, 0.95); trolley.rotation.set(0, Math.atan2(h.x, h.z), 0);
    flatBox.visible = f >= F.pickBox;
    // bag outside
    bag.visible = outside && wolf.root.visible; bag.position.copy(P).addScaledVector(rt, 0.4).setY(0.55); bag.rotation.set(0, Math.atan2(h.x, h.z), 0);
    // MINO
    const mOn = minoOn(f) && mode !== 'BLACK';
    mino.root.visible = mOn; mRing.visible = false; minoL.intensity = 0;
    if (mOn) { const Mp = posAt(SM[f]); const [mi, mm] = minoFrame(f, camera.position); mino.set('mino_turn', mi, mm);
      const rev = clamp((f - F.minoReveal + 45) / 45, 0, 1);
      mino.root.position.copy(Mp); mino.root.position.y = Math.sin(f * 0.9) * 0.01;
      if (topDown) mino.root.quaternion.copy(camera.quaternion); else { const d = camera.position.clone().sub(Mp); mino.root.rotation.set(0, Math.atan2(d.x, d.z), 0); }
      mino.mat.color.setScalar(lerp(0.05, 1, rev));
      minoL.position.copy(Mp).setY(1.4); minoL.intensity = 6 + 10 * env('kick', f); }
    // you-are-here ring in map grammar
    const mapView = mode === 'MAP' || mode === 'MAP_ORBIT' || (camera.position.y > 25);
    ring.visible = mapView; ring.position.set(P.x, 0.05, P.z); ring.scale.setScalar((mode === 'MAP' || mode === 'MAP_ORBIT' ? 3.2 : 1.6) + 0.6 * Math.sin(f * 0.21)); ring.material.opacity = 0.85;
    mRing.visible = mapView && mOn; if (mOn) { const Mp = posAt(SM[f]); mRing.position.set(Mp.x, 0.05, Mp.z); mRing.scale.setScalar(1.6 + 0.8 * env('kick', f)); }
    // thread, arrows
    updateThread(f); updateArrows(f);
    // PAC-MAN switch: any camera above 26 m sees the store as the arcade board it really is
    const pacAt = ff => cameraAt(clamp(ff, 0, N - 1)).pos.y > 26;
    const pacOn = camera.position.y > 26 && mode !== 'BLACK';
    const pacEdge = !pacOn ? 0 : [1, 2, 3].some(k => !pacAt(f - k)) ? 1 : 0;
    pac.visible = pacOn; world.visible = !pacOn; arrows.visible = !pacOn;
    if (pacOn) { updatePac(f); if (pushRig) pushRig.root.visible = false; wolf.root.visible = mino.root.visible = blob.visible = trolley.visible = bag.visible = false; ring.visible = mRing.visible = false; }
    // FPV weapon
    weapon.visible = mode === 'FPV' && f < doorFrame && !pacOn;
    if (weapon.visible) { const bp2 = beatPos[f]; const barUp = f >= 326 && f < F.hudOff && mode !== 'CLOSE' && mode !== 'EXT' ? 0.13 : 0.04; weapon.position.set(Math.sin(bp2 * Math.PI) * 0.018, barUp - Math.abs(Math.sin(bp2 * Math.PI)) * 0.022, 0); weapon.rotation.z = Math.sin(bp2 * Math.PI) * 0.015;
      weapon.userData.box.visible = f >= F.pickBox; }
    // four-poster flight (check-in 2)
    { const t = (f - F.fourPoster) / FPS; fourPoster.visible = t > -2 && t < 9; const [fx, fz] = cellXZ(fpCell);
      const e = smooth(t / 5); fourPoster.position.set(fx + e * CS * 2.5, Math.max(0, t) * 3.2 + Math.sin(t * 2) * 0.4, fz - e * CS * 1.5); fourPoster.rotation.set(Math.sin(t * 1.3) * 0.2, t * 0.4, Math.sin(t * 0.9) * 0.15); }
    // CHORUS SNAP: walls and furniture spring up out of the floor, one bar
    { const t = (f - F.snap) / FPS; const u = t - 0.2; const k = t < 0 || t > 1.6 ? 1 : t < 0.04 ? lerp(1, 0.03, t / 0.04) : t < 0.2 ? 0.03 : 1 - 0.97 * Math.exp(-4.2 * u) * Math.cos(9.5 * u);
      staticGroup.scale.y = Math.max(0.03, k); tagMesh.visible = clockMesh.visible = k > 0.85; }
    // lights
    sun.position.copy(P).add(V3(6, 14, 5)); sun.target.position.copy(P);
    keyL.position.copy(P).addScaledVector(rt, -1.2).addScaledVector(h, 1.4).setY(1.9);
    rimL.position.copy(P).addScaledVector(rt, 1.0).addScaledVector(h, -0.6).setY(1.8);
    const chorus = /Chorus/.test(sec.name);
    const kick = env('kick', f);
    panelMat.emissiveIntensity = (f < 170 ? smooth(f / 170) * (0.3 + kick) : 0.85 + (chorus ? 0.7 * kick : 0.2 * kick));
    if (f < 170) hemi.intensity = 0.12 + 0.23 * smooth(f / 170); else hemi.intensity = outside ? 1.4 : 0.35;
    // break 2: shelf uprights become Minoan columns, floor turns fresco (tint)
    const minoan = f >= F.minoan && f < F.finalChorus ? smooth((f - F.minoan) / 45) : 0;
    mat.birch.color.setHex(0xd9c19a).lerp(new THREE.Color(0xb3261e), minoan * 0.85);
    floor.material.color.setHex(0xffffff).lerp(new THREE.Color(0xe7c48e), minoan * 0.7);
    mat.wall.color.setHex(0xf4ede2).lerp(new THREE.Color(0xe8b98a), minoan * 0.6);
    // Icarus: lamps droop (glow sags and dims)
    mat.lampGlow.emissiveIntensity = f >= F.icarus && f < F.hudOff ? 0.7 * (1 - 0.6 * smooth((f - F.icarus) / 120)) : 0.7;
    // price tags flicker in 16ths on the knossos/measurements beat
    const tagFlick = f >= sec2f(109.9) && f < sec2f(113.9);
    tagMat.emissiveIntensity = tagFlick ? (Math.floor(beatPos[f] * 4) % 2 ? 1.6 : 0.1) : 0.25;
    doorGlow.material.opacity = f >= F.hudOff ? 0.6 + 0.4 * smooth((f - F.hudOff) / 60) : 0.25;
    park.visible = (outside || mapView || mode === 'EXT' || f >= F.hudOff) && !pacOn; doorGlow.visible = !pacOn; fourPoster.visible = fourPoster.visible;
    // wheels roll with distance travelled
    trolley.traverse(o => { if (o.name === 'wheel') o.rotation.x = -S[f] / 0.06; });
    if (park.visible) {
      const tr = (f - F.ext) / FPS; runaway.visible = tr > -1;
      const rx = exX + 16 - Math.max(0, tr) * 1.1, rz = PZ - 20 + Math.sin(Math.max(0, tr) * 0.35) * 1.5; runaway.position.set(rx, 0, rz);
      runaway.rotation.y = -Math.PI / 2 + 0.12 * Math.sin(Math.max(0, tr) * 0.35) + 0.04 * Math.sin(f * 0.6); runaway.traverse(o => { if (o.name === 'wheel') o.rotation.x = Math.max(0, tr) * 1.1 / 0.06; });
      if (reverser) { const tv = (f - F.ext - 30) / FPS, e = smoother(tv / 5), C = reverser.c; C.position.z = reverser.rz + reverser.face * 0.25 - reverser.face * e * 4.0;
        C.position.x = reverser.x + e * e * 1.2; C.rotation.y = (reverser.face > 0 ? -Math.PI / 2 : Math.PI / 2) + e * e * 0.35;
        C.traverse(o => { if (o.name === 'wheel') o.rotation.z = -e * 4.0 / 0.32; }); for (const k of ['rev-1', 'rev1']) if (C.userData[k]) C.userData[k].material.emissiveIntensity = tv > 0 && tv < 5.5 ? 2.2 : 0.6; } }
    updateParticles(f, P, pacOn, outside, mOn);
    const inBag = f >= F.halfShelf - 75 && f < F.black && mode === 'FPV' && outside;
    if (inBag) { const fw0 = V3(h.x, 0, h.z); camera.position.copy(P).setY(1.55).addScaledVector(fw0, 0.1); camera.lookAt(P.clone().addScaledVector(fw0, 0.62).setY(0.62)); camera.fov = 50; camera.near = 0.05; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
    halfShelf.visible = inBag; bag.visible = bag.visible || inBag;
    if (inBag) { const fw = V3(h.x, 0, h.z); bag.position.copy(P).addScaledVector(fw, 0.62).setY(0.55); bag.rotation.set(0.25, Math.atan2(h.x, h.z), 0);
      const lift = smooth((f - F.halfShelf) / 24); halfShelf.scale.setScalar(1); halfShelf.position.copy(P).addScaledVector(fw, 0.62).addScaledVector(V3(-h.z, 0, h.x), -0.2).setY(0.22 + 0.3 * lift); halfShelf.rotation.set(0, Math.atan2(h.x, h.z) + Math.PI / 2, 0); }
    scene.background = pacOn ? new THREE.Color(0) : outside || mode === 'EXT' ? skyTex : sky;
    sun.intensity = outside ? 2.4 : 0.9; if (outside) sun.position.copy(P).add(V3(-8, 16, 10));
    scene.fog = (pacOn || mode === 'MAP' || mode === 'MAP_ORBIT' || outside) ? null : (scene.fog || new THREE.Fog(0x2a2622, 20, 78));
    // fluorescent pools: the six panels nearest the camera focus; faulty tubes flicker
    { const focus = mode === 'FPV' ? camera.position.clone().setY(0) : P; const near = PANELS.map(q => [q, q.p.distanceToSquared(focus.clone().setY(q.p.y))]).sort((a, b) => a[1] - b[1]).slice(0, 6);
      const lvl = f < 170 ? smooth(f / 170) : 1;
      fluo.forEach((l, k) => { const [q] = near[k]; l.position.copy(q.p); const d = Math.sqrt(near[k][1]);
        const fl = q.faulty ? (hash(q.id, f >> 1) > 0.35 ? 1 : 0.08) : 1; l.intensity = pacOn || outside || DBG_NOFLUO ? 0 : 7.5 * smooth(1 - (d - 4) / 7) * fl * lvl; }); }
    // pursuit alarm: red beacon sweeps on the beat while MINO hunts
    { const pursuit = (f >= F.minoReveal && f < F.minoReveal + 420) || (f >= F.erase0 && f < F.erase1) || (f >= F.finalChorus && f < F.layArrow);
      alarmL.intensity = pursuit && !pacOn ? 28 * Math.pow(0.5 + 0.5 * Math.cos(beatPos[f] * Math.PI), 2) : 0;
      alarmL.position.copy(P).add(V3(Math.cos(f * 0.21) * 3, 2.6, Math.sin(f * 0.21) * 3)); }
    gtao.enabled = !pacOn && !CPU_AO_OFF;
    // grade
    const fu = finalPass.uniforms;
    fu.uFrame.value = f % 997; fu.uGrain.value = CPU ? 0.04 : 0.055;
    const g = outside ? [0.15, 0.1, 1] : f >= F.erase0 && f < F.erase1 ? [0.25, 0.85, 0] : f >= F.snap && f < sec2f(99.36) ? [0.5, 0.5, 0] : [0.33, 0.66, 0];
    fu.uCyan.value = g[0]; fu.uAmber.value = g[1]; fu.uCold.value = g[2];
    fu.uCA.value = chorus ? 0.6 + 2.2 * kick : 0.25;
    const sinceSnap = f - F.snap; fu.uFlash.value = sinceSnap >= 0 && sinceSnap < 6 ? 0.85 * (1 - sinceSnap / 6) : 0;
    fu.uGlitch.value = (f >= sec2f(170.5) && f < F.finalChorus) ? 0.6 * env('onset', f) : (sinceSnap >= 0 && sinceSnap < 4 ? 1 : 0);
    fu.uFade.value = mode === 'BLACK' ? 0 : Math.min(smooth(f / 12), smooth((N - 1 - f) / 20));
    if (pacEdge) { fu.uGlitch.value = 1; fu.uFlash.value = Math.max(fu.uFlash.value, 0.35); }
    if (pacOn) { fu.uCyan.value = 0; fu.uAmber.value = 0; fu.uCold.value = 0; fu.uCA.value = 0.4; fu.uVig.value = 0.2; }
    fu.uVig.value = mode === 'FPV' ? 0.55 : 0.35;
    bloom.strength = pacOn ? 0.9 : 0.28 + (chorus ? 0.3 * kick : 0.08 * kick); bloom.threshold = pacOn ? 0.2 : 0.96; bloom.enabled = !DBG_NOBLOOM;
    motionBlur(f, cam, mode);
    composer.render();
    renderer.getContext().finish();
    updateHUD(f, mode, pacOn); updateMapCard(f, mode); updateGameHUD(f, mode, pacOn);
    if (DEBUG) {
      const bi = Math.floor(beatPos[f]);
      $('debug').innerHTML = [
        `FRAME ${f} / ${N}  T ${(f / FPS).toFixed(3)} s  @ ${FPS} fps  ${W}x${H}`,
        `BPM manifest ${M.bpm}  grid ${(60 / ((BEATS[Math.min(BEATS.length - 1, bi + 1)] - BEATS[Math.max(0, bi)]) || 1)).toFixed(1)}  BEAT ${bi}  BAR ${Math.floor(bi / 4)}.${((bi % 4) + 4) % 4 + 1}`,
        `SECTION ${sec.name}  CAM ${mode}  fov ${cam.fov.toFixed(0)}`,
        `STATE ${tel.sprite_state}  SPRITE ${wolf.cur}  view ${view}`,
        `TEL ${htmlEsc((tel.special_events || '').slice(0, 70))}`,
        `s ${S[f].toFixed(1)} / ${LDOOR.toFixed(1)} m  cell ${CS.toFixed(2)} m  seed ${SEED}  kick ${kick.toFixed(2)}${mOn ? `  MINO ${(S[f] - SM[f]).toFixed(1)} m behind` : ''}`
      ].map(l => `<div>${l}</div>`).join('');
    }
    window.__lastFrame = f;
    return f;
  }

  window.exportTelemetry = res => ({ track_name: M.track_name, bpm: M.bpm, resolution_target: res, total_frames_at_30fps: N, telemetry: M.telemetry });
  window.renderFrame = renderFrame;
  window.engineReport = { frames: N, fps: FPS, res: `${W}x${H}`, atlas: !!atlasTex, normal: !!normalTex, seed: SEED, cell_m: +CS.toFixed(3), route_m: +LDOOR.toFixed(1),
    path_cells: MZ.pathCells.length, door_frame: doorFrame, keyframes: F,
    gpu: (() => { const g = renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })() };
  await renderFrame(Number(Q.get('f') || 0));
  window.engineReady = true;
  if (Q.get('live') === '1') { let cur = Number(Q.get('f') || 0);
    addEventListener('keydown', e => { const st = e.shiftKey ? FPS : 1; if (e.key === 'ArrowRight') cur += st; if (e.key === 'ArrowLeft') cur -= st; renderFrame(cur); }); }
}

// =====================================================================================================================
// NODE SIDE (forked from v7.1; adds BT.709 conversion + tags)
// =====================================================================================================================
const PAGE_CSS = `
html,body{margin:0;background:#000;overflow:hidden}
body.clean #hud, body.clean #mini, body.clean #doom, body.clean #feed, body.clean #split, body.clean #ach, body.clean #pac{display:none!important}
:root{--u:min(1vh,1.6vw)}
#c{position:absolute;inset:0;width:100vw;height:100vh;display:block}
#ov{position:absolute;inset:0;pointer-events:none;font-family:"DejaVu Sans Mono","Consolas",monospace;color:#e8f6f8}
#hud{position:absolute;left:2.6vw;top:3.4vh;font-size:calc(1.9*var(--u));line-height:1.6;color:#bff8ff;text-shadow:0 0 .7vh #19f0ff99;letter-spacing:.06em}
#hud .obj{font-size:calc(2.2*var(--u));color:#ffd400;text-shadow:0 0 .8vh #ffd40088}
#hud .obj b{color:#fff}
#hud b{color:#ffffff;font-weight:700}
#hud .inv span{display:inline-block;margin-left:.8em;padding:0 .5em;border:1px solid #19f0ff88;background:#04141ab0}
#hud .inv i{opacity:.55;margin-left:.8em}
#hud .badge{display:inline-block;margin-top:.6vh;padding:.3vh .8vh;background:#ffd400;color:#1d3f8f;font-weight:700;text-shadow:none;font-size:calc(1.5*var(--u))}
#mini{position:absolute;right:2.4vw;top:3.4vh;border:2px solid #19f0ff99;box-shadow:0 0 1.4vh #19f0ff55;line-height:0}
#mini canvas{width:calc(30*var(--u));height:auto}
#card{position:absolute;left:0;right:0;bottom:18vh;text-align:center}
#card .k{display:inline-block;font-size:calc(2*var(--u));letter-spacing:.3em;color:#19f0ff;background:#04141ae0;padding:.6vh 1.6vh;border:1px solid #19f0ff}
#card .v{font-family:"DejaVu Sans","Arial Black",sans-serif;font-weight:700;font-size:calc(5.2*var(--u));color:#fff;text-shadow:0 0 1.6vh #19f0ff,0 .3vh 0 #000;margin-top:1vh}
#card .s{font-size:calc(2.6*var(--u));color:#ffd400;text-shadow:0 .2vh 0 #000;margin-top:.6vh}
#doom{position:absolute;left:0;right:0;bottom:0;height:12.5vh;display:flex;align-items:stretch;gap:.4vh;padding:.5vh;box-sizing:border-box;
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
#debug:empty{display:none}
#debug{position:absolute;left:1.2vw;bottom:14vh;font-size:calc(1.45*var(--u));line-height:1.35;background:#000000c8;color:#9fff9f;padding:1vh 1.2vh;border:1px solid #3a3;white-space:pre}`;
function pageHTML(q) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><canvas id="c"></canvas><div id="ov"><div id="hud"></div><div id="mini"></div><div id="card"></div><div id="feed"></div><div id="split"></div><div id="ach"></div><div id="pac"></div><div id="doom"><div class="cell"><div class="num" id="d_ammo">0</div><div class="lab">ARROWS</div></div><div class="cell"><div class="num" id="d_pat">100%</div><div class="lab">PATIENCE</div></div><div id="face"></div><div class="cell"><div class="num" id="d_rec">0</div><div class="lab">ROOMS</div></div><div class="keys"><div class="key b" id="k_b">BOX</div><div class="key y" id="k_y">THREAD</div><div class="key r" id="k_r">BADGE</div></div></div><div id="debug"></div></div>
<script type="module" src="/__scene.js?${q}"></script></body></html>`;
}
const SCENE_JS = `import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
const sceneMain = ${sceneMain.toString()};
sceneMain(THREE, { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, BufferGeometryUtils, RoomEnvironment, GTAOPass })
  .catch(e => { window.engineError = String(e && e.stack || e); console.error('ENGINE ERROR', e); });`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };
function startServer(port) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(pageHTML(u.searchParams.toString())); }
    if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (u.pathname === '/__scene.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(SCENE_JS); }
    let base = ROOT, rel = decodeURIComponent(u.pathname);
    if (rel.startsWith('/three/')) { base = THREE_DIR; rel = rel.slice(6); }
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
function preflight() {
  const need = ['manifest.json', 'atlas_map.json', 'audio_master.wav', 'Master_Sprite_Atlas.png', 'Master_Normal_Atlas.png'];
  const missing = need.filter(f => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) { console.error('[preflight] missing in ' + ROOT + ': ' + missing.join(', ')); process.exit(1); }
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
}
async function launch() {
  const puppeteer = require('puppeteer');
  const extra = (process.env.CHROME_ARGS || '').split(' ').filter(Boolean);
  return puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, protocolTimeout: 600000,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--force-color-profile=srgb', '--font-render-hinting=none', ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), ...extra] });
}
async function openPage(browser, W, H, debug) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || /ENGINE ERROR/.test(m.text())) log('[page]', m.text()); });
  page.on('pageerror', e => log('[pageerror]', e.message));
  const url = `http://127.0.0.1:${PORT}/?w=${W}&h=${H}${debug ? '&debug=1' : ''}&quality=${QUALITY}${process.env.EXTRA_Q || ''}${has('--clean') ? '&clean=1' : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.engineReady === true || !!window.engineError, { timeout: 300000 });
  const err = await page.evaluate(() => window.engineError);
  if (err) throw new Error('engine: ' + err);
  const client = await page.target().createCDPSession();
  return { page, client, browser: page.browser(), debug };
}
async function captureOnce({ page, client }, f, W, H) {
  await page.evaluate(n => window.renderFrame(n), f);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: true });
  return Buffer.from(data, 'base64');
}
const FRAME_TIMEOUT = Number(process.env.FRAME_TIMEOUT_MS || 120000);
async function capture(pg, f, W, H) {
  for (let attempt = 1; ; attempt++) {
    let timer;
    try { return await Promise.race([captureOnce(pg, f, W, H), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('frame timeout')), FRAME_TIMEOUT); })]); }
    catch (e) { if (attempt >= 3) throw new Error(`frame ${f} failed 3 times: ${e.message}`);
      log(`[retry] frame ${f} attempt ${attempt} failed (${e.message}); rebuilding the page`);
      try { await pg.page.close(); } catch (_) {}
      Object.assign(pg, await openPage(pg.browser, W, H, pg.debug)); }
    finally { clearTimeout(timer); }
  }
}
const BT709 = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
function ffmpegArgs({ input, start, frames, fps, out }) {
  return ['-y', '-hide_banner', '-loglevel', 'warning', '-stats', ...input,
    '-ss', (start / fps).toFixed(4), '-t', (frames / fps).toFixed(4), '-i', path.join(ROOT, 'audio_master.wav'),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', MASTER ? 'slow' : 'veryfast', '-crf', CRF, ...BT709,
    '-r', String(fps), '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', out];
}

(async () => {
  const m = preflight();
  const [W, H] = arg('--res', MASTER || STRIP ? m.resolution_target : '1280x720').split('x').map(Number);
  const FPS = m.fps;
  const DEBUG = has('--no-debug') ? false : (has('--debug') || STRIP || SPOT);
  const server = await startServer(PORT);
  if (SERVE) { log(`[serve] http://127.0.0.1:${PORT}/?w=${W}&h=${H}&debug=1&live=1&f=0   (arrow keys scrub)`); return; }
  const OUT = path.resolve(ROOT, arg('--out', 'renders')); fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const p0 = await openPage(browser, W, H, DEBUG);
  const rep = await p0.page.evaluate(() => window.engineReport);
  log('[engine]', JSON.stringify(rep));
  if (SPOT) {
    for (const f of arg('--spot', '0').split(',').map(Number)) { const buf = await capture(p0, f, W, H); const fn = path.join(OUT, `spot_${String(f).padStart(6, '0')}.png`); fs.writeFileSync(fn, buf); log('[spot]', fn); }
    await browser.close(); server.close(); return;
  }
  let start = 0, end = rep.frames;
  if (STRIP) [start, end] = STRIP_RANGE;
  if (RANGE) { const i = argv.indexOf('--range'); start = Math.max(0, +argv[i + 1]); end = Math.min(rep.frames, +argv[i + 2]); }
  if (MASTER && !fs.existsSync(path.join(ROOT, 'STRIP_APPROVED'))) { log('[gate] No STRIP_APPROVED file. Approve the test strip first.'); await browser.close(); server.close(); process.exit(1); }
  const tag = STRIP ? 'TestStrip' : MASTER ? 'Master' : `Range_${start}_${end}`;
  const base = `${TRACK_TAG}_${tag}_${W}x${H}_${FPS}fps${DEBUG ? '_DEBUG' : ''}`;
  const mkv = path.join(OUT, base + '.mkv');
  const t0 = Date.now(); let done = 0;
  const progress = f => { done++; if (done === 1 || done % 30 === 0 || done === end - start) { const rate = done / Math.max(0.001, (Date.now() - t0) / 1000);
    log(`[render] ${done}/${end - start} (frame ${f})  ${rate.toFixed(2)} fps  eta ${((end - start - done) / rate / 60).toFixed(1)} min`); } };
  if (PIPE) {
    const ff = spawn(FFMPEG, ffmpegArgs({ input: ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-'], start, frames: end - start, fps: FPS, out: mkv }), { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = start; f < end; f++) { const buf = await capture(p0, f, W, H); if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain'); progress(f); }
    ff.stdin.end(); const [code] = await once(ff, 'close'); if (code !== 0) throw new Error('ffmpeg exited ' + code);
  } else {
    const FR = path.join(OUT, base + '_frames'); fs.mkdirSync(FR, { recursive: true });
    const nW = Math.max(1, Number(arg('--workers', 2)));
    const pages = [p0]; for (let i = 1; i < nW; i++) pages.push(await openPage(browser, W, H, DEBUG));
    let next = start;
    await Promise.all(pages.map(async pg => { for (;;) { const f = next++; if (f >= end) return;
      const fn = path.join(FR, `frame_${String(f).padStart(6, '0')}.png`); if (fs.existsSync(fn)) { progress(f); continue; }
      const buf = await capture(pg, f, W, H); fs.writeFileSync(fn + '.part', buf); fs.renameSync(fn + '.part', fn); progress(f); } }));
    if (!has('--no-encode')) {
      const ff = spawn(FFMPEG, ffmpegArgs({ input: ['-framerate', String(FPS), '-start_number', String(start), '-i', path.join(FR, 'frame_%06d.png')], start, frames: end - start, fps: FPS, out: mkv }), { stdio: ['ignore', 'inherit', 'inherit'] });
      const [code] = await once(ff, 'close'); if (code !== 0) throw new Error('ffmpeg exited ' + code);
    }
  }
  fs.writeFileSync(path.join(OUT, `telemetry_${W}x${H}.json`), JSON.stringify(await p0.page.evaluate(r => window.exportTelemetry(r), `${W}x${H}`), null, 1));
  await browser.close(); server.close();
  log('[done]', mkv);
})().catch(e => { console.error('[fatal]', e.message || e); process.exit(1); });
