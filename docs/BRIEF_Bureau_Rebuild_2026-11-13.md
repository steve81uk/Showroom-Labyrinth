Give a fullness this is how it needa to progress for Claude from wherenitncurrentlybis

Here is the **full production brief to give Claude**, starting from where the current render actually is. It tells Claude to stop treating the showroom as a flat shelf collage and rebuild it as a coherent, navigable Bureau & Co. world.

***

# SHOWROOM LABYRINTH — RENDER REPAIR AND REBUILD BRIEF

## Current status

The current render has a fundamental world-building problem:

- Wolfgang walks halfway through shelf displays.
- Wolfgang passes through walls.
- Wolfgang passes through closed doors without them opening.
- The shelves appear to have been rendered as flat background images arranged into a maze.
- The maze visual language reads too closely like Pac-Man.
- There is no consistent sense that Wolfgang is inside a real, navigable showroom.
- The overhead view needs to remain throughout the song so the audience always knows where Wolfgang is.

Do **not** continue rendering from the current version. Preserve it only as a diagnostic reference. Rebuild the world, navigation and camera system first.

## Creative direction

The setting is **Bureau & Co.**, an impossibly vast, bureaucratic homeware showroom in Wolfgang’s Absurd world.

It should feel inspired by the *idea* of a huge Scandinavian-style furniture showroom: room sets, flat-pack furniture, trolleys, aisle signage, a café, returns desk, customer route and exits. It must **not** use the IKEA name, logo, exact brand colours, product names, slogans or a close imitation of its visual identity.

Use an original identity:

- Store name: **BUREAU & CO.**
- Alternative: **THE BUREAU HOME EMPORIUM**
- Primary colour: deep teal-blue
- Secondary colour: muted mustard / amber
- Warning colour: Bureau red
- Neutrals: warm concrete, pale birch, charcoal, soft grey
- Logo: a small black circle containing a keyhole, eye or filing-cabinet icon
- Slogan: **“HOME, ADMINISTERED.”**

The store is familiar enough to be funny, strange enough to be memorable, and physically coherent enough that Wolfgang can genuinely navigate it.

## Core visual rule

**World logic first. Beauty second.**

Wolfgang must be able to walk the entire intended route without visually intersecting any wall, closed door, shelf, trolley, column or major display unit.

If he cannot, the route, collision data or scene layout is wrong. Do not hide it with camera angles, effects or fast editing.

## Required camera system

Use a **continuous overhead Bureau floor-plan camera** throughout the song.

This is the primary camera. It must always make clear:

- Where Wolfgang is.
- Which direction he is facing.
- Where the thread goes.
- Where MINO-7000 is.
- Which aisles and rooms are accessible.
- Where the exit is.
- Which routes are blocked.

It is not a Pac-Man screen. It is a living, cinematic **Bureau & Co. floor plan**, security map, or store-management display.

### Camera behaviour

| Song section | Camera behaviour |
|---|---|
| Intro | The full store plan unfolds; Wolfgang is a small amber marker near the entrance |
| Verse 1 | Camera follows Wolfgang through bedroom and kitchen departments |
| Pre-chorus | The floor plan begins to glitch; routes rearrange; MINO appears |
| Chorus | Camera drops lower and moves faster; the amber thread becomes the brightest element |
| MINO section | Red sensor sweeps across the floor plan; Wolfgang’s route is highlighted |
| Final chorus | The map collapses into one route: thread to exit |
| Outro | The map becomes a car-park plan; the store is revealed as an enormous maze |

The overhead camera should be high but slightly angled, not perfectly vertical. It must show real 3D depth: shelf shadows, lamp pools, corridor perspective, floor reflections and ceiling structure.

## Wolfgang’s overhead identity

Wolfgang must be instantly readable from above.

He is:

- A wolf detective.
- Wearing a dark velvet coat, top hat and wire glasses.
- Carrying a brass lantern.
- Pulling or pushing a trolley.
- Followed by a continuous amber thread.

Do **not** make him:

