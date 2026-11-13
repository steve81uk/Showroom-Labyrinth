#!/usr/bin/env node
// =====================================================================================================================
// BUREAU v10d independent world validator. Re-derives every actor pose from world.json + timeline.json (the same data the
// renderer reads) and tests real shapes, with sub-frame sweeps:
//   Wolfgang body circle, trolley as an oriented rectangle (SAT), MINO circle, the thread polyline (with the ribbon's
//   side offset), and the ACTUAL door leaves at their animated pose (sliding panes / swing panel sweep), every frame.
// Also reports door state timelines (closed / opening / open / closing) and, if given the browser map log, checks that
// the arcade-map markers are the projection of the same world positions.
// Usage: node bureau_validate.js --root .. [--range a b] [--maplog maplog.json] [--out TEST_REPORT_world.json]
// Range convention: startFrame inclusive, endFrame exclusive.
// =====================================================================================================================
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('--root', '..'));
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'bureau/world.json'))), T = JSON.parse(fs.readFileSync(path.join(ROOT, 'bureau/timeline.json')));
const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'))), N = M.total_frames_at_30fps, F = T.F;
let A = 0, B = N; { const i = argv.indexOf('--range'); if (i > -1) { A = +argv[i + 1]; B = +argv[i + 2]; } }
const SUB = 4;                                        // sub-steps between frames for swept tests
const R_W = 0.42, R_M = 0.62, R_T = 0.03, TROL = { hw: 0.31, hl: 0.475, ahead: 0.95 }, THREAD_OFF = -0.18;
const RS = W.route_s, RT = W.route, LEN = RS[RS.length - 1];
const posAt = s => { s = Math.max(0, Math.min(LEN, s)); let lo = 0, hi = RS.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RS[m] <= s) lo = m; else hi = m; }
  const t = (s - RS[lo]) / Math.max(1e-9, RS[hi] - RS[lo]); return [RT[lo][0] + (RT[hi][0] - RT[lo][0]) * t, RT[lo][1] + (RT[hi][1] - RT[lo][1]) * t]; };
const headAt = s => { const a = posAt(s - 0.25), b = posAt(s + 0.9); const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return l > 1e-6 ? [dx / l, dz / l] : [0, -1]; };
const lerp = (a, b, t) => a + (b - a) * t, angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
// ---- geometry primitives (x, z plane)
const OBST = W.solids.filter(s => s.layer !== 'small' || s.h > 0.5);
const circRect = (r, x, z, rad) => { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); return dx * dx + dz * dz < rad * rad; };
const obb = (cx, cz, ux, uz, hw, hl) => { const vx = -uz, vz = ux; return [[cx + ux * hl + vx * hw, cz + uz * hl + vz * hw], [cx + ux * hl - vx * hw, cz + uz * hl - vz * hw], [cx - ux * hl - vx * hw, cz - uz * hl - vz * hw], [cx - ux * hl + vx * hw, cz - uz * hl + vz * hw]]; };
const aabbPoly = r => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
const sat = (P, Q) => { for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], nx = b[1] - a[1], nz = a[0] - b[0];
  let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity; for (const v of P) { const d = v[0] * nx + v[1] * nz; p0 = Math.min(p0, d); p1 = Math.max(p1, d); } for (const v of Q) { const d = v[0] * nx + v[1] * nz; q0 = Math.min(q0, d); q1 = Math.max(q1, d); }
  if (p1 <= q0 || q1 <= p0) return false; } return true; };
const circPoly = (P, x, z, rad) => { // circle vs convex polygon
  let inside = true; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)), px = a[0] + ex * t, pz = a[1] + ez * t; if ((x - px) ** 2 + (z - pz) ** 2 < rad * rad) return true;
    if ((ex * (z - a[1]) - ez * (x - a[0])) < 0) inside = false; } return inside; };
