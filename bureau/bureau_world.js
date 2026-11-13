#!/usr/bin/env node
// =====================================================================================================================
// BUREAU & CO. world builder + navigation test (Engine v10 "Bureau", grey-block phase)
//
// World logic first. This module owns the floor plan, collision volumes, doors, Wolfgang's route, MINO-7000's
// movement and the thread. It writes world.json + timeline.json for the renderer and a collision report. The
// renderer draws only what this module proves is legal.
//
//   node bureau_world.js --root ..          writes <root>/bureau/world.json, timeline.json, nav_report.json
//
// Coordinates: x east, z south, y up, metres. Store footprint x[-36,36] z[-26,26]. Entrance south-west, exit north.
// =====================================================================================================================
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('--root', '..')), OUT = path.join(ROOT, 'bureau');
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- manifest timing (same locomotion model as v9)
const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const FPS = M.fps, N = M.total_frames_at_30fps;
const TEL = M.telemetry.slice().sort((a, b) => a.frame - b.frame).map(t => Object.assign({}, t, { special_events: String(t.special_events || '').replace(/_/g, ' ') }));
const telIdx = new Int32Array(N); { let k = 0; for (let f = 0; f < N; f++) { while (k + 1 < TEL.length && TEL[k + 1].frame <= f) k++; telIdx[f] = k; } }
const findEv = re => TEL.find(t => re.test(t.special_events) || re.test(t.lyric || ''));
const fOf = (re, d) => { const e = findEv(re); return e ? e.frame : d; };
const F = {
  pickBox: fOf(/DAEDALUS shelf/i, 1091), threadFound: fOf(/thread found/i, 1371), tie: fOf(/thread tied/i, 1410), snap: fOf(/CHORUS SNAP/i, 2035),
  minoReveal: fOf(/MINO7000 reveal/i, 2981), erase0: fOf(/MINO pursues/i, 3886), minoan: fOf(/BREAK2/i, 4841), finalChorus: fOf(/FINAL CHORUS/i, 5254),
  layArrow: fOf(/lays one arrow/i, 5736), ext: fOf(/car park/i, 5988), halfShelf: fOf(/half shelf/i, 6217), black: fOf(/hard cut/i, 6302)
};
F.door = Math.min(N - 1, F.layArrow + Math.round(2.2 * FPS));
F.pre = Math.round((M.sections.find(x => /Pre-Chorus/.test(x.name)) || { start_s: 55.891 }).start_s * FPS);
F.deadEnd = F.pre;
{ const l = (M.acoustic.lines || []).find(x => /four-poster took flight/i.test(x.text)); F.fourPoster = l ? Math.round(l.start_s * FPS) : 1519; }
const SPEED = { walk: 1.45, push_trolley: 1.35, run: 4.4, idle: 0, idle_trolley: 0, freeze: 0, slowmo: 0.7, turn_left: 1.3, turn_right: 1.3,
  look_left: 0.7, look_right: 0.7, look_down: 0.6, tie_thread: 0, step_back: 0 };
const P = new Float64Array(N); { let v = 0, s = 0; for (let f = 0; f < N; f++) { const tgt = SPEED[TEL[telIdx[f]].sprite_state] ?? 1.2; v += (tgt - v) * 0.12; s += v / FPS; P[f] = s; } }

// ---------------------------------------------------------------- floor plan
// Every object is a layer-tagged axis-aligned box. layer: wall | large (blocks) | small (decor, blocks if h>0.5) | door
const SOL = [], DOORS = [], ZONES = [], LABELS = [];
const WT = 0.3, WH = 3.2;
const box = (x0, z0, x1, z1, h, kind, layer = 'large', extra = {}) => SOL.push(Object.assign({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, kind, layer }, extra));
// wall along x (constant z) or along z (constant x), with gaps [[c, w], ...] cut out
const wallX = (z, xa, xb, gaps = []) => { let a = xa; for (const [c, w] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (c - w / 2 > a) box(a, z - WT / 2, c - w / 2, z + WT / 2, WH, 'wall', 'wall'); a = c + w / 2; } if (xb > a) box(a, z - WT / 2, xb, z + WT / 2, WH, 'wall', 'wall'); };
const wallZ = (x, za, zb, gaps = []) => { let a = za; for (const [c, w] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (c - w / 2 > a) box(x - WT / 2, a, x + WT / 2, c - w / 2, WH, 'wall', 'wall'); a = c + w / 2; } if (zb > a) box(x - WT / 2, a, x + WT / 2, zb, WH, 'wall', 'wall'); };
// door: sliding pair in a wall gap. axis 'x' = wall runs along x. staff doors stay shut except for MINO.
const door = (id, x, z, w, axis, kind = 'sliding', staff = false, label = '') => DOORS.push({ id, x, z, w, axis, kind, staff, label });
const zone = (id, name, x0, z0, x1, z1) => ZONES.push({ id, name, x0, z0, x1, z1 });

zone('entrance', 'ENTRANCE / CHECKOUT', -36, 12, -16, 26);
zone('bedrooms', 'ARIADNE BEDROOMS', -36, -8, -16, 12);
zone('kitchens', 'KNOSSOS KITCHENS', -36, -26, -6, -8);
zone('hall', 'EXIT HALL', -6, -26, 6, -8);
zone('wardrobes', 'MINOS WARDROBES', 6, -26, 36, -8);
zone('service', 'SERVICE CORRIDORS', 26, -8, 36, 26);
zone('core', 'THE MAZE CORE', -16, -8, 26, 26);

