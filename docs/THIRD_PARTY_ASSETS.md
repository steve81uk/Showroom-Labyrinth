# Third-party assets

These assets are CC0 (public domain) from Poly Haven (https://polyhaven.com). No attribution is required, but they're credited here anyway. They stay out of git and are in `Bureau_Asset_Pack_v3`.

| Asset | Use | Poly Haven page |
|---|---|---|
| mall_parking_lot (HDRI, 4K) | `scene_background.png`: car-park backdrop and paint/glass reflections. The branded mall front (real trademarks) was painted out by `tools/bg_from_hdri.py --clean-mall`. | https://polyhaven.com/a/mall_parking_lot |
| covered_car (glTF, 2K) | Two cars under tarps in empty bays | https://polyhaven.com/a/covered_car |
| street_lamp_01 (glTF, 1K) | Lamps beside the walkway | https://polyhaven.com/a/street_lamp_01 |
| old_tyre (glTF, 1K) | Tyres by the trolley shelter | https://polyhaven.com/a/old_tyre |

**Deviation from the asset naming rule:** the project rule lists only `audio_master.wav`, the two atlases, `scene_background.png` and `manifest.json`. The `props/` folder is an addition. The engine loads it only if it's there and skips it cleanly if it isn't, so a run without `props/` still renders.

**Layout next to manifest.json:**
- `scene_background.png`
- `props/covered_car/covered_car.gltf` (plus `.bin` and `textures/`)
- `props/street_lamp_01/...`
- `props/old_tyre/...`
