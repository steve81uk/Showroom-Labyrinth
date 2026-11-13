# START HERE: The Showroom Labyrinth (Bureau & Co.)

Code-driven music video. Engine v10 "Bureau" (Three.js r169 in headless Chromium, Blender for baking, FFmpeg for output).
Read in this order: `PROJECT_STATE.md`, `DECISIONS.md`, `RENDER_PLAN.md`, `TEST_REPORT.json`, `ASSET_INVENTORY.json`.

## What is NOT in GitHub
`audio_master.wav`, `manifest.json`, the sprite atlases, `world.json` / `timeline.json` (regenerated), noisy raw bakes, rendered frames and videos.
Verify a new workspace against the SHA-256 values in `ASSET_INVENTORY.json` before trusting any timing.

## Track root layout (working copy)
```
<track>/audio_master.wav  manifest.json  atlas_map.json  Master_Sprite_Atlas.png  Master_Normal_Atlas.png
<track>/bureau/   = this repo's bureau/ folder (scripts, bake/, assets/)
<track>/engine/node_modules/three (0.169.0), puppeteer
```

## Pipeline (each step fails loudly; the renderer refuses to run if a gate is missing)
```
cd <track>/bureau
node bureau_world.js --root ..                      # layout, routes, doors, thread, MINO -> world.json, timeline.json, nav_report.json
node bureau_validate.js --root .. --fit-doors       # chooses hinge side / swing direction per swing door -> world.json, door_fit.json
node bureau_validate.js --root .. --out TEST_REPORT_world_full.json   # independent swept test; must print "pass": true
python3 blender_bake_v2.py .. 2048 64               # ~13 min on 2 CPU cores -> bake/solids.glb, lm_*.exr (+ Cycles reference still)
python3 lm_denoise.py bake 1.5                      # Gaussian denoise, keeps *_raw.exr
export CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome CHROME_ARGS="--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader"
EXTRA_Q='&bake=1' node bureau_render.js --root .. --compare --res 960x540 --out bureau/bake   # baked vs Cycles check
EXTRA_Q="&bake=1" node bureau_render.js --root .. --range 3650 3950 --res 1280x720 --debug --out renders/v10e_strip
node bureau_validate.js --root .. --range 3650 3950 --maplog renders/v10e_strip/*_maplog.json --out TEST_REPORT_strip_3650_3950.json
```
URL flags: `bake=1` baked lighting, `qa=1` map inset + QA framing, `qashot=<shot>` force camera, `debug=1` overlay, `cmp=1`/`--compare` bake validation, `lmflip=1` invert lightmap V (diagnostic only).

## Rules that bind every session
No publishing, credit spend or `git push` without showing the exact action and getting approval. No deletions of source, approved renders or reproduction caches; propose exact deletions first. No real brands. Map positions always come from the 3D objects. No master render before the integrated test is approved. Agent Lily material stays out of this repo.

## Private assets (not in this public repo)
`audio_master.wav`, `manifest.json`, `Master_Sprite_Atlas.png`, `Master_Normal_Atlas.png`, `atlas_map.json` must be placed in the track root from the handover archive (`Showroom_Labyrinth_private_assets_2026-11-13.tar`, SHA-256 dd166b89...b77). Verify against ASSET_INVENTORY.json. The renderer refuses to run without the atlas (no placeholder fallback).
Variants: `TRACK_THREAD=0 node bureau_world.js` gives the strict MINO (no authored thread tracking).