// perimeter
wallX(26, -36, 36, [[-30, 3.2]]); door('entry', -30, 26, 3.2, 'x', 'sliding', false, 'ENTRANCE');
wallX(-26, -36, 36, [[0, 3.2]]); door('exit', 0, -26, 3.2, 'x', 'sliding', false, 'EXIT');
wallZ(-36, -26, 26); wallZ(36, -26, 26);
// partitions
wallX(12, -36, -16, [[-20, 3.0]]);                                  // entrance | bedrooms (open arch)
wallZ(-16, -8, 26);                                                 // west zones | core
wallX(-8, -36, 36, [[-33, 3.0], [0, 3.2], [33.5, 2.6], [-11, 1.4]]); // bedrooms|kitchens arch, core|hall door, wardrobes|service door, staff door
door('hall_core', 0, -8, 3.2, 'x', 'sliding', false, 'TO EXIT');
door('ward_serv', 33.5, -8, 2.6, 'x', 'swing', false, 'STAFF ONLY');
door('staff_k', -11, -8, 1.4, 'x', 'swing', true, 'STAFF ONLY');
wallZ(-6, -26, -8, [[-23.4, 2.6]]); door('kit_hall', -6, -23.4, 2.6, 'z', 'sliding', false, 'KITCHENS');
wallZ(6, -26, -8, [[-21, 2.6]]); door('hall_ward', 6, -21, 2.6, 'z', 'sliding', false, 'WARDROBES');
wallZ(26, -8, 26, [[24, 2.6], [6.2, 1.4]]); door('serv_core', 26, 24, 2.6, 'z', 'swing', false, 'CUSTOMERS BEYOND THIS POINT BECOME STAFF');
door('staff_s', 26, 6.2, 1.4, 'z', 'swing', true, 'STAFF ONLY');

// ---- entrance / checkout: welcome desk, checkout lanes, trolley bay, queue barriers forcing a short snake, BUY ONE SHELF stack
box(-35.6, 13, -34.2, 22, 1.0, 'checkout'); box(-34.2, 13.5, -33.7, 21.5, 1.0, 'checkout_belt', 'small');           // checkout bank (west)
box(-26, 23.2, -22, 24.4, 1.05, 'welcome_desk');                                                            // welcome desk
box(-35.6, 23.4, -33.6, 25.6, 1.0, 'trolley_bay');                                                          // nested trolleys
for (const [z, xa, xb] of [[21, -29.2, -16.4], [17.8, -33.6, -20.6]]) box(xa, z - 0.05, xb, z + 0.05, 1.0, 'queue_barrier');
box(-19.2, 13.4, -17.0, 15.2, 1.6, 'shelf_stack', 'large', { sign: 'BUY ONE SHELF' });                     // flat-pack stack
LABELS.push({ x: -26, z: 18.5, text: 'BUY ONE SHELF', big: true });

// ---- Ariadne Bedrooms: room sets as three-sided booths along the walls, display beds; anchor bed in the middle booth
const booth = (x0, z0, x1, z1, open) => { // half-height partitions on three sides, open on `open` side
  const t = 0.12, h = 2.1;
  if (open !== 'n') box(x0, z0, x1, z0 + t, h, 'partition'); if (open !== 's') box(x0, z1 - t, x1, z1, h, 'partition');
  if (open !== 'w') box(x0, z0, x0 + t, z1, h, 'partition'); if (open !== 'e') box(x1 - t, z0, x1, z1, h, 'partition'); };
booth(-36, 4, -30, 10, 'e'); box(-35.4, 5.4, -33, 8.6, 0.6, 'bed'); box(-35.6, 4.5, -35, 5.2, 0.6, 'nightstand', 'small');
booth(-36, -6, -30, 0, 'e'); box(-35.4, -4.6, -33, -1.4, 0.6, 'bed'); box(-35.8, -1, -35.2, -0.3, 2.0, 'wardrobe');
booth(-22, -6, -16, 0, 'w'); box(-19, -4.6, -16.6, -1.4, 0.6, 'bed');
box(-29, 1.8, -26.6, 4.2, 0.6, 'bed_anchor', 'large', { anchor: true });                                    // THE display bed (thread anchor)
box(-29.6, 2.2, -29.1, 2.8, 0.7, 'lamp_table', 'small'); box(-26.5, 2.2, -26.0, 2.8, 0.7, 'lamp_table', 'small');
box(-22, 4, -16.4, 4.12, 2.1, 'partition'); box(-22, 4, -21.88, 9, 2.1, 'partition');                    // dividers forcing the route west
LABELS.push({ x: -27.8, z: 0.8, text: 'ARIADNE', big: false }); LABELS.push({ x: -18.6, z: 2.0, text: 'THIS WAY', big: false, glitch: true });

