#!/usr/bin/env python3
"""Engine v9c patch: skeletal 2D rig (THREE.SkinnedMesh) for the trolley-push walk, built from
atlas_map.json['rigs']['push'] (made by tools/rig_build.py). Also moves all 6-frame walk cycles to one
step per 2 beats (footfalls on beats 1 and 3)."""
import sys
p = 'labyrinth_renderer.js'; s = open(p).read()
def R(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'anchor count {c} != {n}: {a[:80]!r}')
    s = s.replace(a, b)

R("  const mino = new TextureAnimator(1.7, 'mino'); scene.add(mino.root);",
r"""  const mino = new TextureAnimator(1.7, 'mino'); scene.add(mino.root);

  // ---------------------------------------------------------------- SKELETAL RIG: 2D drawing, 3D-style bone animation (SkinnedMesh)
  class SpriteRig {
    constructor(rig) {
      const an = AM.animations[rig.anim], fr = an.frames[rig.frame], [ax, ay] = fr.rect, [pvx, pvy] = rig.pivot;
      this.rig = rig; this.s = (an.world_height_m || 1.95) / AM.cell_h;
      const nV = rig.vertices.length, pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4);
      rig.vertices.forEach(([x, y, z], i) => { pos.set([x - pvx, pvy - y, z * 1.6], i * 3); uv.set([(ax + x) / AM.atlas_w, 1 - (ay + y) / AM.atlas_h], i * 2);
        si.set(rig.skinIndex[i], i * 4); sw.set(rig.skinWeight[i], i * 4); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(rig.index); g.computeVertexNormals();
      this.mat = new THREE.MeshStandardMaterial({ map: atlasTex, normalMap: normalTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82 });
      // bones: rest pose = the drawing. Positions are relative to the parent, in pixels, y up.
      this.B = {}; const P = {}; rig.bones.forEach(([n, par, x, y]) => { P[n] = [x, y]; });
      rig.bones.forEach(([n, par, x, y]) => { const b = new THREE.Bone(); b.name = n; const [px, py] = par ? P[par] : [pvx, pvy];
        b.position.set(x - px, -(y - py), 0); this.B[n] = b; if (par) this.B[par].add(b); });
      this.rest = {}; for (const n in this.B) this.rest[n] = this.B[n].position.clone();
      this.mesh = new THREE.SkinnedMesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
      this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasTex, alphaTest: 0.5, side: THREE.DoubleSide });
      this.mesh.add(this.B.root); this.mesh.bind(new THREE.Skeleton(rig.bones.map(b => this.B[b[0]])));
      this.mesh.scale.setScalar(this.s); this.root = new THREE.Group(); this.root.add(this.mesh); this.root.visible = false;
      // leg geometry (px, y down) for FK ground solve
      this.J = P; const ang = (a, b) => Math.atan2(P[b][0] - P[a][0], P[b][1] - P[a][1]);   // forward-from-vertical
      this.restLeg = { B: ang('thighB', 'footB'), F: ang('thighF', 'footF') };
      this.restThigh = { B: ang('thighB', 'shinB'), F: ang('thighF', 'shinF') }; this.restShin = { B: ang('shinB', 'footB'), F: ang('shinF', 'footF') };
      this.len = { B: [Math.hypot(P.shinB[0] - P.thighB[0], P.shinB[1] - P.thighB[1]), Math.hypot(P.footB[0] - P.shinB[0], P.footB[1] - P.shinB[1])],
                   F: [Math.hypot(P.shinF[0] - P.thighF[0], P.shinF[1] - P.thighF[1]), Math.hypot(P.footF[0] - P.shinF[0], P.footF[1] - P.shinF[1])] };
      this.groundY = Math.max(P.footB[1], P.footF[1]);
    }
    // phase: 0..1 per 2-step cycle (one step per 2 beats); amp 0..1 (0 = standing in the drawn pose)
    pose(phase, amp, f) {
      const B = this.B, TAU = Math.PI * 2, ph = phase * TAU, d2r = Math.PI / 180;
      for (const n in B) { B[n].rotation.set(0, 0, 0); B[n].position.copy(this.rest[n]); }
      // leaning trudge: each leg swings about its own drawn angle, in antiphase (legs never cross under the coat)
      const A = 16 * d2r * amp, K = 0.55 * amp;
      const legTarget = { B: this.restLeg.B - A * Math.cos(ph), F: this.restLeg.F + A * Math.cos(ph) };
      const flex = { B: K * Math.max(0, Math.sin(ph)) + 0.08 * amp, F: K * Math.max(0, -Math.sin(ph)) + 0.08 * amp };
      const ank = {};
      for (const L of ['B', 'F']) {
        const lt = lerp(this.restLeg[L], legTarget[L], amp);
        // thigh rotation so the whole leg points at the target; shin bends back by the flex
        const dThigh = lt - this.restLeg[L] + flex[L] * 0.45, dShin = -flex[L];
        B['thigh' + L].rotation.z = dThigh; B['shin' + L].rotation.z = dShin;
        // toe-off: trailing leg late in stance lifts the heel
        const toe = L === 'B' ? Math.max(0, -Math.sin(ph - 0.6)) : Math.max(0, Math.sin(ph - 0.6));
        B['foot' + L].rotation.z = -(dThigh + dShin) + 0.25 * amp * toe * (L === 'B' ? 1 : -1) * 0;
        // 2D FK (px, y down) to find the ankle height
        const a1 = this.restThigh[L] + dThigh, a2 = this.restShin[L] + dThigh + dShin, [l1, l2] = this.len[L];
        ank[L] = this.J['thigh' + L][1] + l1 * Math.cos(a1) + l2 * Math.cos(a2);
      }
      // keep the lowest ankle on the floor: hip drops at each contact (natural gait bounce)
      const drop = this.groundY - Math.max(ank.B, ank.F);
      B.hip.position.y = this.rest.hip.y - drop;
      // hands stay on the handle: the trolley bone follows the hip's height change only partly (wrist give)
      B.trolley.position.y = this.rest.trolley.y - drop * 0.15 + (f % 4 < 2 ? 0.4 : 0) * env('hats', f);
      // secondary motion
      B.spine.position.y = this.rest.spine.y + Math.cos(ph * 2) * 1.5 * amp;
      B.spine.rotation.z = -0.025 * amp * Math.cos(ph * 2); B.head.rotation.z = 0.035 * amp * Math.sin(ph * 2 + 0.6);
      B.coat.rotation.z = 0.03 * amp * Math.sin(ph * 2 - 0.4);
      B.tail0.rotation.z = 0.10 * Math.sin(ph * 2 - 0.5) * (0.4 + amp); B.tail1.rotation.z = 0.16 * Math.sin(ph * 2 - 1.1) * (0.4 + amp); B.tail2.rotation.z = 0.22 * Math.sin(ph * 2 - 1.7) * (0.4 + amp);
      this.mesh.updateMatrixWorld(true);
      return { drop };
    }
  }
  const pushRig = AM.rigs && AM.rigs.push ? new SpriteRig(AM.rigs.push) : null;
  if (pushRig) scene.add(pushRig.root);""")

