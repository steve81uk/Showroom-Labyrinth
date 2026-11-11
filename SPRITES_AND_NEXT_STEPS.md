## Current sprite delivery

Generated today with gemini-3-pro-image, four versions each:

- Back walk, 6 frames: monocle chain and tail sway read well.
- Action poses: trolley push, run, look down, look left, tie the amber thread, startled freeze.
- Bonus set: 9 additional poses including flatbed push, a second run, two startles and others.
- MINO-7000 turnaround: yellow-grey scrubber body, chrome horns, brass nose ring, red visor, steam, brushes.
- Side walk v2: replacement for the old broken side walk.

Packed:
- `Master_Sprite_Atlas.png`, 4096x4096, 41 frames
- `Master_Normal_Atlas.png`, 4096x4096, 41 frames
- `atlas_map.json`, records frame positions, foot position, looping and pose names

Packaged:
- `Bureau_Asset_Pack_v1_2026-11-11.zip`, sha256 7aceb6df…, saved locally as the master copy
- `claude/ASSET_LIBRARY_Bureau_v1.md` lists every asset, generation ID, working prompt pattern and spend

## Known issue: the old run cycle was refused

ElevenLabs credit context is unrelated to images but was shared in the session.
- 41,412 credits spent; 163 of 131,000 remain.
- The planned 6-frame run cycle was refused and nothing was charged.
- In fast chase sections, alternate the two run poses every 8th note (0.168 s at 178.9 BPM), with the engine adding lean and bounce.

## Next steps

1. Build engine v9 on these assets.
2. Send a contact sheet of every camera mode before the 300-frame test strip.
3. Pose-label correction: index 1 runs left and index 2 is a front stand, corrected against the contact sheet.

## Keying and packing scripts

The two scripts that key and pack sprites are saved with the library documentation. Key details:
- Border flood fill preserves white fur; fill starts from image edges so interior white fur survives.
- Merge radius 1 gives the correct 6 frames; `--merge-px 0` hits a scipy quirk and is clamped in the script.
- After removing shadows, any white region touching the removed shadow is re-flooded to prevent trapped white pockets between legs.
- Normal maps are generated from sprite shapes so 3D lights catch rims and coat folds.

## Learned from the faulty old atlas

The old Master_Sprite_Atlas.png had been cut out by brightness, so only about 1% of pixels were solid. Wolfgang’s coat would have rendered around 70% see-through on the bright showroom floor. The tail was chopped flat in 4 of 6 frames and the coat was a lighter grey than other views.

## Credits

The prompt for a proper run cycle is saved in the library doc and costs about 2,400 credits once they reset.