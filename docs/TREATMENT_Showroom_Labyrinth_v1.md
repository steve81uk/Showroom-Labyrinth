# THE SHOWROOM LABYRINTH: treatment v1 (11 Nov 2026)

The Absurdity Bureau. Engine v9 "Labyrinth". YouTube-first. Two cuts are planned: Clean (no lyrics) and Lyric (karaoke captions).

## Logline
Agent Wolfgang walks into DAEDAL, a flat-pack megastore, to buy one shelf. The store is a procedurally generated labyrinth. The yellow floor arrows are a lie. A bull-horned robot floor scrubber patrols the rugs. A loose thread from his own coat cuff is the only way back out.

## The song's facts (from Suno, measured)
- **Tempo:** 178.9 BPM grid, played as an 89.5 BPM half-time feel. E minor, 4/4, 3:33.
- **Ending:** the tempo stretches at the end (outro rubato from 199 s), then a 6-beat bar, then a hard cut on one distorted bass hit at about 210 s.
- **Section map:**

| Time | Section | Feel |
|---|---|---|
| 0:00 | Intro | Dark neo-soul, sung hook |
| 0:35 | Verse 1 | Fast double-time rap |
| 0:56 | Pre-chorus | Rising sung melody |
| 1:08 | Chorus 1 | 176 BPM neurofunk-rock |
| 1:39 | Verse 2 | Half-time pitched rap |
| 1:56 | Break 1 | Stripped neurofunk rap |
| 2:10 | Chorus 2 | Full breaks |
| 2:41 | Break 2 | 8 bars of reeds and harpsichord glitch |
| 2:55 | Final chorus | |
| 3:20 | Outro | Rhodes, hard cut |

- **Lyric timing:** all 648 words, word by word, from Suno's alignment.

## Note on the Minotaur
The song already has one. "Bull-headed floor cleaner guarding the throws / Red little sensor where the hot breath goes", and "Horn in the doorway" in Break 2. So the Minotaur is canon, not an invention:

- **MINO-7000:** an autonomous floor scrubber.
  - Chrome horn tubes and a dented brass nose ring.
  - A single red LIDAR eye, and steam from its exhaust on every kick drum.
  - It squares up sideways to block a corridor (Verse 2), polishes a warning circle round Wolfgang's feet, and charges on the chorus snaps.
  - It is never violent. It is a machine politely enforcing the route.

## World: DAEDAL Home & Living (invented)
- **The chain is ours, not a real store's.** The colours are cream, ochre-yellow and Bureau teal. No blue-and-yellow pairing, no real brand names, no real product names.
- **Products are named after the myth:**
  - MINOS wardrobe
  - KNOSSOS kitchen (number 7, with the stone loaf)
  - ARIADNE throw
  - ICARUS ceiling lamp, which melts on the final chorus
  - DAEDALUS flat-pack shelf, the thing he came for
  - THESEUS trolley
- **Room sets repeat with tiny errors:** the same family portrait in every bedroom, nobody aging, and the clock in every room stuck at 9:45.

## Camera grammar (the game idea)
Five camera modes. Each is a pure function of the frame number, eased with smoothstep or cubic Bézier, and switched on section boundaries or lyric anchors.

1. **MAP: top-down maze.** An orthographic camera over the real generated labyrinth. The path walked so far draws as Wolfgang's red thread, and the exit glows far away. It returns 5 times, as "map check-ins", each showing less distance left (or more, as a joke). Check-ins land on:
   - the intro end, around 0:22
   - the pre-chorus, around 0:56
   - after chorus 1, around 1:39
   - Break 1, around 1:56
   - the outro, around 3:20, where the map folds into his own small flat
2. **SCAN: the opening swoop.** The map camera tilts and descends, then scans along the corridors until it locks onto Wolfgang at his trolley. The intro hook "Follow the yellow / Follow the bend" lands on that lock.
3. **CHASE: third person, game style.** Over the shoulder, a slight lag, and the trolley wheel squeaking on the snare. Used for the rap verses.
4. **SCROLL: side-on.** A long dolly past cut-away room sets, like a platformer. Used for the pre-chorus and Break 1, where the "Keep the pencil / Keep the plan" lists appear as items floating into an inventory bar.
5. **FPV: first person at junctions.** Looking down at the yellow arrow on the floor, with the eyes snapping left and right on beats 2 and 4 to glance at products, price tags and dead-end mirrors. Every lyric junction ("Left at the bedroom / Right at the same one", "Round another corner / Past another door") is a real junction in the maze.