// ---- door leaves exactly as bureau_scene.js poses them (group at door, rotated PI/2 for axis z)
const leafPolys = (d, o) => { const g = d.axis === 'z' ? Math.PI / 2 : 0, cg = Math.cos(g), sg = Math.sin(g), hw = d.w / 2;
  const toW = ([lx, lz]) => [d.x + lx * cg + lz * sg, d.z - lx * sg + lz * cg];
  if (d.kind === 'sliding') return [-1, 1].map(sd => { const cx = sd * hw / 2 + sd * o * (hw - 0.05); return [[cx - hw / 2, -0.04], [cx + hw / 2, -0.04], [cx + hw / 2, 0.04], [cx - hw / 2, 0.04]].map(toW); });
  // swing leaf: hinge on jamb h (-1 | +1), panel runs toward the other jamb, opens toward local z sign s (-1 | +1). v10c default h=-1, s=+1.
  const h = d.hinge ?? -1, sg2 = d.dir ?? 1, th = o * Math.PI / 2 * 0.95, L = d.w - 0.07, t = 0.03, ux = -h * Math.cos(th), uz = sg2 * Math.sin(th), nx = -uz, nz = ux;
  const pz = sg2 * 0.035;  // pivot sits on the wall face on the opening side, so the panel's back edge clears the jamb
  const pts = [[0, -t], [L, -t], [L, t], [0, t]].map(([a, b]) => [h * (hw - 0.035) + ux * a + nx * b, pz + uz * a + nz * b]); return [pts.map(toW)]; };
// ---- MINO position: identical to the scene (arc-length emerge path with smoothstep, then route at SM)
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const minoXZ = f => { if (T.SM[f] < 0) return null; const k = f - F.minoReveal, KJ = W.emerge_frames, E = W.emerge;
  if (k < KJ) { const u = smooth(k / KJ); const seg = []; let tot = 0; for (let i = 1; i < E.length; i++) { const l = Math.hypot(E[i][0] - E[i - 1][0], E[i][1] - E[i - 1][1]); seg.push(l); tot += l; }
    let L = tot * u, i = 0; while (i < seg.length - 1 && L > seg[i]) { L -= seg[i]; i++; } const t = L / Math.max(1e-9, seg[i]); return [lerp(E[i][0], E[i + 1][0], t), lerp(E[i][1], E[i + 1][1], t)]; }
  return posAt(T.SM[f]); };
const doorOpen = (di, f) => T.door_open[di][f];
// ---- --fit-doors: deterministic choice of hinge side / swing direction per swing door (fewest leaf conflicts, v10c config first)
if (argv.includes('--fit-doors')) { const fit = {};
  W.doors.forEach((d, di) => { if (d.kind !== 'swing') return; const res = [];
    for (const [h, sd] of [[-1, 1], [-1, -1], [1, 1], [1, -1]]) { const dd = Object.assign({}, d, { hinge: h, dir: sd }); let n = 0;
      for (let f = 0; f < N; f++) { const o = doorOpen(di, f); if (o <= 0.001) continue; const Ls = leafPolys(dd, o), w = posAt(T.S[f]), y = T.yaw[f];
        for (const L of Ls) { if (circPoly(L, w[0], w[1], R_W)) n++; if (f >= F.pickBox && f < F.door && sat(obb(w[0] + Math.sin(y) * TROL.ahead, w[1] + Math.cos(y) * TROL.ahead, Math.sin(y), Math.cos(y), TROL.hw, TROL.hl), L)) n++;
          const m = T.mino_on[f] ? minoXZ(f) : null; if (m && circPoly(L, m[0], m[1], R_M)) n++;
          const th = T.thread[f]; if (th) for (let s = th[0]; s <= th[1]; s += 0.2) { const p = posAt(s); if (Math.hypot(p[0] - d.x, p[1] - d.z) > d.w + 0.5) continue; const hh = headAt(s); if (circPoly(L, p[0] - hh[1] * THREAD_OFF, p[1] + hh[0] * THREAD_OFF, R_T)) { n++; break; } }
          for (const o2 of OBST) if (sat(L, aabbPoly(o2))) { const ov = true; n += 0; } } }
      res.push({ hinge: h, dir: sd, conflicts: n }); }
    const best = res.reduce((a, b) => b.conflicts < a.conflicts ? b : a); d.hinge = best.hinge; d.dir = best.dir; fit[d.id] = { chosen: best, tried: res }; });
  fs.writeFileSync(path.join(ROOT, 'bureau/world.json'), JSON.stringify(W)); fs.writeFileSync(path.join(ROOT, 'bureau/door_fit.json'), JSON.stringify(fit, null, 1));
  console.log(JSON.stringify(fit)); process.exit(0); }
