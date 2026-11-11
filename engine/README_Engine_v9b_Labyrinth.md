# Engine v9b "Labyrinth" (The Showroom Labyrinth)

One file, `labyrinth_renderer.js`: a Node render farm (static server, Puppeteer, FFmpeg) plus the Three.js scene.
Every frame is a pure function of `(frame, manifest.json, atlas_map.json)`. There's no randomness, no clock and no requestAnimationFrame.

## Run (Windows 10, from `engine/`)

```
npm install
set CHROME_ARGS=--use-angle=d3d11
node labyrinth_renderer.js --root ..\assets --spot 400,920,2050,3020    stills with DEBUG overlay
node labyrinth_renderer.js --root ..\assets --strip                     TEST STRIP: frames 1908-2208 (1:03.6-1:13.6), DEBUG on, .mkv
node labyrinth_renderer.js --root ..\assets --master --pipe             full master (needs an empty STRIP_APPROVED file)
node labyrinth_renderer.js --root ..\assets --serve                     live preview, arrow keys scrub
```

`--root` must contain:
- `manifest.json`
- `atlas_map.json`
- `audio_master.wav`
- `Master_Sprite_Atlas.png`
- `Master_Normal_Atlas.png`

Other flags: `--res 1080x1920` (vertical), `--clean` (no HUD), `--quality cpu` (smaller textures and shadows).
Debug URL flags go in the `EXTRA_Q` env var: `&ao=0`, `&noenv=1`, `&nofluo=1`, `&nobloom=1`.
Every encode converts to BT.709 and tags it: AAC 320k and .mkv.

## How the world is built

- **The route sets the maze size.** Wolfgang's distance comes from summing his speed for each sprite state over every frame. A seeded recursive-backtracker maze (15x11) is chosen so the entrance-to-exit route matches that distance at about 7.2 m per cell. Seed 112 gives 59 route cells, 435 m, with the exit at frame 5802. He physically reaches the door when the lyric says so.
- **Story beats come from the manifest.** They're found by regex on telemetry `special_events` (underscores normalised), never hard-coded. Examples: the DAEDALUS box, badge, thread tie, CHORUS SNAP, MINO reveal, erase window, Minoan break, the arrow MINO obeys, the car park and the half shelf.
- **MINO-7000 follows the route** a set distance behind him: 9 m, closing to 4.5 m in chorus 2. In chorus 2 it erases the amber thread.

## Looks

**3D modes (Doom-style 2.5D):**
- Characters are billboard sprites lit by the normal atlas: Doom used sprites in a 3D world too.
- Procedural PBR surfaces (albedo, normal and roughness built in canvas): worn tile floor, painted panel walls with skirting, wood grain, fabric, laminate, acoustic ceiling. World-space UVs keep their real-world scale.
- RoomEnvironment reflections, GTAO ambient occlusion and six fluorescent pool lights; faulty tubes flicker.
- A red alarm beacon sweeps on the beat while MINO hunts.
- Status bar: ARROWS (pellets left), PATIENCE %, a Wolfgang face cropped live from the atlas (glances every 2 bars, startles near MINO, reddens as patience drops), ROOMS, and BOX/THREAD/BADGE keys.
- First-person "weapon": the red trolley handle in his paws, bobbing on the beat.

**Top-down (any camera above 26 m), Pac-Man layer:**
- Neon-blue merged double-outline maze. The yellow arrows become pellets he eats; power pellets sit on the story beats.
- Pac-Wolf has ears and a cyan monocle. MINO is a horned red ghost with a brass nose ring; three staff ghosts patrol.
- 1UP, score, a HIGH SCORE of ASTERION, READY! on each map check-in, and fruit icons for the items collected.
- A glitch flash marks each switch.

**Gags:** kill-feed ticker, achievement toasts, speedrun split timer, the four-poster that flies off on check-in 2, Minoan columns in break 2, and OTHER HALF SOLD SEPARATELY.

## Camera modes

MAP, MAP_ORBIT, SCAN, LOCK, CHASE, CHASE_FAST, CHASE_LOW, SCROLL, TOP_TIGHT, CLOSE, FPV, EXT and BLACK.
- Blend: 14 frames by default, 50 frames on SEAMLESS events.
- Hard cuts into and out of FPV, CLOSE and BLACK.
- The near plane works as a dollhouse cutaway in CHASE and SCROLL.

## Patches

`patch_v9b_doom_pac.py` is the v9a to v9b change set, kept for audit. `labyrinth_renderer.js` already includes it.
