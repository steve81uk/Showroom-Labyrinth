# Engine v10 "Bureau" (The Showroom Labyrinth, rebuild)

v9 is paused and kept only for reference. v10 rebuilds the world on the rule **world logic first, beauty second**. The work follows `docs/BRIEF_Bureau_Rebuild_2026-11-13.md`.

## Why v9 failed

- **Furniture was never tested against the route.** The v9 shelves were real 3D models, not flat images. Nothing checked their footprints against Wolfgang's route, so wide units sat across his line.
- **The exit door did not exist.** It was a glow plane in front of a solid facade.
- **Floor arrows pointed backwards.** The arrow texture points up the image. Laying the plane flat turned "up" into -z, and the heading rotation then aimed local +z along travel, so each arrow faced the wrong way.

## Pipeline

1. `node bureau_world.js --root ..`
   - Builds the Bureau & Co. floor plan, collision volumes and doors.
   - Solves the route with A* on a 0.2 m clearance grid (radius 0.78 m: Wolfgang plus trolley), then string-pulls it and adds verified corner fillets.
   - Times the route to the song, legwise, so story beats land in the right rooms. He slows into corners.
   - Moves MINO-7000 and lays the thread.
   - Writes `world.json`, `timeline.json` and `nav_report.json`.
   - **Exits non-zero if any collision exists.**
2. `node bureau_render.js --root .. --spot ... | --range a b | --strip`
   - Refuses to render unless `nav_report.json` says `pass: true`.
   - Uses the overhead Bureau floor-plan camera all song.

## Navigation test (current: PASS)

| Check | Result |
|---|---|
| Wolfgang (r 0.42 m) vs walls, props, closed doors | 0 hits |
| Trolley (6 sample points, pickup to car park) | 0 hits |
| MINO-7000 (r 0.62 m), including its A*-solved drive out of the closet | 0 hits |
| Thread vs solids and closed doors | 0 hits |
| Any body or the thread crossing a door less than 95% open | 0 |
| Minimum clearance | 0.79 m |

## Story legs

Walk-speed scale per leg: 0.87, 1.21, 1.00, 1.09, 0.87.

| Beat | Place |
|---|---|
| Entrance and checkout queue | Box pickup at the BUY ONE SHELF stack |
| Thread tied | Ariadne display bed (red) |
| MINO reveal | Kitchens serpentine, then the exit hall (exit shuttered: RELOCATED), then the Minos Wardrobes slalom |
| Chase | Service corridors, staff door into the core |
| Minoan break | The maze core: shelving aisles with real gaps |
| Escape | The exit hall, sliding doors, then the car park |

## Rules implemented

- **Doors** have closed, opening, open and closing states, driven by the agents and by the thread, which jams them open.
- **Staff doors** stay shut for Wolfgang. MINO opens them, because it is staff.
- **The exit shutter** lifts at "lays one arrow".
- **The thread** anchors at the display bed, lies on his collision-resolved route, and is polished away by MINO from the chase onward.
- **The HUD** is a Bureau receipt: customer status, objective, shelf parts, thread remaining, MINO proximity and exit status.
- **Identity:** BUREAU & CO., "HOME, ADMINISTERED.", deep teal, mustard, Bureau red. No third-party marks.

## v10b: story mechanics and lighting test

- **Wrong turn the thread records:**
  - The pre-chorus glitch starts 2.5 s early, with "FLOOR PLAN UPDATING", scrambled arrows and jittering zone labels.
  - A "THIS WAY" sign lures him into a real dead-end pocket between the bedroom displays, which he reaches on the pre-chorus downbeat.
  - He stops, pivots on the spot with the trolley (40 frames), and walks back out.
  - The thread lies along the detour and back. At the chorus snap the store "corrects" itself: arrows realign and the detour's arrows vanish.
  - The pivot is in the collision test: the trolley follows the per-frame heading through the 180-degree turn. Still a PASS.
- **Per-frame heading** (`timeline.yaw`) comes from the world builder, using one-sided tangents near reversals.
- **MINO detection:** a red sensor fan sweeps +-60 degrees (HUD: SCANNING) until Wolfgang is in the beam within 16 m. It then locks on with a limited turn rate (TRACKING, CAUTION, DANGER).
- **Arrows** are instanced. The local arrow points +z, and yaw = atan2(t.x, t.z) maps it onto travel.
- **Lighting test:**
  - a colder showroom;
  - HDR amber thread, lantern flame and sensor eye;
  - UnrealBloom (threshold 0.92);
  - film grain and vignette.
- **Test strip:** frames 1600 to 1900 (glitch, wrong turn, pivot).

## v10c: lyric storytelling, cameras, outfits

- **Lyric set dressing** (`lyric_dressing.js`, 55 items keyed to sung lines, never to frames):
  - Every "Follow the yellow" gets its own FOLLOW THE YELLOW sign where he is when it's sung.
  - Further items: the 9:45 clock and FREE PENCILS, "<- BEDROOMS" / "BEDROOMS ->" (left at the bedroom, right at the same one), the family portrait, the SHORTCUT curtain, the four-poster that takes flight, laid tables, the fake window, the crooked chair, flat-pack on the floor, Kitchen No. 7 with the stone loaf, the phone with no dialling tone, price-tag flip signs, LIFETIME GUARANTEE*, the kettle with yesterday's stain, and the MPV blinking for "car keys in my hand".
  - Props are placed after the route is solved and pass the same collision gate.
- **Signs readable from all angles:** hanging A-frame lightboxes with two printed faces, set across the aisle above the wall tops, lit on their line and then dimming.
- **Camera director:** the manifest camera_mode is the intent, and the overhead floor plan stays the anchor (about 55%).

  | Manifest mode | Shot |
  |---|---|
  | FPV | Wolfgang 1st person |
  | SCROLL | 3rd person side tracking |
  | CHASE_FAST | Cuts on the bar: 2 bars overhead, 1 bar 3rd person, 1 bar behind MINO |
  | CLOSE | MINO POV (red sensor overlay) |
  | CHASE_LOW | Low shot behind MINO |
  | MAP_ORBIT, SCAN | Overhead pans |

  Every ground camera is pulled in along its line of sight so it never enters a wall or prop.
- **Outfits:** the canon wolf (white or silver fur, cyber eye) plus a wardrobe per video. 'velvet' (Case File) is used here; 'noir' (Dream Eater) is also defined. Override with `&outfit=noir`. References are in `docs/ref_wolfgang_*`.

## Not yet done (later passes)

- Thread reel-back.
- Wolfgang's final character rig in this world.
- Lighting pass, then the beauty pass.

## Blender evaluation (2026-11-13)
bpy 5.3.0 headless in the sandbox (2 CPU cores, no GPU), one 960x540 overhead frame of the v10 floor plan (`blender_bench.py`):

| Engine | s/frame | Full song (6396 f) |
|---|---|---|
| Workbench | 2.0 | ~3.6 h |
| EEVEE (software GL, EGL errors) | 88.8 | ~158 h |
| Cycles CPU, 32 spp + denoise | 23.6 | ~42 h (bare geometry) |
| Three.js v10 + bloom | ~0.35 | ~35 min |

Decision: Blender is the asset and lighting tool, not the frame renderer. Plan: bake Cycles GI + AO lightmaps for the static store once, export glTF with lightmaps, render animation in Three.js. Contact sheet: `docs/blender_bench_sheet.jpg`.