- A yellow circle.
- A Pac-Man-like mouth.
- A simple dot.
- A pixel-art sprite.
- A generic arcade character.

His overhead silhouette should read as: **wolf + hat + coat + lantern + thread + trolley**.

## MINO-7000

MINO-7000 is the principal pursuer.

It is a bull-headed industrial floor-polishing robot:

- Broad, heavy body.
- Bull horns.
- One large red sensor eye.
- Rotating floor brushes.
- A polished cleaning trail behind it.
- A red proximity warning ring when it detects Wolfgang.
- It follows cleaning routes and cannot pass through walls or closed doors.

MINO should be **comic but genuinely tense**. It is not a ghost. It is an over-serious Bureau appliance that has decided Wolfgang is a floor-care incident.

Do not use multiple colourful ghost characters. Use MINO as the main threat, with perhaps one or two environmental hazards.

## Replace Pac-Man elements

| Do not use | Replace with |
|---|---|
| Yellow circular hero | Wolfgang, wolf detective |
| Colourful ghosts | MINO-7000 and Bureau hazards |
| Pellets / dots | Price tags, shelf labels, receipts, Bureau stamps |
| Power pellet | Thread spool |
| Blue maze walls | Real showroom aisles, room sets and corridors |
| Arcade score | Customer status, receipt or complaint form |
| Ghost eyes | MINO’s red sensor |
| Power-up reversal | MINO is distracted by a malfunctioning trolley or cleaning schedule |

The maze chase remains, but it must feel like **a customer being pursued by an over-zealous store-security system**.

## World layout

Build the showroom as a real 3D environment with a master floor plan.

### Zones

1. **Entrance / Checkout**
   - Revolving or sliding doors.
   - Trolleys.
   - Welcome desk.
   - Huge “BUY ONE SHELF” sign.
   - Checkout desks and receipt printers.

2. **Ariadne Bedrooms**
   - Display beds.
   - Bedside lamps.
   - Wardrobes.
   - Family portraits.
   - Hanging coats.
   - The thread spool / anchor point.

3. **Knossos Kitchens**
   - Worktops.
   - Drawers.
   - Labelled jars.
   - A giant loaf.
   - Price tags.
   - A phone with no dialling tone.

4. **Minos Wardrobes**
   - Wardrobe doors.
   - Mirrors.
   - Clothing rails.
   - Narrow service corridors.
   - MINO-7000’s territory.

5. **Service Corridors**
   - Staff-only doors.
   - Fire exits.
   - Cleaning stations.
   - Delivery cages.
   - Stock rooms.
   - “Customers beyond this point become staff” signage.

6. **The Maze Core**
   - Shelving islands arranged as real aisles.
   - Clear walking space between displays.
   - Aisles that can be navigated.
   - No shelf wall that Wolfgang can walk through.

7. **Exit / Car Park**
   - Sliding doors.
   - Cold night air.
   - Car park.
   - Final bag reveal: half a shelf, with the other half sold separately.

## Scene layers

Every object must belong to one of these categories:

| Layer | Purpose | Collision |
|---|---|---|
| Navigation floor | Where characters may walk | Defines legal movement |
| Solid geometry | Walls, columns, closed doors, heavy units | Blocks movement |
| Interactive geometry | Doors, gates, shutters, wardrobe doors | Opens, closes or moves |
| Large props | Trolleys, display beds, major shelving, counters | Blocks movement |
| Small props | Lamps, boxes, signs, small furniture | May block or be decorative |
| Background | Ceiling, distant signage, wall art, fake windows | No interaction |
| Thread anchor | The display bed where the thread begins | Special interaction |

Shelves are **props arranged around walkable aisles**, not walls made from shelf images.

## Collision requirements

Implement proper collision before adding visual polish.

- Wolfgang needs a capsule or cylinder collision volume.
- Every wall, closed door, column and major display unit needs a collision volume.
- Wolfgang must not pass through solid objects.
- Use small movement steps to prevent tunnelling.
- Doors must have states: `closed`, `opening`, `open`, `closing`.
- If Wolfgang passes through a door, animate it opening.
- If a door is staff-only, it remains closed and Wolfgang routes around it.
- MINO must obey the same collision and navigation rules as Wolfgang.
- MINO must not pass through walls, shelves or closed doors.