// ---- Knossos Kitchens: worktop runs as islands (aisles between), wall units
for (const [z, xa, xb] of [[-12.0, -35.85, -10.5], [-16.4, -31.5, -6.15], [-20.6, -35.85, -10.5]]) box(xa, z - 0.45, xb, z + 0.45, 0.92, 'worktop');
box(-35.6, -25.6, -33.6, -24.3, 2.2, 'tall_unit'); box(-14, -25.6, -10, -25, 2.2, 'wall_units', 'small', { sign: 'GIANT LOAF' });
LABELS.push({ x: -21, z: -9.6, text: 'KNOSSOS', big: false });

// ---- Exit hall: relocated-exit sign, bench
box(-4.5, -12, -3.3, -10.5, 0.45, 'bench'); LABELS.push({ x: 0, z: -24, text: 'EXIT STATUS: RELOCATED', big: false });

// ---- Minos Wardrobes: wardrobe banks with mirrors; MINO's closet (staff door) beside the route
for (const [x, za, zb] of [[12, -25.6, -14], [18, -20, -8.4], [24, -25.6, -14], [30, -20, -8.4]]) box(x - 0.35, za, x + 0.35, zb, 2.4, 'wardrobe_bank');
wallZ(19.2, -25.85, -23.4); wallZ(22.8, -25.85, -23.4); wallX(-23.4, 19.05, 22.95, [[21, 1.8]]); door('mino_closet', 21, -23.4, 1.8, 'x', 'swing', true, 'CLEANING');
LABELS.push({ x: 21, z: -24.6, text: 'MINOS', big: false });

// ---- Service corridors: zig-zag walls, cleaning stations, delivery cages
wallX(0, 26, 33.6); wallX(8, 28.4, 36); wallX(16, 26, 33.6);
box(26.4, -7.6, 27.8, -5.6, 1.8, 'delivery_cage'); box(26.4, 2, 27.6, 3.4, 1.2, 'cleaning_station'); box(34.4, 10, 35.6, 13, 1.8, 'delivery_cage');
box(26.4, 17, 27.8, 19, 1.2, 'cleaning_station');

// ---- Maze core: double-sided shelving gondolas as real aisles, alternating end gaps (a store's serpentine)
const ROWS = [21.6, 17.2, 12.8, 8.4, 4.0, -0.4, -4.8];
ROWS.forEach((z, k) => { const westGap = k % 2 === 0; const xa = westGap ? 8.4 : 5.2, xb = westGap ? 25.8 : 22.6;
  box(xa, z - 0.6, xb, z + 0.6, 2.2, 'gondola', 'large', { row: k }); });
box(4.6, -4.2, 5.2, 25.85, 2.2, 'gondola_spine', 'large');                                     // long shelving spine: west edge of the serpentine
for (const [x0, z0, x1, z1] of [[-13, 18, -6, 21], [-3, 18, 2, 21], [-13, 10, -8, 14], [-5, 10, 2, 14], [-13, 2, -6, 5], [-3, 2, 2, 5], [-12, -5, -4, -2.4]])
  box(x0, z0, x1, z1, 1.4, 'display_island', 'large');                                          // west core: display islands, open floor for the MINO chase views
LABELS.push({ x: 5, z: 24.2, text: 'THE MAZE CORE', big: false });

// ---------------------------------------------------------------- navigation grid + A*
const GRID = 0.2, GX0 = -38, GZ0 = -50, GW = Math.round(76 / GRID), GH = Math.round(88 / GRID);
const R_BODY = 0.78;   // Wolfgang + trolley half-width + margin; MINO (0.62) fits inside this
const blocked = (openDoors) => { const g = new Uint8Array(GW * GH);
  const mark = (x0, z0, x1, z1, r) => { const i0 = Math.max(0, Math.floor((x0 - r - GX0) / GRID)), i1 = Math.min(GW - 1, Math.ceil((x1 + r - GX0) / GRID));
    const j0 = Math.max(0, Math.floor((z0 - r - GZ0) / GRID)), j1 = Math.min(GH - 1, Math.ceil((z1 + r - GZ0) / GRID));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = GX0 + (i + 0.5) * GRID, cz = GZ0 + (j + 0.5) * GRID;
      const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1); if (dx * dx + dz * dz < r * r) g[j * GW + i] = 1; } };
  for (const s of SOL) if (s.layer !== 'small' || s.h > 0.5) mark(s.x0, s.z0, s.x1, s.z1, R_BODY);
  for (const d of DOORS) if (!openDoors.has(d.id)) { const hw = d.w / 2; d.axis === 'x' ? mark(d.x - hw, d.z - 0.1, d.x + hw, d.z + 0.1, R_BODY) : mark(d.x - 0.1, d.z - hw, d.x + 0.1, d.z + hw, R_BODY); }
  return g; };