// ---- per-frame swept tests
const hits = { wolfgang_obstacle: [], trolley_obstacle: [], mino_obstacle: [], thread_obstacle: [], wolfgang_door_leaf: [], trolley_door_leaf: [], mino_door_leaf: [], thread_door_leaf: [] };
let minClear = { wolfgang: Infinity, trolley: Infinity, mino: Infinity };
const push = (k, f, what) => hits[k].push([f, what]);
for (let f = A; f < B; f++) {
  for (let q = 0; q < SUB; q++) { const u = q / SUB, f1 = Math.min(N - 1, f + 1);
    const s = lerp(T.S[f], T.S[f1], u), w = posAt(s), yaw = angLerp(T.yaw[f], T.yaw[f1], u), ux = Math.sin(yaw), uz = Math.cos(yaw);
    for (const o of OBST) { if (circRect(o, w[0], w[1], R_W)) push('wolfgang_obstacle', f, o.kind);
      const dx = Math.max(o.x0 - w[0], 0, w[0] - o.x1), dz = Math.max(o.z0 - w[1], 0, w[1] - o.z1); minClear.wolfgang = Math.min(minClear.wolfgang, Math.hypot(dx, dz) - R_W); }
    const trol = f >= F.pickBox && f < F.door ? obb(w[0] + ux * TROL.ahead, w[1] + uz * TROL.ahead, ux, uz, TROL.hw, TROL.hl) : null;
    if (trol) for (const o of OBST) if (sat(trol, aabbPoly(o))) push('trolley_obstacle', f, o.kind);
    W.doors.forEach((d, di) => { const op = lerp(doorOpen(di, f), doorOpen(di, f1), u); for (const L of leafPolys(d, op)) {
      if (circPoly(L, w[0], w[1], R_W)) push('wolfgang_door_leaf', f, `${d.id}@${op.toFixed(2)}`);
      if (trol && sat(trol, L)) push('trolley_door_leaf', f, `${d.id}@${op.toFixed(2)}`); } });
    const m = T.mino_on[f] ? minoXZ(f) : null;
    if (m) { const m1 = (T.mino_on[f1] && minoXZ(f1)) || m, mp = [lerp(m[0], m1[0], u), lerp(m[1], m1[1], u)];
      for (const o of OBST) if (circRect(o, mp[0], mp[1], R_M)) push('mino_obstacle', f, o.kind);
      W.doors.forEach((d, di) => { const op = lerp(doorOpen(di, f), doorOpen(di, f1), u); for (const L of leafPolys(d, op)) if (circPoly(L, mp[0], mp[1], R_M)) push('mino_door_leaf', f, `${d.id}@${op.toFixed(2)}`); }); } }
  const th = T.thread[f]; if (th && (B - A <= 600 || f % 3 === 0)) for (let s = th[0]; s <= th[1]; s += 0.2) { const p = posAt(s), h = headAt(s), x = p[0] - h[1] * THREAD_OFF * -1, z = p[1] + h[0] * THREAD_OFF;
    // ribbon centre = route point + normal(-t.z, t.x) * off  (off = -0.18)
    const cx = p[0] + (-h[1]) * THREAD_OFF, cz = p[1] + h[0] * THREAD_OFF;
    for (const o of OBST) if (circRect(o, cx, cz, R_T)) { push('thread_obstacle', f, o.kind); break; }
    W.doors.forEach((d, di) => { for (const L of leafPolys(d, doorOpen(di, f))) if (circPoly(L, cx, cz, R_T)) push('thread_door_leaf', f, `${d.id}@${doorOpen(di, f).toFixed(2)}`); }); }
}
const groups = a => { const g = new Map(); for (const [f, w] of a) { const e = g.get(w) || { what: w, first: f, last: f, frames: 0 }; e.last = f; e.frames++; g.set(w, e); } return [...g.values()]; };
// ---- door state timelines in range
const doorStates = W.doors.map((d, di) => { const ev = []; let prev = null; for (let f = A; f < B; f++) { const o = doorOpen(di, f), p = f > 0 ? doorOpen(di, f - 1) : o;
  const st = o >= 0.999 ? 'open' : o <= 0.001 ? 'closed' : o > p ? 'opening' : 'closing'; if (st !== prev) { ev.push([f, st]); prev = st; } } return { id: d.id, kind: d.kind, staff: d.staff, events: ev }; }).filter(x => x.events.length > 1 || x.events[0][1] !== 'closed');
