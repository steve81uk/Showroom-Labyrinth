# Build status

This commit adds shot data transcribed from the user's pasted Showroom Labyrinth plan and a standard-library Python timeline validator. It does not deliver a working engine or rendered music video.

## Timing correction

Earlier rejected upload drafts treated minute:second values as decimal seconds. Example: 1:18.23 is 78,230 milliseconds, not 118,230. The terminal black-cut event is 210,070 milliseconds (3:30.07), not 290,070. No five-minute duration or extra black tail is specified by the source. The source has 59 rows: 58 shot intervals and one terminal cut event. These timestamps have not been checked against the new recording. The 176 versus 178.9 BPM discrepancy remains unresolved.

## Approval-loop diagnosis

Earlier requests bound approval to a literal placeholder sentence, then attempted to write different JSON content. That mismatch caused repeated write rejection. Do not upload the placeholder as JSON. Batch approvals must show the exact files and content used by push_files.

## Implemented in this commit

- Corrected compact shot data with explicit columns and terminal event.
- scripts/validate_manifest.py checks row structure, increasing timestamps, camera modes and terminal bounds.
- This status record.

## Not delivered or independently verified

- Engine v9 implementation, renderer and integration with the prior engine.
- Sprite PNGs, normal atlas, atlas_map.json and the asset ZIP. Their descriptions are user-reported; their bytes and complete SHA-256 have not been inspected here.
- Audio file for this new track, audio hash, beat alignment and lyric timing.
- Camera contact sheet, 300-frame test strip, full master and social exports.

Existing README.md, ENGINE_SPEC_V9.md and SPRITES_AND_NEXT_STEPS.md are documentation, not proof that their described engine features or assets are present. This commit leaves those existing files unchanged. The earlier statement that ElevenLabs credits were unrelated to images was not verified and should not be relied on. No paid generation, cloud rendering or background job is started by this commit.

## Data use

For each row, pair values with columns. End each interval at the next row's startMs; end the final interval at terminalEvent.timeMs. The black cut is an event, not an invented extra shot duration. Run the validator with Python 3; no additional packages are required. Runtime tests and renderer compatibility are not claimed.

## Verified state (engine v9c, 2026-11-11, Claude session)

This section was added after inspecting real files. It does not change the shot data above.

- **Audio:** `audio_master.wav` is the Suno WAV download (clip bff0ed1e). It is 48 kHz s16 stereo, 213.2 s, -15.9 LUFS integrated and -4.0 dBTP true peak. sha256 `eef852af2cc3e2c1cb888f27a2a399442e5791846412916daaec9857baf5b5c0`.
- **BPM:** settled at 178.9, measured from the audio. The Suno beat grid gives 178.9 and librosa (hop 480) agrees, so 176 was the brief's value, not the track's. The engine times everything from `acoustic.beats_s` in `assets/manifest.json`, never from a BPM constant.
- **Atlases (v2, current):** `Master_Sprite_Atlas.png` (sha256 `6343a37ee8f7a361…cbf`) and `Master_Normal_Atlas.png` (sha256 `ce00573d92106c07…072`). Both are 4096x4096: the 41 original cells plus the `push_body` and `leg` cutout cells. The v1 atlases (`dacca91b…`, `72ae296e…`) are superseded. They stay out of git per `.gitignore`. The v2 set is in `Bureau_Asset_Pack_v2_2026-11-11.zip` (atlases, atlas_map.json, rig and pack tools).
- **atlas_map.json:** carries `rigs.push_body` (body, 11 bones) and `rigs.leg` (3 bones, used twice). Together they make the v9d cutout walk. The v9c single-mesh `rigs.push` is removed.
- **Rendered and checked:**
  - Spot-still contact sheets for every camera mode.
  - The 300-frame test strip (frames 1908 to 2208), 1920x1080 at 30 fps, BT.709, AAC 320k, .mkv. Decoded clean.
  - 90-frame push-rig motion tests (frames 1680 to 1770) for v9c and v9d.
- **Not done yet:** test-strip approval, the full master, social exports. Lyric timing comes from Suno's word alignment and hasn't been checked by hand.
- **Two engines:** `engine/main.js` and its modules are the procedural placeholder preview. `engine/labyrinth_renderer.js` is the production renderer: deterministic, atlas-driven, and the one that produced every file above.

## 2026-11-11: engine v9g, real store

- 36 CC0 furniture models (1,452 pieces), instanced in 3×3-cell tiles. Scanned floor, wall, ceiling and asphalt. CC-BY hero car.
- Test strip re-rendered at 1080p (frames 1908 to 2208), sent for approval. Contact sheet: `docs/strip_v9g_contact.jpg`.
- Asset pack v4: `Bureau_Asset_Pack_v4_2026-11-11.zip` (sha256 `0c2a5945…`), 122 MB.
- Before release: verify the CarConcept credit and check that the star wheel centres are not a Khronos mark.
- Master not started; it waits on strip approval.