const cellOf = (x, z) => [Math.floor((x - GX0) / GRID), Math.floor((z - GZ0) / GRID)];
const astar = (g, a, b) => { const [ai, aj] = cellOf(...a), [bi, bj] = cellOf(...b), S = aj * GW + ai, T = bj * GW + bi;
  if (g[S] || g[T]) throw new Error(`A* endpoint blocked ${a} -> ${b}`);
  const gs = new Float64Array(GW * GH).fill(Infinity), came = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
  const heap = []; const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const H = n => { const i = n % GW, j = (n / GW) | 0; return Math.hypot(i - bi, j - bj); };
  gs[S] = 0; push(S, H(S)); const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) { const [, n] = pop(); if (closed[n]) continue; if (n === T) break; closed[n] = 1; const i = n % GW, j = (n / GW) | 0;
    for (const [di, dj, c] of NB) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= GW || b2 >= GH) continue; const m = b2 * GW + a2; if (g[m] || closed[m]) continue;
      if (di && dj && (g[j * GW + a2] || g[b2 * GW + i])) continue; const ng = gs[n] + c; if (ng < gs[m]) { gs[m] = ng; came[m] = n; push(m, ng + H(m)); } } }
  if (came[T] < 0) throw new Error(`A* no path ${a} -> ${b}`);
  const out = []; for (let n = T; n >= 0; n = came[n]) out.unshift([GX0 + (n % GW + 0.5) * GRID, GZ0 + (((n / GW) | 0) + 0.5) * GRID]); out[0] = a.slice(); out[out.length - 1] = b.slice(); return out; };
const free = (g, x, z) => { const [i, j] = cellOf(x, z); return i >= 0 && j >= 0 && i < GW && j < GH && !g[j * GW + i]; };
const los = (g, a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (GRID * 0.5)); for (let k = 0; k <= n; k++) { const t = k / n; if (!free(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; } return true; };
const pull = (g, pts) => { const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !los(g, pts[i], pts[j])) j--; out.push(pts[j]); i = j; } return out; };
// round corners with circular fillets, shrinking a fillet until every sample is free
const fillet = (g, poly, rMax = 2.2) => { const out = [poly[0]];
  for (let k = 1; k < poly.length - 1; k++) { const A = poly[k - 1], B = poly[k], C = poly[k + 1];
    const ua = [A[0] - B[0], A[1] - B[1]], uc = [C[0] - B[0], C[1] - B[1]], la = Math.hypot(...ua), lc = Math.hypot(...uc); ua[0] /= la; ua[1] /= la; uc[0] /= lc; uc[1] /= lc;
    let done = false;
    for (let r = Math.min(rMax, la * 0.45, lc * 0.45); r > 0.05 && !done; r *= 0.7) { const p0 = [B[0] + ua[0] * r, B[1] + ua[1] * r], p2 = [B[0] + uc[0] * r, B[1] + uc[1] * r], seg = [];
      for (let t = 0; t <= 1.0001; t += 0.1) { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; seg.push([a * p0[0] + b * B[0] + c * p2[0], a * p0[1] + b * B[1] + c * p2[1]]); }
      if (seg.every(p => free(g, p[0], p[1]))) { out.push(...seg); done = true; } }
    if (!done) out.push(B); }
  out.push(poly[poly.length - 1]); return out; };

// story waypoints (each leg is solved with the doors that are open for that leg)
const WP = {
  outside: [-30, 30], deadEnd: [-17.7, 2.0], box: [-20.6, 13.7], anchor: [-25.0, 3.0], reveal: [21, -17], servDoor: [33.5, -6.6], coreIn: [24.2, 24.0],
  hallIn: [0, -9.6], exitIn: [0, -24.5], car: [0, -38]
};
const LEGS = [  // [from, to, story distance at `to` (m of walk), doors open, label, via...]
  ['outside', 'box', 'pickBox', ['entry'], 'entrance'],
  ['box', 'anchor', 'tie', [], 'to the display bed'],
  ['anchor', 'deadEnd', 'deadEnd', [], 'wrong turn: the glitched arrows lead into a dead end'],
  ['deadEnd', 'reveal', 'minoReveal', ['kit_hall', 'hall_ward'], 'back out; kitchens, exit hall, wardrobes', [[-33, -9.4], [-7.6, -23.4], [7.6, -21]]],
  ['reveal', 'servDoor', 'erase0', ['ward_serv'], 'MINO wakes; into service'],
  ['servDoor', 'coreIn', null, ['ward_serv', 'serv_core'], 'service corridors'],
  ['coreIn', 'hallIn', null, ['serv_core', 'hall_core'], 'the maze core'],
  ['hallIn', 'exitIn', 'door', ['hall_core'], 'exit hall'],
  ['exitIn', 'car', null, ['exit'], 'car park'],
];
const ROUTE = [], LEGINFO = [];
for (const [a, b, ev, open, label, via] of LEGS) {
  const g = blocked(new Set(open)); const stops = [WP[a], ...(via || []), WP[b]]; let poly = [];
  for (let k = 0; k < stops.length - 1; k++) { const seg = pull(g, astar(g, stops[k], stops[k + 1])); poly.push(...(k ? seg.slice(1) : seg)); }
  poly = pull(g, poly); poly = fillet(g, poly);
  // resample at 0.1 m
  const pts = [poly[0]]; for (let k = 1; k < poly.length; k++) { const A = poly[k - 1], B = poly[k], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 0.1));
    for (let t = 1; t <= n; t++) pts.push([A[0] + (B[0] - A[0]) * t / n, A[1] + (B[1] - A[1]) * t / n]); }
  const startIdx = ROUTE.length ? ROUTE.length - 1 : 0; if (ROUTE.length) pts.shift(); ROUTE.push(...pts);
  LEGINFO.push({ from: a, to: b, ev, open, label, i0: startIdx, i1: ROUTE.length - 1, grid: g });
}
// arc length
const SL = new Float64Array(ROUTE.length); for (let k = 1; k < ROUTE.length; k++) SL[k] = SL[k - 1] + Math.hypot(ROUTE[k][0] - ROUTE[k - 1][0], ROUTE[k][1] - ROUTE[k - 1][1]);
const LEN = SL[SL.length - 1];
for (const L of LEGINFO) { L.s0 = SL[L.i0]; L.s1 = SL[L.i1]; L.len = L.s1 - L.s0; }

