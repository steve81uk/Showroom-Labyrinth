# Showroom Labyrinth

Music video engine and production repository for the Wolfgang showroom labyrinth video.

## What this repo holds

- Engine v9 specification and frame-driven shot state
- Sprite atlas delivery notes and pose names
- Shot plan from the manifest
- Build scripts for validation, music cues, room graph and packaging
- Delivery specification for TikTok, Instagram Reels, YouTube Shorts and Spotify Canvas

## Current sprite delivery

- `Master_Sprite_Atlas.png`, 4096×4096, 41 frames
- `Master_Normal_Atlas.png`, 4096×4096, 41 frames
- `atlas_map.json`, records frame positions, foot position, looping and pose names
- Packaged in `Bureau_Asset_Pack_v1_2026-11-11.zip`, sha256 `7aceb6df…`

Place your atlas files in `assets/` before running the engine.

## Pose names

Back walk (6 frames), trolley push, run, look down, look left, tie the amber thread, startled freeze, flatbed push, second run, two startles, side walk v2.

## Next steps

1. Add your sprite atlas files to `assets/`.
2. Run `validate_manifest.ts` to check shot gaps, overlaps and missing assets.
3. Generate the contact sheet of every camera mode.
4. Run the 300-frame test strip.
5. Render the full master only after the test strip passes.
