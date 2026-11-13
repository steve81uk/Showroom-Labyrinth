# PROJECT STATE (2026-11-13, Engine v10d)

## Audit: found
- Branch `main`, head `bd8cf99` = `origin/main` at audit time. Repo moved to `steve81uk/Showroom-Labyrinth` (remote URL updated locally).
- Audio: `audio_master.wav` PCM s16le, 48 kHz, stereo, **213.200 s** (not 210.070). SHA-256 in ASSET_INVENTORY.json. No stems.
- Manifest v2: fps 30, 6396 frames, BPM field 179 (engine uses `acoustic.beats_s`), 168 telemetry rows, 12 sections.
- Authored map check-ins: 1 @909, 2 @1490, 3 @2668, 4 @3726 (MAP rows) and 5 @5988 (on an EXT row). Frame 0 MAP row is the intro, not a check-in.
- Three.js 0.169.0, Chromium 1243 headless + SwiftShader, Blender bpy 5.3.0, FFmpeg 6.1.1, Node 22.23. 2 CPU cores, 8 GB RAM, no GPU. Disk ~1.7 GB free.
- Sprite atlas 4096x4096 (+ normal atlas) with walk_front/side/back, actions, mino_turn, push rigs: present but **not used by v10**.

## Audit: what the v1 bake actually was (bd8cf99)
- Lit by an outdoor sun + sky that the Three.js scene does not have.
- Saved as 8-bit PNG/JPG: 30.5 % of floor texels clipped at 255, so not usable as irradiance.
- One shared atlas for floor and boxes; never loaded by any Three.js code. Now in `bureau/bake/v1_deprecated/`.

## Implemented and tested (v10d)
| Item | Evidence |
|---|---|
| Bake v2: ceiling-lamp grid (32 area lights) + dim ambient, irradiance only, EXR half | `bureau/bake/bake_v2.json` |
| Three.js baked display (MeshBasic, lightMap channel 1, intensity PI, linear, no double light) | mean diff 1.6/255 vs Cycles: `bake_compare_sheet.jpg` |
| UV orientation verified by measurement (wrong variants measured at 35.7 and 14.0) | TEST_REPORT.json |
| Independent validator: swept body circle, trolley OBB (SAT), MINO, thread, animated door leaves, leaf vs structure | full song PASS, 0 hits |
| Swing doors fitted (hinge side, direction, pivot inset) after 2 real MINO-vs-leaf clips found | `bureau/door_fit.json` |
| MINO line of sight (walls, tall units, closed doors) for detection and an occluded sensor fan | DEBUG shows LOS; strip 202 clear / 98 blocked |
| Arcade floor-plan map: Wolfgang portrait marker, MINO bull icon, amber thread, live door leaves, trolley | `docs/edit_v10d_3700_3800_3910.jpg` |
| Map/3D correspondence: max error 0.00007 m world, 0.007 px marker over 301 frames | TEST_REPORT.json |
| Contact shadows: labelled blob approximation under Wolfgang, trolley, MINO | DEBUG line "LIGHT" |
| Integrated strip [3700, 4000) 1280x720 DEBUG + map inset | `docs/strip_v10d_contact.jpg`, mkv in working root |

## Not done / failing (see TEST_REPORT.json known_failures_or_gaps)
1. Wolfgang does not wait at doors (door opens 70 frames early). Needs an authored stop.
2. Wolfgang in v10 is a placeholder, not the approved character. Blocking for any master.
3. MINO has no search state after losing sight.
4. Check-in 3 "blip through a wall" and check-in 5 (EXT row) need decisions.
5. Benchmarks at 1920x1080 for dense core, full-screen map, MINO chase: not run.
6. Static props/signs/door frames are not in the bake (lit live).

## Proposed (not started)
Light probes or a baked irradiance grid for actors; wiring the sprite atlas into v10; zone-tint-aware re-bake; re-bake per zone only after cross-zone light paths are checked (lamps light through door openings and over 3.2 m walls are open to the shared ceiling, so zones are NOT independent today).

---
# UPDATE 2026-11-13 evening (Engine v10e). History above is kept as written.

## Checkpoint
- f0c269abfb783a4fedf04024e5f453804d531e8e pushed to `main` (fast-forward from bd8cf99), verified on the remote. That was a backup, not a render approval.
- Repo visibility: **public**. Audio, manifest (lyrics), sprite/normal atlases and atlas metadata are therefore NOT in Git; see ASSET_INVENTORY.json and the handover archive.

