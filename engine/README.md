# Engine v9 procedural preview

This is a browser-based procedural preview for the Showroom Labyrinth timeline. It is not yet the final cinematic renderer and does not yet use the real sprite atlas.

## Run

1. Place `shots/showroom_labyrinth_shots.json` in the repository.
2. Serve this folder with any static server, or open `engine/preview_test.html` directly.
3. The preview runs the full 210,070 ms timeline using procedural stand-ins.

## What it does

- Loads the shot timeline from `../shots/showroom_labyrinth_shots.json`.
- Derives camera, pose, HUD and room state from absolute milliseconds.
- Supports all 12 camera modes in the plan.
- Shows a procedural showroom with corridors, rooms and landmarks.
- Displays HUD objectives and map check-ins.
- Uses clearly labelled placeholder Wolfgang and MINO-7000 stand-ins.
- Exposes `window.renderFrame(frame)` for later headless rendering.

## What it does not do

- Does not use the real sprite atlas yet.
- Does not render audio-reactive movement.
- Does not output a final MP4.
- Does not claim beat alignment or lyric timing.

## Next step

Once the real atlas files are available, replace the placeholder sprites with atlas-driven instances and add audio-reactive parameters.
