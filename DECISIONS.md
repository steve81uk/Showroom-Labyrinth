# DECISIONS

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-11-13 | Blender is the bake and asset tool; Three.js renders frames. | Cycles 23.6 to 88 s/frame on 2 CPU cores; Three.js baked display renders in about 0.7 s/frame at 720p. |
| D2 | 2026-11-13 | Lightmaps hold **irradiance only** (Cycles DIFFUSE, direct + indirect, no colour). | Albedo stays in the material and is applied once. |
| D3 | 2026-11-13 | Store surfaces use `MeshBasicMaterial` + `lightMap` (channel 1) with `lightMapIntensity = PI`. | r169 meshbasic: indirectDiffuse += map x intensity / PI, then x diffuse colour. Basic ignores scene lights, so the store cannot be double-lit. |
| D4 | 2026-11-13 | No AO map at runtime. | Indirect irradiance already contains occlusion; AO on top would double-darken. |
| D5 | 2026-11-13 | EXR half float, ZIP, linear (`LinearSRGBColorSpace`), no mipmaps, linear filtering. | v1 8-bit PNG clipped 30 % of the floor. Half-float resave verified lossless to half precision. |
| D6 | 2026-11-13 | One global exposure scale applied to the maps (floor median irradiance factor 0.85). | Light is linear, so scaling the result is exact; lamp power in bake_v2.json is the scaled value. |
| D7 | 2026-11-13 | Lightmap V orientation fixed by measurement, not assumption. | Unflipped glTF uv1 and floor gave mean errors of 35.7 and 14.0; corrected gives 1.6 /255. |
| D8 | 2026-11-13 | Denoise: Gaussian sigma 1.5 texels after the bake. | 64 spp noise visible on walls; bake margin keeps islands far enough apart. Raw maps kept. |
| D9 | 2026-11-13 | Additive "lamp pool" floor decals are hidden in bake mode. | They would add light on top of baked lamp light. |
| D10 | 2026-11-13 | Actors (Wolfgang, MINO, trolley, doors, props) stay live-lit; contact shadows are blob decals, labelled. | Baked store does not receive shadow maps; probes are a later step. |
| D11 | 2026-11-13 | Arcade map draws every marker from the live 3D objects (`localToWorld`), never from its own animation. | Brief rule; verified per frame by the validator. |
| D12 | 2026-11-13 | MAP telemetry rows with an authored `MAP_CHECKIN_n` become full-screen arcade maps; frame-0 intro MAP stays the 3D overhead. | Preserves the five authored check-ins without turning the intro into a map. |
| D13 | 2026-11-13 | Swing door hinge side and swing direction are fitted per door against the whole song; pivot inset 3.5 cm from jamb and wall face. | Old gate only tested door rectangles; real leaf sweeps clipped MINO twice and the hinge corner dug 3 cm into jambs. |
| D14 | 2026-11-13 | Sliding panes may overlap walls. | They retract into wall pockets by design; excluded from the leaf-vs-structure test. |
| D15 | 2026-11-13 | MINO detection requires line of sight (walls, units 1.4 m and taller, doors under 50 % open). | Brief: no seeing through walls. Detection frame stays 3053. |

## Open decisions for Stephen
- O1: Add an authored stop so Wolfgang visibly waits for ward_serv (changes pacing by about 1 s), or accept early-opening doors.
- O2: Check-in 3 "MINO blip passes through a wall": keep as a labelled map glitch, or drop it.
- O3: Check-in 5 on the car park rise: arcade map, 3D rise, or both.
- O4: Wire the approved sprite atlas into v10 (preferred) or approve a new 3D Wolfgang build.
- O5: Delete `bureau/bake/v1_deprecated/` (4 files, 1.7 MB) and noisy `*_raw.exr` in the working root (23.6 MB)?
