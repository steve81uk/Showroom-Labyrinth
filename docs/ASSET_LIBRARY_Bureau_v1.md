# Absurdity Bureau Asset Library v1

Reusable character and prop assets for every future video. Updated 2026-11-11.

## Where things live
- ElevenLabs flow "Showroom Labyrinth - Wolfgang gap fill + MINO-7000": `qqOf03f5IHlnFcdF8npi`
  (all references, generations and picks are on this canvas; picks are pinned as PICK nodes)
- ElevenLabs workspace library: older Wolfgang sheets (ids below)
- Asset pack zip: `Bureau_Asset_Pack_v1_2026-11-11.zip` (sent to Stephen; keep on PC)
- Sandbox: `/home/claude/showroom/assets/` (does not persist between chats)

## Canonical Wolfgang
Grey-white anthropomorphic wolf, long dark charcoal trench coat, black trousers and boots,
cyan monocle with thin chain on the camera-side eye, bushy grey-white tail with white tip,
clean cel-shaded game-sprite style.

## Engine-ready files (v9 Labyrinth onward)
| File | sha256 (first 16) | Notes |
|---|---|---|
| Master_Sprite_Atlas.png | dacca91b2b6c09e3 | 4096x4096 RGBA, 41 cells, cell height 512 |
| Master_Normal_Atlas.png | 72ae296eabb36702 | Tangent-space, +Y up, same layout |
| atlas_map.json | de8093132e3683502 | Rects, pivots (feet), loop flags, world height, pose names |

Animations in the atlas:
| Name | Frames | Use |
|---|---|---|
| walk_front | 6 | Toward camera |
| walk_side | 6 | Facing right (mirror for left) |
| walk_back | 6 | Away from camera (CHASE from behind) |
| actions1 | 4 | push_wall, palm_strike, coffee, idle |
| actions2 | 6 | trolley_push, run_a, look_down, look_left, tie_thread, startle |
| actions2b | 9 | flatbed_push, run_left, stand_front, startle_b, trolley_push_b, look_down_b, stand_b, tie_thread_b, startle_c |
| mino_turn | 4 | MINO-7000 front, three_quarter, side_right, back |

Run cycle decision: no dedicated 6-frame run. CHASE_FAST alternates run_a and mirrored
run_left on each 8th note (0.1677 s at 178.9 BPM) with engine lean and vertical bob.

## Defect found and fixed: old Master_Sprite_Atlas.png
The pre-2026-11-11 atlas (2364x756, side walk only) was keyed by brightness: only 1% of
pixels were fully opaque, so the coat rendered about 70% transparent (ghosting on light
floors). Its tail was also cropped flat at the cell edge in frames 2 to 5, and the coat
was lighter than the front/back sets. Replaced by a regenerated side walk (EOy2 below).
Lesson: always key on a white background with a border flood fill, never by luminance.

## Source sheets
Existing (ElevenLabs library):
| Asset id | Content |
|---|---|
| bzT37UmA4JFX3c1x3X9M | Front walk, 6 frames, white bg (= project file 1793090073335.jpg) |
| IHgfsyeXgtZQAluAWynG | Actions 1, white bg (= project file 1793090088744.jpg) |
| a9puo3vTwIGZ41JxD2mE | Old side walk, white bg (superseded) |
| bRa1K3O0GkyswrIO9uoq, 3bn27VJ7HZQEaK2tMXve | Front walk, black bg (duplicates) |
| 9yAgzsckZ13VoUEod17D, RxyCn8BCoNl9Wpt8AX4M | Actions 1, black bg (duplicates) |
| OLSLQw5I1afTM8hPQalv | Wolfgang neon portrait (thumbnail/poster use) |
| ZEmxe8pDuUhTuuc9xm5l, KTHXhwidrAwTIw6bJ7Aa | Off-model mood refs |

Generated 2026-11-11, gemini-3-pro-image, 1376x768 each:
| Set | Pick | Others kept | References wired |
|---|---|---|---|
| Back walk | z3OJz6bFeVsFl1YVWrBw | ItRN2VWia4QBHa6DwfQP, S8LcQAPKG4dNhCM8zYr5, sZWLrW3w9juqCd9rZsyC | front walk, old side walk |
| Actions 2 | kYsy11Tvy6FCG5ec8KGT | narZ4dBCEshVg8Q4zsT0 (bonus, packed as actions2b), lkrAjJE715i6u2pvz0LG, 9nDbwDYsUVIJAC9P20vo | actions 1, front walk |
| MINO-7000 | r4Us4NX6DFJi9dwWabZq | vbGoJ37ez7I8KXdZCQmO, aYmN1M2PPgFNZxv8Z27R, Qzj4CKTuqmCA6SsMs1EY | front walk (style/scale only) |
| Side walk v2 | EOy2UTEfQZ76TW1elskN | Q2HfF9vLm79rG8VURzHU, HvNfzgzoGTSAUjQe1An0, bLDZEkUfCbnOxnXcT822 (faces left) | front walk, PICK back walk, old side walk (poses only) |

MINO-7000 design: pale warehouse-yellow and scuffed grey ride-on scrubber body, chrome horn
tubes, brass nose ring, red LIDAR visor, steam exhaust, twin scrub brushes, rear squeegee.

Credits: 41,412 ElevenLabs credits spent (Wolfgang sheets 2,436 each, MINO 1,827 each,
side walk v2 3,045 each). Balance after: 163 of 131,000. Run-cycle generation was
refused for quota and is NOT on the canvas.

## Prompt pattern that works (gemini-3-pro-image)
"Using the attached references: Reference 1 is ... Use it for [identity / colours / pose
only] ... Create ... Layout: one horizontal strip, N evenly spaced frames, clear white gaps
so tails never touch the next figure, feet on a shared baseline, small soft grey oval floor
shadow, plain flat pure white background, no text, no labels, no borders."
Say explicitly what NOT to copy from a flawed reference.

## Tools (in the asset pack)
- `slice_sheets.py sheet out_prefix [--cell-align torso|bbox] [--merge-px N]`
  Border flood-fill key (white fur survives), floor-shadow removal, sealed white pocket
  removal, white de-fringe, auto frame detection in reading order, uniform strip with
  feet on one baseline, JSON pivots. Use --merge-px 1 to 4 for tightly spaced sheets.
- `pack_atlas.py` builds the two master atlases and atlas_map.json from sprites/*.