// ---------------------------------------------------------------- timing: story distance -> route distance, legwise, with corner slow-down
// cornerness: turn angle per metre over a 1.2 m window -> effort cost (slows into corners, believable)
const posAtS = s => { s = Math.max(0, Math.min(LEN, s)); let lo = 0, hi = SL.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SL[m] <= s) lo = m; else hi = m; }
  const t = (s - SL[lo]) / Math.max(1e-9, SL[hi] - SL[lo]); return [ROUTE[lo][0] + (ROUTE[hi][0] - ROUTE[lo][0]) * t, ROUTE[lo][1] + (ROUTE[hi][1] - ROUTE[lo][1]) * t]; };
const tanAt = s => { const a = posAtS(s - 0.3), b = posAtS(s + 0.3); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const EFF = new Float64Array(SL.length); { let e = 0; for (let k = 1; k < SL.length; k++) { const s = SL[k], t0 = tanAt(s - 0.6), t1 = tanAt(s + 0.6);
  const turn = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1]))); e += (SL[k] - SL[k - 1]) * (1 + 0.55 * Math.min(1, turn / 1.2)); EFF[k] = e; } }
const effAt = s => { let lo = 0, hi = SL.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SL[m] <= s) lo = m; else hi = m; } const t = (s - SL[lo]) / Math.max(1e-9, SL[hi] - SL[lo]); return EFF[lo] + (EFF[hi] - EFF[lo]) * t; };
const sOfEff = e => { let lo = 0, hi = EFF.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (EFF[m] <= e) lo = m; else hi = m; } const t = (e - EFF[lo]) / Math.max(1e-9, EFF[hi] - EFF[lo]); return SL[lo] + (SL[hi] - SL[lo]) * t; };
// anchor table: walk distance P at a frame <-> route distance at a waypoint
const ANCH = [[0, 0]]; for (const L of LEGINFO) if (L.ev) ANCH.push([P[F[L.ev]], L.s1]);
const lastLegWalk = P[N - 1]; // after the exit door, the car park leg uses natural scale
const S = new Float64Array(N);
for (let f = 0; f < N; f++) { const p = P[f]; let k = 0; while (k + 1 < ANCH.length && ANCH[k + 1][0] <= p) k++;
  if (k + 1 < ANCH.length) { const [p0, s0] = ANCH[k], [p1, s1] = ANCH[k + 1], e0 = effAt(s0), e1 = effAt(s1); S[f] = sOfEff(e0 + (e1 - e0) * (p - p0) / Math.max(1e-9, p1 - p0)); }
  else { const [p0, s0] = ANCH[ANCH.length - 1]; S[f] = Math.min(LEN, s0 + (p - p0)); } }
const PIVOTS = [];
const legScale = []; for (let k = 1; k < ANCH.length; k++) legScale.push(+((ANCH[k][1] - ANCH[k - 1][1]) / (ANCH[k][0] - ANCH[k - 1][0])).toFixed(3));

// ---------------------------------------------------------------- pivots: at a cusp he stops, turns on the spot with the trolley, then sets off
const CUSPS = []; for (let k = 1; k < LEGINFO.length; k++) { const s0 = LEGINFO[k].s0, a = posAtS(s0 - 0.6), b = posAtS(s0), c = posAtS(s0 + 0.6);
  const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1); if (cos < -0.2) CUSPS.push(s0); }
const PIVOT_F = 40, PIVOT_WIN = 75;
for (const sc of CUSPS) { let fc = 0; while (fc < N - 1 && S[fc] < sc) fc++; const fa = Math.max(0, fc - PIVOT_WIN), fb = Math.min(N - 1, fc + PIVOT_WIN), sa = S[fa], sb = S[fb], hold = (sc - sa) / Math.max(1e-9, sb - sa);
  const h0 = (fb - fa - PIVOT_F) / 2, ss = t => t * t * (3 - 2 * t);
  for (let f = fa; f <= fb; f++) { const k = f - fa; let g; if (k < h0) g = hold * ss(k / h0); else if (k < h0 + PIVOT_F) g = hold; else g = hold + (1 - hold) * ss((k - h0 - PIVOT_F) / h0); S[f] = sa + (sb - sa) * g; }
  PIVOTS.push({ s: sc, f0: fa + Math.round(h0), f1: fa + Math.round(h0) + PIVOT_F }); }
