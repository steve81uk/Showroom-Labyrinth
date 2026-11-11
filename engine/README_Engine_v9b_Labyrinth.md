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

## v9c: skeletal push walk (2D drawing, bone-driven)

When Wolfgang pushes the trolley side-on, the engine no longer shows a static frame. It uses a `THREE.SkinnedMesh` built from `atlas_map.json` → `rigs.push`:

- **Skeleton:** 16 bones: root, trolley, hip, spine, chest, head, coat, three tail bones, and thigh/shin/foot for each leg.
- **Mesh:** a 6-pixel grid over the drawing with up to 4 weights per vertex. Built offline by `tools/rig_build.py` from three things:
  - region rules;
  - distance to each bone chain;
  - a luminance test that separates the near-black trousers and boots from the mid-grey coat, after an 11-pixel median filter so ink lines don't count.
- **Weight-map check image:** `docs/rig_push_weights.png`.

**Gait:**
- One step every 2 beats, so footfalls land on beats 1 and 3. The 6-frame walk cycles now use the same cadence.
- Leaning-trudge model: each leg swings ±16° about its own drawn angle, in antiphase, so the legs never cross under the coat. A 0.55 rad knee flex lifts the leg that is moving forward, and the feet stay flat.
- 2D forward kinematics solve the hip height every frame so the lowest foot always touches the floor, which gives a natural hip drop on each contact.
- Secondary motion: spine bob, head nod, coat sway, and a tail wave with follow-through lag.
- The trolley bone stays rigid and the hands keep their grip.
- Swing amplitude scales with his actual speed, so standing still holds the drawn pose.

**Applying the changes:** `patch_v9c_skeletal_push.py` is the v9b to v9c change set. After editing joint positions, re-run `python3 tools/rig_build.py --preview` from the folder holding the atlases.

## v9d: cutout rig, real alternating walk (supersedes v9c)

v9c bent the single push drawing, so its legs could never pass each other. v9d replaces it with a proper cutout puppet: three skinned meshes driven by one skeleton.

**Pieces** (built by `tools/rig_build2.py` and packed into free atlas space at y ≥ 2600):
- **`push_body`**: the push drawing with trousers and boots erased. It keeps the torso, coat, arms, tail and trolley. Bones: root, trolley, hip, legs, spine, chest, head, coat, tail0 to tail2.
- **`leg`**: one complete leg (95x265 px) cut from `walk_side[0]`, the straight planted leg. The thigh is hidden under the coat in every pose, so the trouser fabric is extended upward to the hip to give the joint room to rotate. Bones: hip, knee, ankle.
- **Near and far legs**: the same leg mesh used twice, parented to the body's `legs` bone and layered behind the coat. The far leg is tinted to 54% for depth.

**Gait** (one step per 2 beats, footfalls on beats 1 and 3):
- Thighs swing ±27° about a slight backward lean, in true antiphase, so left and right alternate and cross.
- Knee flex (0.8 rad) peaks early in the swing to lift the foot, then extends to reach for the next contact.
- The trailing heel peels before lift-off, and the feet otherwise stay flat.
- Ground solve: the lowest sole sits on the floor. The legs' attach point takes 45% of the height change and the body 55%, which gives the bob.
- The stride scales with real speed (from `S[f]`), so standing still settles back to a neutral stance.

**Check images:** `docs/rig2_cutout_pieces.png` and `docs/walk_rig_v2_strip.jpg`.

**The atlases changed.** Use the new `Master_Sprite_Atlas.png` (sha256 `6343a37e…cbf`) and `Master_Normal_Atlas.png` (`ce00573d…072`) with this `atlas_map.json` (`20c255f3…bf`). The v1 atlases lack the `push_body` and `leg` cells, so on those the engine falls back to the static push frame.

## v9e: face, fluid motion, car park

**Face** (on the cutout push body):
- **Bones:** four new bones (`jaw`, `eye`, `earB`, `earF`), and the body mesh is now 4 px (9,419 vertices).
- **Lip-sync:** the jaw follows the Suno word timings. Each word opens and closes once per estimated syllable (counted from vowel groups), scaled by vocal energy, with a fast attack and a 0.55 release per frame. Maximum jaw drop is 0.5 rad.
- **Mouth:** the mesh is slit along the lip line (31 triangles removed), so the jaw parts from the upper muzzle and shows a dark mouth interior with a tongue. When closed, the slit sits on the drawn mouth line.
- **Blinks** every 2.5 to 5.5 s on a deterministic schedule.
- **Ears:** they flick on the hi-hats and perk up on the kicks. The head tips back slightly with each open vowel.

**Motion:**
- **Camera motion blur:** a pass that blurs along the camera's movement and outward from the centre when it pushes forward (9 samples). It switches off on cuts.
- **Particles:** dust motes drifting in the light indoors, and steam plumes from MINO's exhaust that puff on the kicks.
- **Wheels:** the 3D trolley wheels spin with distance travelled.

