# Showroom Labyrinth: creative decisions v2 (11 Nov 2026)

These decisions come from reviewing the external creative notes against the measured manifest. Every lyric timing quoted in those notes matches manifest.json.

## Adopted
- **Spine:** the showroom controls Wolfgang through arrows, maps and instructions. He escapes when he trusts the thread instead.
- **Symbols:** each has its own colour, so it reads even in fast shots.
  - Yellow arrows mean imposed instructions.
  - The amber thread is his own route. It is never yellow.
  - White price tags mean everything gets turned into inventory.
- **Chorus escalation:**
  - Chorus 1: the route stretches and loops. His trolley wheel snags an arrow, which peels up like vinyl with a circuit on its underside, and the circuit races ahead.
  - Chorus 2: rooms move to hunt him, and MINO erases the thread behind him.
  - Final chorus: the arrows detach, hesitate and swarm. He looks down at the thread instead.
- **MINO-7000:** it erases evidence (footprints, a dropped receipt) before its reveal, and its brushes catch his thread at the warning circle. The resolution:
  - Wolfgang lays one arrow in its path.
  - MINO obeys its own store's instruction and turns away.
  - No fight.
- **Map grammar escalates:**
  1. A tidy route.
  2. Rooms move while the "you are here" dot stays fixed.
  3. MINO's blip passes through a wall with no doorway.
  4. A promising window turns out to be a backlit display.
  5. The real store footprint is the maze.
- **Seamless room-to-map rise:** used only twice, at 0:49.7 and 3:19.6.
- **Impossible space:**
  - Establish each room clearly first.
  - Hide the rearrangement behind a curtain or corner.
  - Keep one landmark: the clock stuck at 9:45.
  - Hold one shot long enough for the contradiction to land.
- **Engine structure:** a world graph (the real connections) kept separate from the store map (what the store claims). Both share room IDs, so the deliberate lies never turn into continuity errors.
- **Continuity:** the DAEDALUS flat-pack box goes into the trolley on "Picked a little shelf" (0:36.4, already in the lyric). It becomes the bag in the car park. The final text, "OTHER HALF SOLD SEPARATELY", holds until the bass-hit cut.
- **16th-note timing:** used for tag flicker, wheel sparkle and small light accents only. Cameras never cut on 16ths.

## Corrected or declined
- **Spotify Canvas at 540x960:** this contradicts Spotify's own minimum height of 720 px, which the same notes quote. We deliver 1080x1920 at 30 fps, as for RTTR.
- **Remotion, Theatre.js, GitHub Actions:** not adopted.
  - The Puppeteer, Three.js and ffmpeg pipeline is already frame-deterministic.
  - Remotion adds a licence question.
  - Theatre.js adds hand-keyed curves where we want data-driven ones.
  - Hosted runners have no GPU.
- **pmndrs/postprocessing:** optional. The three.js EffectComposer passes we already use cover bloom, grain and custom shockwave and glitch shaders.

## Asset reality: Master_Sprite_Atlas.png
- **What the atlas holds:** 6 frames, a side-profile walk cycle facing right. Wolfgang wears a trench coat and the cyan monocle.
- **What it lacks:** front and back views, a trolley-push pose and a run cycle.
- **Engine plan:**
  - CHASE becomes a side-trailing three-quarter "2.5D" camera, so the profile reads.
  - Left-facing moves use the mirrored sprite.
  - Running is the same cycle at double rate, with lean and stride stretch.
  - Pushing the trolley: the trolley is 3D and sits in front of his hands.
  - In FPV, only the trolley handle and his gloved paws show; these are modelled procedurally.
- **Optional upgrade:** back, front and push poses from the pose-sheet prompt, sent in as extra atlas strips. The video does not depend on them.
- **One question for Stephen:** this atlas is the trench-coat Wolfgang. RTTR used the top-hat Wolfgang at the desk. The trench coat is the default for this video.
