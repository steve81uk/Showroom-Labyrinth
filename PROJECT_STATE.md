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
