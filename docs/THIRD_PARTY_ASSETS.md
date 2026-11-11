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

## v9g additions

**Furniture and store fit-out:** 36 CC0 Poly Haven models go in `props/ph/<name>/<name>.gltf`:
GothicBed_01, painted_wooden_nightstand, ClassicNightstand_01, potted_plant_01/02/04, sofa_02, sofa_03, Sofa_01, mid_century_lounge_chair, modern_arm_chair_01, modern_coffee_table_01, coffee_table_round_01, side_table_01, Ottoman_01, dining_table, dining_chair_02, round_wooden_table_01, WoodenChair_01, wooden_display_shelves_01, vintage_microwave, vintage_electric_kettle, metal_office_desk, drawer_cabinet, wooden_bookshelf_worn, Shelf_01, steel_frame_shelves_01/02, worn_metal_rack, cardboard_box_01, industrial_storage_cart, mounted_fluorescent_lights, security_camera_01, CashRegister_01, modern_ceiling_lamp_01, ArmChair_01. Each page is https://polyhaven.com/a/<name_lowercase>.

**Scanned PBR textures (CC0 Poly Haven):** these go in `props/tex/<name>/<name>_{diff,nor,rough,ao}.jpg`.

| Texture | Res | Use |
|---|---|---|
| smooth_concrete_floor | 2k | Showroom floor |
| white_plaster_02 | 1k | Maze walls |
| ceiling_interior | 1k | Ceiling tiles |
| worn_asphalt | 2k | Car-park lot |

**Hero car (CC-BY 4.0, attribution REQUIRED):** `props/car/CarConcept.glb`
- Source: Khronos glTF Sample Assets, "Car Concept" (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept). Licence text is in `props/car/CarConcept_LICENSE.md`.
- Engine changes: the steering-wheel emblem mesh is hidden, and the licence plate is replaced with a fictional UK plate.
- **Put this credit line in the YouTube description:** `"Car Concept" 3D model courtesy of the Khronos Group glTF Sample Assets, licensed CC-BY 4.0.` Check the exact author credit in `CarConcept_LICENSE.md` before release.
- The styling resembles a real-world electric roadster, so it is used as one background gag car, never as a featured product shot.

All of these are optional. If any are missing, the engine falls back to the procedural furniture, procedural surfaces or the modelled car set, per item.
