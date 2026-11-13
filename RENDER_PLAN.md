# RENDER PLAN

All ranges: startFrame inclusive, endFrame exclusive. fps 30. Timeline offset 0, audio offset 0, simulation pre-roll 0 (every frame is a pure function of its frame number).

| Stage | Range | Settings | Status |
|---|---|---|---|
| 1 Recovery report | n/a | PROJECT_STATE.md | done |
| 2 Blender vs Three.js still | bake camera | 960x540, no tone map | done, mean diff 1.6/255 |
| 3 Integrated strip | [3700, 4000) | 1280x720, bake=1, qa=1, qashot=w3, DEBUG | rendered, world + map tests PASS; door-wait beat missing (O1) |
| 4 Low-cost continuity preview | [0, 6396) | 960x540, bake=1, no DEBUG, 2 workers, chunks of 1500 | waiting for review of stage 3 |
| 5 Final-resolution benchmark | [3886, 3986) chase, [3726, 3826) map, [4600, 4700) dense core, [5802, 5902) exit door | 1920x1080, bake=1 | not run |
| 6 Master + socials | full | 1920x1080, only after STRIP_APPROVED | blocked by O4 (character) |

## Measured so far (2 CPU cores, SwiftShader)
- Strip 1280x720: 300 frames in 117.8 s render wall (2.55 fps, 2 workers), encode 6.0 s, peak RSS 1.22 GB, PNG frames 372 MB, mkv 20.3 MB.
- Bake v2: floor 300.8 s, solids 384.3 s, Cycles reference frame 88.2 s, total 13 min, peak RSS 1.55 GB.
- Disk: about 1.7 GB free. A 1080p full song as PNG frames would need about 17 GB: stage 4/5 must stream (`--pipe`) or render in chunks and delete each chunk's frames after its segment is encoded.

## Not yet assumed
No full-song time estimate is claimed until stage 5 benchmarks the heavy shots at final resolution.