## HUD (diegetic, game style)
- **Top left:** the objective line, "OBJECTIVE: BUY 1 SHELF". It updates to "ESCAPE" on chorus 1, then "FIND OWN ROOM" on the final chorus.
- **Top right:** a minimap with the thread length in metres and the distance to the exit.
- **Bottom:** an inventory bar (pencil, tape, tiny diagram, thread, a key that never fits, the mug "that works yet"). Items appear as the lyrics name them.
- **Right edge:** a MINO-7000 proximity meter, which pulses with the kick envelope.
- **Badge gag:** after "my badge says permanent assistant to the shelving", his name badge in the HUD actually changes.
- **Strict-clean variant:** for any future store delivery, the HUD is drawn without text glyphs, using icons only. That is the RTTR lesson, built in from the start.

## Set-pieces mapped to the music
- **Chorus snaps to 176 BPM:**
  - camera speed doubles
  - corridors shear into motion-blur light tunnels
  - a Reese-bass shockwave ripples the floor arrows
  - MINO-7000 charges
- **"A four-poster took flight":** the bed lifts off on its own and flies over the maze in MAP view.
- **"Turn a price tag / find a second underneath / then a third with my measurements":** FPV close-up, with tags flipping on 16th notes.
- **Break 2 (exactly 8 bars, reeds and harpsichord glitch-trap):**
  - The whole store turns Minoan: fresco walls, bull-leaping silhouettes, labrys double-axe shapes in the shelving.
  - A datamosh and pixel-sort shader glitches on the harpsichord stabs.
  - The four rap bars are FPV; the four sung bars are a slow MAP orbit.
- **Final chorus:**
  - the ICARUS lamps melt
  - the yellow arrows peel off the floor and fly as a swarm toward the exit
  - Wolfgang follows the thread instead of the arrows
- **Outro:** the sliding door opens onto his own scratched floor and one crooked chair. A hard cut on the bass hit.

## How we build it (code)
- **Maze:** a seeded generator (recursive backtracker or Wilson's algorithm) on a 24x24 grid. The route is planned so the lyric junctions fall on real turns, by fitting path length to the timing: corridor lengths are solved so each named turn arrives on its word.
- **Path and camera:** A* finds the true route. The yellow arrows follow a deliberately wrong route (they are the lie). The thread is a TubeGeometry along a Catmull-Rom curve that grows with each frame.
- **Rendering:**
  - instanced meshes for the furniture
  - ShaderMaterial floors (arrow decals, Reese ripples)
  - EffectComposer passes: bloom, grain, plus a custom datamosh and pixel-sort pass for Break 2
- **Wolfgang:**
  - the existing atlas, as a billboard sprite with a normal map, lit by real point lights
  - front, side and back walk cycles chosen by camera angle
  - steps locked to the 89.5 BPM half-time beats
- **Audio data:**
  - librosa beats, onsets, kick and Reese envelopes, at 30 fps
  - Suno's word timings for captions and junction anchors
  - Suno stems (the vocal stem) are optional, at 10 credits, and not needed
- **Two cuts from one render:**
  - The engine renders the Clean master once.
  - The Lyric cut is the same frames, with karaoke captions burned in by ffmpeg (ASS \k per-word highlights).
  - That makes the lyric test cheap: if the fast rap reads badly, captions can switch to line-only during the raps.
- **Output:** 1920x1080, 30 fps (6,396 frames), BT.709 tagged. Masters are .mkv, and the YouTube file is H.264 with AAC 320k. No ProRes unless a store is ever wanted.

## Gates
1. **Phase 0:** audio download, then the manifest with measured beats, words and sections. Stephen approves.
2. **Engine v9 and stills:** a contact sheet of every camera mode and set-piece.
3. **Test strip:** 300 frames over the chorus-1 snap (1:05 to 1:15). Stephen approves.
4. **Master render:** Clean, then the Lyric burn-in, then social cuts, Canvas and thumbnail.
5. **Album:** after the video. "Showroom" with this track as the anchor.