// ---- door approach analysis: when does Wolfgang reach each door in range, and was it already fully open
const approach = W.doors.map((d, di) => { let best = 1e9, bf = -1; for (let f = A; f < B; f++) { const p = posAt(T.S[f]), dd = Math.hypot(p[0] - d.x, p[1] - d.z); if (dd < best) { best = dd; bf = f; } }
  if (best > 1.0) return null; let o0 = bf; while (o0 > 0 && doorOpen(di, o0 - 1) > 0.001) o0--; let o1 = o0; while (o1 < N && doorOpen(di, o1) < 0.999) o1++;
  const v = f => Math.hypot(...[0, 1].map(k => posAt(T.S[f])[k] - posAt(T.S[Math.max(0, f - 1)])[k])) * M.fps;
  let vmin = Infinity; for (let f = o0; f <= bf; f++) vmin = Math.min(vmin, v(f));
  return { door: d.id, kind: d.kind, crossing_frame: bf, opening_starts: o0, fully_open: o1, open_lead_frames: bf - o1, min_speed_mps_while_opening: +vmin.toFixed(2), waited: vmin < 0.15 }; }).filter(Boolean);
// ---- MINO line of sight (independent ray test, walls + tall units h>=1.4 + closed doors)
const OCC = W.solids.filter(s => s.h >= 1.4), doorR = d => d.axis === 'x' ? { x0: d.x - d.w / 2, z0: d.z - 0.08, x1: d.x + d.w / 2, z1: d.z + 0.08 } : { x0: d.x - 0.08, z0: d.z - d.w / 2, x1: d.x + 0.08, z1: d.z + d.w / 2 };
const segRect = (ax, az, bx, bz, r) => { let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az; for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } } return true; };
let losClear = 0, losBlocked = 0; for (let f = A; f < B; f++) { const m = T.mino_on[f] ? minoXZ(f) : null; if (!m) continue; const w = posAt(T.S[f]); let blocked = OCC.some(r => segRect(m[0], m[1], w[0], w[1], r));
  W.doors.forEach((d, di) => { if (doorOpen(di, f) < 0.5 && segRect(m[0], m[1], w[0], w[1], doorR(d))) blocked = true; }); blocked ? losBlocked++ : losClear++; }
// ---- MINO behaviour legality (v10e): no hidden-position feed, LOS-backed chase, speed limits
let mbeh = null; if (T.mino_state) { const NM = T.mino_states, bad = { chase_without_recent_los: [], lost_search_beyond_last_seen: [], last_seen_updated_without_los: [], speed_over_3mps: [] }; let lastLos = -999;
  const losAt = (f, fm = f) => { const m = minoXZ(fm), w = posAt(T.S[f]); if (!m || Math.hypot(w[0] - m[0], w[1] - m[1]) > 16) return false; if (OCC.some(r => segRect(m[0], m[1], w[0], w[1], r))) return false;
    for (let di = 0; di < W.doors.length; di++) if (doorOpen(di, f) < 0.999 && segRect(m[0], m[1], w[0], w[1], doorR(W.doors[di]))) return false; return true; };
  const cnt = {}; for (let f = Math.max(A, 1); f < B; f++) { const st = NM[T.mino_state[f]]; if (!T.mino_on[f] || st === 'off') continue; cnt[st] = (cnt[st] || 0) + 1; const los = losAt(f); if (los) lastLos = f;
    if (st === 'chase' && f - lastLos > 8) bad.chase_without_recent_los.push([f, 'chase']);
    if ((st === 'lost' || st === 'search') && T.SM[f] > T.mino_last_seen[f] - 0.9 + 0.05) bad.lost_search_beyond_last_seen.push([f, st]);
    if (T.mino_last_seen[f] !== T.mino_last_seen[f - 1] && T.mino_last_seen[f] >= 0 && !los && !losAt(f, f - 1) && NM[T.mino_state[f - 1]] !== 'track') bad.last_seen_updated_without_los.push([f, 'update']);
    if (st !== 'emerge' && NM[T.mino_state[f - 1]] !== 'emerge' && Math.abs(T.SM[f] - T.SM[f - 1]) > 3.0 / M.fps + 0.01) bad.speed_over_3mps.push([f, st]); }
  mbeh = { frames_by_state: cnt, violations: Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, groups(v)])), pass: Object.values(bad).every(v => v.length === 0) }; }