// per-frame heading: one-sided tangent near cusps (never across a reversal), rotate in place during a pivot
const tanOneSided = s => { for (const sc of CUSPS) { if (Math.abs(s - sc) < 1.0) { const d = s <= sc ? -1 : 1; const a = posAtS(d < 0 ? s - 0.5 : s), b = posAtS(d < 0 ? s : s + 0.5); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  if (d < 0 && s >= sc - 1e-6) { const a2 = posAtS(sc - 0.5), b2 = posAtS(sc); const l2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1; return [(b2[0] - a2[0]) / l2, (b2[1] - a2[1]) / l2]; }
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; } } const a = posAtS(s - 0.25), b = posAtS(s + 0.9); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const YAW = new Float64Array(N); { let last = 0; for (let f = 0; f < N; f++) { const pv = PIVOTS.find(p => f >= p.f0 - 2 && f <= p.f1 + 2);
  if (pv) { const tin = tanOneSided(pv.s - 0.05), tout = tanOneSided(pv.s + 0.05), y0 = Math.atan2(tin[0], tin[1]); let y1 = Math.atan2(tout[0], tout[1]); let d = y1 - y0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(Math.abs(d) - Math.PI) < 0.35) d = Math.PI * (d >= 0 ? 1 : -1); const u = Math.max(0, Math.min(1, (f - pv.f0) / (pv.f1 - pv.f0))); YAW[f] = y0 + d * u * u * (3 - 2 * u); }
  else if (f > 0 && Math.abs(S[f] - S[f - 1]) < 1e-6) YAW[f] = last; else { const t = tanOneSided(S[f]); YAW[f] = Math.atan2(t[0], t[1]); } last = YAW[f]; } }

// ---------------------------------------------------------------- MINO-7000: hidden in its closet until reveal, then follows the customer's route
const SM = new Float64Array(N), minoOn = new Uint8Array(N);
const sReveal = S[F.minoReveal], CLOSET = [21, -24.6]; // inside the closet
for (let f = 0; f < N; f++) { if (f < F.minoReveal) { SM[f] = -1; continue; } minoOn[f] = f < F.halfShelf ? 1 : 0;
  const gap = f < F.erase0 ? 9 + 3 * (1 - Math.min(1, (f - F.minoReveal) / 90)) : 4.5 + 2 * Math.max(0, 1 - (f - F.erase0) / 300);
  SM[f] = Math.max(sReveal - 2.5, S[f] - gap); if (f >= F.door - 20) SM[f] = Math.min(SM[f], S[F.door] - 4.5); } // MINO stops at the door: not its route
// the first 1.6 s after reveal MINO drives out of the closet onto the route (legal: straight line through its own open door)
// emergence: A*-solved drive from inside the closet, through its door, onto the route at the join frame
let KJ = 48, EMERGE = null, ESL = null;
for (let it = 0; it < 3; it++) { const g = blocked(new Set(['mino_closet', 'hall_ward', 'ward_serv'])); const tgt = posAtS(SM[F.minoReveal + KJ]);
  EMERGE = fillet(g, pull(g, astar(g, CLOSET, tgt))); ESL = [0]; for (let k = 1; k < EMERGE.length; k++) ESL.push(ESL[k - 1] + Math.hypot(EMERGE[k][0] - EMERGE[k - 1][0], EMERGE[k][1] - EMERGE[k - 1][1]));
  KJ = Math.max(36, Math.ceil(ESL[ESL.length - 1] / 2.6 * FPS)); }
const emergeAt = u => { const L = ESL[ESL.length - 1] * u; let k = 1; while (k < ESL.length - 1 && ESL[k] < L) k++; const t = (L - ESL[k - 1]) / Math.max(1e-9, ESL[k] - ESL[k - 1]);
  return [EMERGE[k - 1][0] + (EMERGE[k][0] - EMERGE[k - 1][0]) * t, EMERGE[k - 1][1] + (EMERGE[k][1] - EMERGE[k - 1][1]) * t]; };
const minoPos = f => { if (SM[f] < 0) return null; const k = f - F.minoReveal; if (k < KJ) { const t = k / KJ; return emergeAt(t * t * (3 - 2 * t)); } return posAtS(SM[f]); };

// ---------------------------------------------------------------- thread: anchored at the display bed, lies on the walked route behind him
const sAnchor = S[F.tie], SPOOL = 420;
const threadSpan = f => { if (f < F.tie) return null; let a = sAnchor, b = S[f];
  if (f >= F.erase0 && f < F.minoan) a = Math.max(a, SM[f] + 0.6);         // MINO polishes the thread away as it chases
  if (f >= F.minoan) a = Math.max(a, SM[F.minoan] + 0.6);
  return b > a ? [a, b] : null; };

// ---------------------------------------------------------------- door state machine: closed / opening / open / closing, driven by agents + thread
const DOOR_RANGE = 4.6, DOOR_T = 11; // frames to slide fully
const doorOpen = DOORS.map(() => new Float32Array(N));
DOORS.forEach((d, di) => { let o = 0;
  for (let f = 0; f < N; f++) { const w = posAtS(S[f]); let want = !d.staff && Math.hypot(w[0] - d.x, w[1] - d.z) < DOOR_RANGE;
    const m = minoPos(f); if (m && Math.hypot(m[0] - d.x, m[1] - d.z) < DOOR_RANGE + 0.6) want = true;               // MINO opens staff doors too (it is staff)
    const th = threadSpan(f); if (th && !d.staff) { for (let s = th[0]; s <= th[1]; s += 0.5) { const p = posAtS(s); if (Math.hypot(p[0] - d.x, p[1] - d.z) < 0.9) { want = true; break; } } } // thread jams the door open
    if (d.id === 'mino_closet') want = f >= F.minoReveal - 24 && f < F.minoReveal + 90;
    if (d.id === 'exit' && f < F.layArrow) want = false;                                                              // relocated exit: shuttered until the end
    if (d.id === 'hall_core' && f < F.finalChorus) want = want && f >= F.finalChorus;                                 // core->hall opens only for the escape
    o = Math.max(0, Math.min(1, o + (want ? 1 : -1) / DOOR_T)); doorOpen[di][f] = o; } });

