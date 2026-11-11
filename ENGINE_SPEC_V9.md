# Engine v9 specification

## Core principle

Every frame is derived from absolute timeline position. Preview, scrub and full render reach identical states.

## State

```ts
export interface EngineState {
  timeMs: number;
  shotId: string;
  cameraMode: CameraMode;
  wolfgang: SpriteInstance;
  mino7000: SpriteInstance;
  thread: ThreadPath;
  arrows: ArrowField[];
  hud: HUDState;
  worldGraph: RoomGraph;
  storeMap: StoreMap;
  postProcess: PostProcessState;
}
```

## Shot state

`evaluateShotState(timeMs, shots, audio)` resolves the active shot and matching audio cue. It validates no gaps or overlaps and resolves camera mode, prop ownership and thread anchor.

## Sprite atlas

- `Master_Sprite_Atlas.png`, 4096×4096, 41 frames
- `Master_Normal_Atlas.png`, 4096×4096, 41 frames
- `atlas_map.json`: frame positions, foot position, looping and pose names

## Poses

Back walk (6 frames), trolley push, run, look down, look left, tie the amber thread, startled freeze, flatbed push, second run, two startles, side walk v2.

MINO-7000 has views, not a walk cycle. It glides, with spinning brushes, steam and visor sweep added in code.

## Fast chase run cycle

At 178.9 BPM, an eighth note is 0.168 seconds. Alternate the two run poses every 8th note; the engine adds lean and bounce.

```ts
export function chaseRunPose(timeMs: number, poses: string[]): string {
  const eighthMs = 168;
  const index = Math.floor(timeMs / eighthMs) % poses.length;
  return poses[index];
}
```

## Thread continuity

Store segment history so the thread does not reconnect differently when the camera changes.

## World graph vs store map

Maintain two separate graphs with shared room IDs:
- `logicalNeighbors`: where rooms really connect
- `mapNeighbors`: what the showroom claims is true

## Post-processing

Selective bloom, depth of field, controlled grain, warm window key, cold fill, neon rim, aberration and grading as named states—not always-on effects.

## Build order

1. Place atlas files in `assets/`.
2. Run `validate_manifest.ts`.
3. Generate contact sheet of every camera mode.
4. Run 300-frame test strip.
5. Render full master only after test strip passes.