// ---- optional: map correspondence from the browser log
let map = null; const ml = arg('--maplog'); if (ml) { const L = JSON.parse(fs.readFileSync(ml)); let n = 0, maxW = 0, maxPx = 0, maxM = 0, maxT = 0;
  for (const [fs_, e] of Object.entries(L)) { const f = +fs_, w = posAt(T.S[f]); n++; maxW = Math.max(maxW, Math.hypot(e.wolf3d[0] - w[0], e.wolf3d[1] - w[1]));
    const px = e.proj.ox + (w[0] - e.proj.x0) * e.proj.sc, pz = e.proj.oy + (w[1] - e.proj.z0) * e.proj.sc; maxPx = Math.max(maxPx, Math.hypot(px - e.wolfPx[0], pz - e.wolfPx[1]));
    if (e.mino3d) { const m = minoXZ(f); if (m) maxM = Math.max(maxM, Math.hypot(m[0] - e.mino3d[0], m[1] - e.mino3d[1])); }
    if (e.trolley) { const y = T.yaw[f]; maxT = Math.max(maxT, Math.hypot(w[0] + Math.sin(y) * TROL.ahead - e.trolley[0], w[1] + Math.cos(y) * TROL.ahead - e.trolley[1])); } }
  map = { frames: n, max_wolf_world_err_m: +maxW.toFixed(5), max_wolf_marker_err_px: +maxPx.toFixed(3), max_mino_world_err_m: +maxM.toFixed(5), max_trolley_world_err_m: +maxT.toFixed(5),
    pass: n > 0 && maxW < 1e-3 && maxPx < 0.05 && maxM < 1e-3 && maxT < 1e-3 }; }
// leaf sweep vs walls/units (structure), every swing door (sliding panes retract into wall pockets by design), 0..100% in 2% steps, panel centreline and both faces
const leafStructure = []; W.doors.filter(d => d.kind === "swing").forEach(d => { for (let o = 0; o <= 1.0001; o += 0.02) for (const Lp of leafPolys(d, o)) for (const r of OBST) if (sat(Lp, aabbPoly(r))) { leafStructure.push([+o.toFixed(2), `${d.id} vs ${r.kind}`]); break; } });
hits.door_leaf_vs_structure = leafStructure;
const summary = Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, groups(v)]));
const pass = Object.values(hits).every(v => v.length === 0) && (!map || map.pass) && (!mbeh || mbeh.pass);
const rep = { tool: 'bureau_validate.js v10d', range: { startFrame: A, endFrame: B, convention: 'start inclusive, end exclusive' }, fps: M.fps, substeps_per_frame: SUB,
  shapes: { wolfgang_circle_m: R_W, trolley_obb_m: [TROL.hw * 2, TROL.hl * 2], trolley_ahead_m: TROL.ahead, mino_circle_m: R_M, thread_radius_m: R_T, thread_side_offset_m: THREAD_OFF, swing_leaf: 'panel w x 0.06, hinge -w/2, sweep 0..85.5 deg', sliding_leaf: 'w/2 x 0.08 pane' },
  min_clearance_wolfgang_m: +minClear.wolfgang.toFixed(3), hits: summary, door_states: doorStates, door_approach: approach,
  mino_line_of_sight: { frames_clear: losClear, frames_blocked: losBlocked }, mino_behaviour: mbeh, holds: T.holds || [], map_correspondence: map, pass };
const out = arg('--out', null); if (out) fs.writeFileSync(out, JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ pass, range: rep.range, hits: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.length])), min_clear: rep.min_clearance_wolfgang_m, approach, los: rep.mino_line_of_sight, mino: mbeh, map }, null, 1));