## Wolfgang (O4): approved sprite atlas now drives the character
- Audit (bureau/wolfgang_atlas_audit.json): walk_front/side/back x6 frames each, coherent two-step cycles, feet within 1.3 px of pivots, no cell-edge clipping, clean alpha (no dark fringe), normal atlas aligned (mask IoU 1.0) but luminance-embossed, not authored normals.
- Missing in the art: three-quarter walk, left-facing walk (side faces right only), run cycle (single frames only), carry pose for the flatpack bag, push cycle for front/back views.
- Costume inconsistency in the approved art: walk_front and the startle poses have bare paws; side, back and action poses wear shoes.
- Integration: ground-pivoted camera-facing billboard (2.5D, not volumetric); view chosen from camera vs facing (front <50 deg, back >130 deg, else side); walk frame from distance travelled (1.5 m per 6-frame cycle); 3/4 idle poses when stopped; side views with the trolley use the v9 cut-out push rig (approved trolley_push drawing, legs from walk_side) with hands on the drawn cart, amplitude 0 when stopped; tinted by the baked floor irradiance at his feet (not re-lit by live lights); blob contact shadow; thread rises to a fixed right-hip anchor.
- Load gate: missing or wrong-size atlas throws `WOLFGANG ASSET LOAD FAILED`; no placeholder fallback. Placeholder meshes are hidden (the group remains the authoritative transform).
- Known limits: mirrored side view flips the monocle side; front/back views with the trolley show no hand contact (3D trolley ahead); drawn cart shares Wolfgang's depth when he passes behind units; no carry pose so the flatpack bag is withheld after the exit door.

## O1 door wait: done and validated
- ward_serv: stop 2.0 m before the door line, frames 3811-3843 (32 frames, about 1.07 s); door opens 3817 to 3827 (only after he stops plus 6 frames); crossing at 3870.
- Local retime inside [3722, 3933): S unchanged outside, audio and every later cue untouched. Peak speed in the window 4.6 m/s as he breaks into the authored chorus run at 3886.
- Check-in 4 capped at 90 frames (3726-3816) so the wait plays as a locked ground-level side shot.

## MINO search behaviour: done and validated
- States chase / lost / search (120 frames) / patrol, plus an authored `track` state ONLY inside the chorus window [3886, 4841) where the manifest says MINO pursues erasing the thread: it line-follows the visible thread at 2.2 m/s. `TRACK_THREAD=0` gives the strict variant.
- Chase targets the LAST SEEN route coordinate; 8-frame memory grace; 6-frame reaction on reacquire. Sight: 16 m, walls, units >= 1.4 m, doors not fully open.
- Full song: chase 471, lost 167, search 239, patrol 1340, track 955 frames. Validator: no chase without recent LOS, no lost/search past the last-seen point, no last-seen update without LOS, no move over 3 m/s.
- Story consequence: after the Minoan break (4841) MINO searches once and then patrols for the rest of the song; it no longer pursues him into the final chorus. Needs a creative decision.

## O2 / O3
- O2: check-in 3 shows a dashed red "TRACKING ERROR" blip crossing a wall (k 40-100), then reconciles to the real docked MINO at the closet (k 100-130). The blip is small at full frame; judge readability, otherwise omit.
- O3: check-in 5 (EXT row, 5988) shows the arcade map for 60 frames and cross-fades over 18 frames into the 3D overhead rise with matching orientation.

## O5: done
Deleted after verification: bureau/bake/v1_deprecated/{bake.json 134 B, bureau_store.glb 93,284 B, lightmap_ao.jpg 934,514 B, lightmap_diffuse.jpg 690,749 B} (still in history at f0c269a) and working-copy lm_floor_raw.exr 9,665,442 B + lm_solids_raw.exr 13,980,515 B. lm_denoise.py now refuses to re-denoise already-denoised maps.

## Benchmarks (1920x1080, native 30 fps, 2 workers, SwiftShader)
See bureau/bench_1080p30_v10e.json. Character-in shots ran at 1.17 to 1.28 fps (about 0.8 s per frame); about 5 s to encode 100 frames; peak RSS 1.6 GB; about 3.5 MB of PNG per frame on disk. **Native 60 fps is not available**: the authoritative timeline is 30 Hz; 60 requires rebuilding world/timeline at 60 Hz with every frame-count constant converted to seconds. Not done, and no duplicated-frame 60 was produced.
