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

## Not yet done (later passes)

- Floor-plan glitch and route rearranging in the pre-chorus.
- Thread reel-back.
- Wolfgang's final character rig in this world.
- Lighting pass, then the beauty pass.