**Car park (rebuilt):**
- PBR asphalt with fine aggregate, cracks, a few oil stains and one glossy puddle per 7 m tile.
- Four car body types (hatch, saloon, SUV, van), built from extruded rounded side profiles. Clear-coat paint, dark glass, door pillars, wheels with five-spoke rims, head and tail lights, UK plates (white front, yellow rear), mirrors and contact shadows.
- Painted bays in four rows, tree-lined kerb islands, lamp posts, a trolley shelter with nested trolleys, the DAEDALUS sign with shop-front glazing, a zebra walkway and a cloud-gradient sky.
- A brighter low sun outside.
- Moving extras: a runaway trolley rolling across the lot, and a car reversing out of its bay with reverse lights on.

**Debug flags** (set via `EXTRA_Q`): `&mouth=1` forces the mouth open, `&mouth=0` forces it closed.

## v9f: photoreal car park

- **Backdrop and reflections:** `scene_background.png` comes from the CC0 `mall_parking_lot` HDRI, with the branded mall painted out. It's the outdoor backdrop and the reflection source for paint and glass. Indoors still uses RoomEnvironment.
- **Sun:** the sun light uses the HDRI's measured sun (azimuth 36.0°, elevation 19.6°), so the shadows match the photographed sky. The outdoor shadow area is widened to ±38 m.
- **Cars rebuilt the way real cars are modelled:**
  - a lower shell to the belt line, plus a glasshouse with tumblehome (black trim frame, glass, roof panel, A/B/C pillars);
  - door seams, chrome handles, sills, front and rear bumpers, a honeycomb grille with chrome surround and badge;
  - lensed headlights with running-light strips and indicators, tail lights with reverse lamps (lit when reversing);
  - wipers, roof rails (SUV and van), a shark-fin aerial;
  - lathe-profiled tyres with sidewalls, five-spoke rims, lug nuts, brake discs, coloured calipers, wheel-arch liners;
  - UK plates (white front, yellow rear);
  - clear-coat paint with per-car roughness.
- **CC0 props:** cars under tarps, Victorian street lamps and old tyres (see `docs/THIRD_PARTY_ASSETS.md`).
- **Removed:** my low-poly trees and grey poles, which clashed with the real trees and lamps in the photo.
- **SMAA anti-aliasing** for clean car edges.
- **Debug:** `EXTRA_Q="&cam=px,py,pz,lx,ly,lz,fov"` overrides the camera for close inspection. The engine report now includes `exit_x` and `store_front_z`.

## v9g: real store

- **Furniture:** 36 CC0 Poly Haven models are placed by 8 room kits (bedroom, living, living2, dining, kitchen, office, library, storage), all against walls in the wall-local frame. Each model mesh is one `InstancedMesh`. The current build has 1,377 pieces at a few hundred draw calls whatever the room count. Narrow route cells swap the dining kit for the kitchen kit. If a model is missing, that wall falls back to the procedural box kit.
- **Scanned surfaces:** the floor uses smooth concrete (3 m repeat), the walls white plaster with dark skirting boards, the ceiling ceiling tiles, and the car park worn asphalt. The procedural canvas surfaces remain as fallback.
- **Culling:** furniture instances are bucketed into 3×3-cell spatial tiles (1,119 instanced draws, 20.5 M triangles in total), so the main and shadow passes cull far tiles. One whole-maze InstancedMesh per part defeated frustum culling and cost about 8x render time.
- **Fit-out:** security cameras on every 4th route cell, and a till on a side table at the exit.
- **Hero car:** Khronos CarConcept (CC-BY 4.0) sits in row 0, bay +3. It's off the lamp line at exX ± 5.2, at native orientation. The emblem is hidden and the plate is swapped. A credit is REQUIRED (see `docs/THIRD_PARTY_ASSETS.md`).
- **Story hooks:** the Minoan break tints the furniture materials red, and the chorus-snap unfold scales the furniture with the rest of `staticGroup`.
- **Report fields:** `furniture_models`, `furniture_pieces`, `scanned`, `hero_car`, `furn_sample` (the first room of each kit, for `&cam=` close-ups).
- **Debug cam:** `EXTRA_Q="&cam=px,py,pz,lx,ly,lz,fov"`. It's overridden visually from frame `halfShelf - 75` (6142) onwards by the camera-attached bag plate.
- **WARNING, resume cache:** `--strip`, `--range` and `--master` reuse any PNGs already in `renders/<name>_frames/`. After changing the engine or the assets, delete that folder first, or the output silently mixes old and new frames. A run with a stale cache is very fast (about 8 fps instead of about 0.2 fps); that speed is the giveaway.