// ---------------------------------------------------------------- lyric set dressing (placed AFTER the route is solved, then collision-tested like everything else)
const DRESS = [];
{ const lines = (M.acoustic.lines || []).map(l => ({ text: String(l.text).trim(), f: Math.round(l.start_s * FPS) }));
  const free = (x0, z0, x1, z1, clear) => { for (const o of SOL) if (!(x1 + 0.12 < o.x0 || x0 - 0.12 > o.x1 || z1 + 0.12 < o.z0 || z0 - 0.12 > o.z1)) return false;
    for (let k = 0; k < ROUTE.length; k += 2) { const p = ROUTE[k]; const dx = Math.max(x0 - p[0], 0, p[0] - x1), dz = Math.max(z0 - p[1], 0, p[1] - z1); if (dx * dx + dz * dz < clear * clear) return false; } return true; };
  for (const e of require('./lyric_dressing.js')) {
    const hits = lines.filter(l => e.line.test(l.text)); const L = hits[e.nth || 0]; if (!L) { console.error('[dress] no line for', e.line); continue; }
    const f = Math.min(N - 1, L.f), item = { text: e.text, kind: e.kind, f, tone: e.tone || 'teal', big: !!e.big, shape: e.shape || null, anim: e.anim || null, w: e.w, d: e.d || 0.3, h: e.h || 0, tilt: e.tilt || 0, curve: !!e.curve, tile: !!e.tile };
    const grp = e.group ? DRESS.find(d => d.group === e.group && !d.flipOf && d.flipOf !== 0) : null; item.group = e.group || null;
    if (grp) { item.x = grp.x; item.z = grp.z; item.yaw = grp.yaw; item.flipOf = DRESS.indexOf(grp); DRESS.push(item); continue; }
    if (e.fixed) { item.x = e.fixed[0]; item.z = e.fixed[1]; item.yaw = 0; }
    else { let placed = false; for (const dl of [0, 2, -2, 4, -4, 6]) { const s0 = S[f] + (e.lead || 0) + dl, p = posAtS(s0), t = tanAt(s0), n = [-t[1], t[0]]; item.yaw = Math.atan2(t[0], t[1]);
      if (e.side !== 'on') { // try both sides, increasing offsets; props must keep 0.95 m from the route and stay out of solids; signs prefer a clear line too
        const sides = e.side === 'L' ? [1] : e.side === 'R' ? [-1] : [1, -1]; let best = null;
        for (const off of [1.7, 2.1, 2.5, 3.0, 3.5]) { for (const sd of sides) { const x = p[0] + n[0] * off * sd, z = p[1] + n[1] * off * sd;
            if (e.kind === 'prop') { const hw = Math.max(e.w, e.d || 0.3) / 2 + 0.05; if (free(x - hw, z - hw, x + hw, z + hw, 0.95 + hw * 0)) { best = [x, z]; break; } }
            else if (e.kind === 'sign') { const ov = DRESS.some(d => d.kind === 'sign' && d.flipOf === undefined && Math.abs(d.x - x) < (d.w + e.w) / 2 + 0.4 && Math.abs(d.z - z) < 1.6);
              if (!ov && free(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 1.2)) { best = [x, z]; break; } } }
          if (best) break; }
        if (best) { item.x = best[0]; item.z = best[1]; placed = true; break; } } else { item.x = p[0]; item.z = p[1]; placed = true; break; } }
      if (!placed) { console.error('[dress] no clear spot for', e.text); continue; } }
    if (e.kind === 'prop') { const hw = (e.shape === 'portrait' || e.shape === 'curtain' || e.shape === 'window') ? null : Math.max(e.w, e.d || 0.3) / 2;
      const bx = hw === null ? [item.x - e.w / 2, item.z - (e.d || 0.3) / 2, item.x + e.w / 2, item.z + (e.d || 0.3) / 2] : [item.x - hw, item.z - hw, item.x + hw, item.z + hw];
      SOL.push({ x0: bx[0], z0: bx[1], x1: bx[2], z1: bx[3], h: e.h, kind: 'dress_' + (e.shape || 'prop'), layer: e.h > 0.5 ? 'large' : 'small', dress: DRESS.length }); }
    if (e.anim === 'fourposter') SOL.push({ x0: item.x - 1.1, z0: item.z - 1.3, x1: item.x + 1.1, z1: item.z + 1.3, h: 2.2, kind: 'dress_fourposter', layer: 'large', dress: DRESS.length });
    DRESS.push(item); } }