## Thread mechanic

The thread is a physical route object, not a decorative overlay.

It must:

- Anchor at the display bed in Ariadne Bedrooms.
- Follow Wolfgang’s actual collision-resolved path.
- Hug the floor.
- Go around shelves, trolleys and obstacles.
- Never pass through walls, closed doors or display units.
- Have a limited length.
- Be reelable back along the same route.
- Record wrong turns as well as correct turns.

The thread is Wolfgang’s evidence, escape route and emotional through-line.

## Wolfgang movement

Do not begin with dramatic animation. Begin with believable locomotion.

Wolfgang must:

- Walk at a consistent speed.
- Turn before changing direction.
- Slow slightly into corners.
- Keep his feet on the floor.
- Push or pull the trolley believably.
- Avoid clipping through the trolley, shelves, walls or thread.
- Stop cleanly rather than sliding.

Then add story actions:

- Notices the thread.
- Picks up the spool.
- Anchors the thread.
- Pushes the trolley.
- Looks back at MINO.
- Finds shelf halves.
- Reaches the exit.
- Opens the bag for the final reveal.

Only after movement is correct should you add fur, cloth, lantern glow, rain, reflections, grain or particle effects.

## HUD design

Replace arcade-style score UI with diegetic Bureau paperwork.

Use sparse, clean, in-world displays:

- `CUSTOMER STATUS: ACTIVE`
- `PURCHASE OBJECTIVE: ONE SHELF`
- `SHELF PARTS: 1 / 2`
- `THREAD REMAINING: 38 m`
- `MINO PROXIMITY: CAUTION`
- `EXIT STATUS: RELOCATED`

The HUD may appear as:

- A receipt.
- A projected floor-plan overlay.
- A trolley-mounted screen.
- Bureau signage.
- A complaint form.

Keep it minimal. It should support the story, not dominate the frame.

## Render pipeline

Render in separate test passes. Do not combine everything into one render.

1. **Navigation test**
   - Grey-block showroom.
   - Wolfgang walks the full route.
   - No clipping through walls, shelves or doors.

2. **Door test**
   - Every required door opens and closes correctly.
   - Staff-only doors remain closed.

3. **Thread test**
   - Thread follows the route.
   - Thread avoids obstacles.
   - Thread reels back correctly.

4. **MINO test**
   - MINO patrols legally.
   - MINO detects Wolfgang.
   - MINO chases without passing through walls.

5. **Lighting test**
   - Warm amber thread versus cold showroom.
   - Clear silhouettes.
   - Readable MINO sensor.

6. **Camera edit test**
   - Full timeline with placeholder characters and simple materials.
   - Overhead camera remains legible.

7. **Final beauty pass**
   - Fur, cloth, rain, reflections, grain, grade and sound sync.

## Acceptance criteria

The rebuild is not complete until:

- Wolfgang can walk the full route without clipping.
- Every wall, door and major prop has correct collision.
- Every door Wolfgang passes through opens.
- MINO cannot pass through walls or closed doors.
- The thread follows a physically possible route.
- The overhead camera always shows Wolfgang’s position.
- The maze reads as a showroom, not Pac-Man.
- The store feels like Bureau & Co., not IKEA.
- The final output is a coherent cinematic world, not a sequence of disconnected shelf images.

## Immediate next task

Create a **grey-block navigation prototype** first:

- A simplified 3D Bureau & Co. showroom.
- Correct floor plan.
- Walkable aisles.
- Solid walls and shelving.
- Functional doors.
- Wolfgang collision capsule.
- MINO patrol route.
- Thread route.
- Overhead Bureau floor-plan camera.

Do not add final textures, fur, rain, particles, music sync or cinematic effects until the grey-block navigation test passes.

***

That is the brief I’d give Claude. It makes the repair priority explicit: **rebuild the world, collision, route and overhead camera before attempting another beautiful render.**