# 6-frame walk cycles: one step per 2 beats (cycle = 4 beats)
R("    const walkIdx = Math.floor(((bp % 2 + 2) % 2) * 3);", "    const walkIdx = Math.floor((((bp / 4) % 1 + 1) % 1) * 6);")
R("    const bounce = (anim.startsWith('walk') || anim === 'actions2' && idx === 0) ? Math.abs(Math.sin(beatPos[f] * Math.PI)) * 0.03 : 0;",
  "    const bounce = anim.startsWith('walk') ? Math.abs(Math.sin(beatPos[f] * Math.PI / 2)) * 0.03 : 0;")
# use the rig for the trolley push side view
R("    wolf.root.visible = mode !== 'FPV' && mode !== 'BLACK';",
r"""    wolf.root.visible = mode !== 'FPV' && mode !== 'BLACK';
    const useRig = !!pushRig && anim === 'actions2' && idx === 0 && wolf.root.visible;
    if (pushRig) { pushRig.root.visible = useRig;
      if (useRig) { const st = telAt(f).sprite_state, sp = (S[Math.min(N - 1, f + 1)] - S[Math.max(0, f - 1)]) * FPS / 2;
        const amp = clamp(sp / 1.2, 0, 1);       // standing still holds the drawn pose
        pushRig.pose((((beatPos[f] / 4) % 1) + 1) % 1, amp, f);
        pushRig.root.position.copy(wolf.root.position).setY(0); pushRig.root.quaternion.copy(wolf.root.quaternion);
        pushRig.root.scale.set(mirror ? -1 : 1, 1, 1); pushRig.mat.normalScale.set(mirror ? -1 : 1, 1);
        wolf.root.visible = false; } }""")
R("    if (pacOn) { updatePac(f); wolf.root.visible = mino.root.visible",
  "    if (pacOn) { updatePac(f); if (pushRig) pushRig.root.visible = false; wolf.root.visible = mino.root.visible")
open(p, 'w').write(s); print('patched v9c')