// ---------------------------------------------------------------- collision test (the acceptance gate)
const rectHitCircle = (s, x, z, r) => { const dx = Math.max(s.x0 - x, 0, x - s.x1), dz = Math.max(s.z0 - z, 0, z - s.z1); return dx * dx + dz * dz < r * r; };
const doorRect = d => d.axis === 'x' ? { x0: d.x - d.w / 2, z0: d.z - 0.08, x1: d.x + d.w / 2, z1: d.z + 0.08 } : { x0: d.x - 0.08, z0: d.z - d.w / 2, x1: d.x + 0.08, z1: d.z + d.w / 2 };
const OBST = SOL.filter(s => s.layer !== 'small' || s.h > 0.5);
const report = { wolfgang: [], trolley: [], mino: [], thread: [], doors_crossed_closed: [], min_clear: Infinity };
const R_W = 0.42, R_M = 0.62, TROL = { w: 0.62, l: 0.95, ahead: 0.95 };
for (let f = 0; f < N; f++) {
  const s = S[f], w = posAtS(s), t = [Math.sin(YAW[f]), Math.cos(YAW[f])];
  for (const o of OBST) { if (rectHitCircle(o, w[0], w[1], R_W)) report.wolfgang.push([f, o.kind]);
    const dx = Math.max(o.x0 - w[0], 0, w[0] - o.x1), dz = Math.max(o.z0 - w[1], 0, w[1] - o.z1); report.min_clear = Math.min(report.min_clear, Math.hypot(dx, dz)); }
  // trolley: sample its rectangle as 6 circles
  if (f >= F.pickBox && f < F.ext) for (const [u, v] of [[0.5, -0.24], [0.5, 0.24], [0.95, -0.24], [0.95, 0.24], [1.4, -0.24], [1.4, 0.24]]) {
    const cx = w[0] + t[0] * u - t[1] * v, cz = w[1] + t[1] * u + t[0] * v; for (const o of OBST) if (rectHitCircle(o, cx, cz, 0.08)) { report.trolley.push([f, o.kind]); break; } }
  DOORS.forEach((d, di) => { if (rectHitCircle(doorRect(d), w[0], w[1], R_W) && doorOpen[di][f] < 0.95) report.doors_crossed_closed.push([f, 'wolfgang', d.id, +doorOpen[di][f].toFixed(2)]); });
  const m = minoPos(f); if (m && minoOn[f]) { const kClose = f - F.minoReveal < 48;
    for (const o of OBST) if (rectHitCircle(o, m[0], m[1], R_M)) report.mino.push([f, o.kind]);
    DOORS.forEach((d, di) => { if (rectHitCircle(doorRect(d), m[0], m[1], R_M) && doorOpen[di][f] < 0.95) report.doors_crossed_closed.push([f, 'mino', d.id, +doorOpen[di][f].toFixed(2)]); }); }
  if (f % 15 === 0) { const th = threadSpan(f); if (th) for (let q = th[0]; q < th[1]; q += 0.2) { const p = posAtS(q);
    for (const o of OBST) if (rectHitCircle(o, p[0], p[1], 0.03)) { report.thread.push([f, o.kind]); break; }
    DOORS.forEach((d, di) => { if (rectHitCircle(doorRect(d), p[0], p[1], 0.03) && doorOpen[di][f] < 0.95) report.doors_crossed_closed.push([f, 'thread', d.id]); }); } }
}
const uniq = a => { const seen = new Map(); for (const [f, k, ...r] of a) { const key = k + (r[0] || ''); if (!seen.has(key)) seen.set(key, { first: f, last: f, n: 0, what: [k, ...r].join(' ') }); const e = seen.get(key); e.last = f; e.n++; } return [...seen.values()]; };
const summary = { dressing_items: DRESS.length, route_m: +LEN.toFixed(1), legs: LEGINFO.map(L => ({ label: L.label, len: +L.len.toFixed(1), s1: +L.s1.toFixed(1) })), leg_speed_scale: legScale,
  pivots: PIVOTS, min_clearance_m: +report.min_clear.toFixed(3), wolfgang_hits: uniq(report.wolfgang), trolley_hits: uniq(report.trolley), mino_hits: uniq(report.mino), thread_hits: uniq(report.thread),
  closed_door_crossings: uniq(report.doors_crossed_closed.map(([f, who, id, o]) => [f, who, id, o])),
  pass: !report.wolfgang.length && !report.trolley.length && !report.mino.length && !report.thread.length && !report.doors_crossed_closed.length };
fs.writeFileSync(path.join(OUT, 'nav_report.json'), JSON.stringify(summary, null, 1));

// ---------------------------------------------------------------- outputs for the renderer
const sub = (arr, k = 1) => Array.from(arr).map(v => +v.toFixed(3));
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify({ version: 'v10-greyblock', dress: DRESS, solids: SOL, doors: DOORS, zones: ZONES, labels: LABELS, route: ROUTE.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]),
  route_s: sub(SL), legs: LEGINFO.map(({ grid, ...L }) => L), anchor: WP.anchor, closet: CLOSET, emerge: EMERGE, emerge_frames: KJ, wall_h: WH, spool_m: SPOOL }));
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ F, pivots: PIVOTS, yaw: sub(YAW), S: sub(S), SM: sub(SM), mino_on: Array.from(minoOn), s_anchor: +sAnchor.toFixed(3),
  door_open: doorOpen.map(a => Array.from(a, v => +v.toFixed(3))), thread: Array.from({ length: N }, (_, f) => { const t = threadSpan(f); return t ? [+t[0].toFixed(2), +t[1].toFixed(2)] : 0; }) }));
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.pass ? 0 : 2);
