# Asset manifest

153 production PNGs and two separately stored sample exports. Eight character sheets contain 320 aligned frames. The floor atlas is counted as one packaging image in addition to its twelve individual tiles. All assets are original AI-generated paintings, painted-material derivatives, or explicitly identified deterministic ink glyphs.

Machine-readable source of truth: `apps/client/public/assets/manifest.json`. Exact source prompts: `docs/art/generation-sources.json`. Rebuild and integration instructions: [INTEGRATION.md](INTEGRATION.md). Licensing: [LICENSE.md](LICENSE.md).

## Production counts

| Category               | PNG files |
| ---------------------- | --------: |
| environment/floors     |        12 |
| environment/walls      |        20 |
| environment/doors      |        12 |
| props                  |        17 |
| environment/structures |        10 |
| characters             |         8 |
| artifacts              |        10 |
| ui                     |        16 |
| puzzles                |        47 |
| tilesets               |         1 |

## Rendering and coverage

- 64 × 32 floor diamonds, 64 × 64 logical grid; object artwork uses 2× density at display scale 0.5. All anchors below are raster pixels; footprint sizes are logical units.
- X/Y wall and door orientations follow the logical axes. Walls include 24/32/38 heights and exact partial-length pieces matching the current map. Door leaves use fixed canvases, anchors and hinges across open/closed states; indicators and openings are separate.
- Characters: four designs, two teams, eight headings, one idle and four walk poses per heading. Five native views plus three pre-mirrored views. Numeric and named Phaser metadata are both supplied.
- Puzzle artwork: blank clue panel and terminal; switch, button and plate states; separate symbols and lock indicators. No secrets, labels or answers are baked into images.
- Collectibles: five world sprites and five matching UI icons. Props, structures and UI are individually separated PNGs. Panel nine-slice and content insets are in JSON.
- No navigable stair asset: the current collision plane has no height traversal. No run, emote, interaction or idle-breathing animation is claimed. The one-frame idle is intentional.

## Validation and visual limits

`validation.json` records successful alpha, dimensions, border, anchor, frame uniqueness, frame baseline, Tiled reference and diamond coverage checks. Contact sheets and room/phone previews are built from exported PNGs. `scripts/check-art-browser.mjs` separately exercises the PNG/atlas/spritesheet loaders and the Tiled floor atlas in Phaser; its CI report and render are uploaded as the Art assets workflow artifact. Local browser spawning was blocked in the task environment; no local Phaser-browser pass is claimed.

Mirrored character directions mirror painted highlights and equipment asymmetry. The four-pose walk has a deliberately economical comic cadence; it is not a motion-captured animation. Small world lamps are supplemental cues and should be paired with readable interaction UI. Flat source paintings are retained for reworking; they are not production sprites. Architecture collection tiles require explicit 0.5 object scaling in Tiled. Physical-phone integration testing remains pending.

## Previews

- [Full native-size asset contact sheet](ASSET_CONTACT_SHEET.png)
- [Environment](CONTACT_ENVIRONMENT.png), [characters](CONTACT_CHARACTERS.png), [props](CONTACT_PROPS.png), [puzzles](CONTACT_PUZZLES.png), [artifacts](CONTACT_ARTIFACTS.png), [UI](CONTACT_UI.png)
- [All 320 animation frames](ANIMATION_CONTACT_SHEET.png) and [walk loop](WALK_PREVIEW.gif)
- [Two adjacent rooms on the existing map](ASSET_PREVIEW.png)
- [844 × 390 phone camera approximation](MOBILE_PREVIEW.png)
- [Six-asset sample gate](SAMPLE_PREVIEW.png)

## Per-asset catalog

All file paths below are repository-relative. Intended use and full processing notes are also stored per asset in JSON. Unless marked sample-only, these are complete exported artwork files, awaiting user art approval and later loader integration. Glyphs are composable visual symbols rather than puzzle codes.

### environment/floors

| ID / intended use                                         | File                                                                       | Pixels  | Logical footprint | Anchor | States / animation | Source / processing                                      | Status   |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ------- | ----------------- | ------ | ------------------ | -------------------------------------------------------- | -------- |
| `floor-regular` — ground-anchored world artwork           | `apps/client/public/assets/environment/floors/floor-regular.png`           | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-cracked` — ground-anchored world artwork           | `apps/client/public/assets/environment/floors/floor-cracked.png`           | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-worn` — ground-anchored world artwork              | `apps/client/public/assets/environment/floors/floor-worn.png`              | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-dirt` — ground-anchored world artwork              | `apps/client/public/assets/environment/floors/floor-dirt.png`              | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-moss` — ground-anchored world artwork              | `apps/client/public/assets/environment/floors/floor-moss.png`              | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-dark` — ground-anchored world artwork              | `apps/client/public/assets/environment/floors/floor-dark.png`              | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-engraved` — ground-anchored world artwork          | `apps/client/public/assets/environment/floors/floor-engraved.png`          | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-damaged` — ground-anchored world artwork           | `apps/client/public/assets/environment/floors/floor-damaged.png`           | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-transition-dirt-x` — ground-anchored world artwork | `apps/client/public/assets/environment/floors/floor-transition-dirt-x.png` | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-transition-dirt-y` — ground-anchored world artwork | `apps/client/public/assets/environment/floors/floor-transition-dirt-y.png` | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-transition-moss-x` — ground-anchored world artwork | `apps/client/public/assets/environment/floors/floor-transition-moss-x.png` | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |
| `floor-transition-moss-y` — ground-anchored world artwork | `apps/client/public/assets/environment/floors/floor-transition-moss-y.png` | 64 × 32 | 64 × 64           | 32, 16 | static             | floor; deterministic border-preserving material variants | complete |

### environment/walls

| ID / intended use                                     | File                                                                  | Pixels    | Logical footprint | Anchor   | States / animation | Source / processing                                             | Status   |
| ----------------------------------------------------- | --------------------------------------------------------------------- | --------- | ----------------- | -------- | ------------------ | --------------------------------------------------------------- | -------- |
| `wall-x-24` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-x-24.png`           | 128 × 144 | 64 × 8            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-x-32` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-x-32.png`           | 128 × 144 | 64 × 8            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-x-38` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-x-38.png`           | 128 × 144 | 64 × 8            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-y-24` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-y-24.png`           | 128 × 144 | 8 × 64            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-y-32` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-y-32.png`           | 128 × 144 | 8 × 64            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-y-38` — ground-anchored world artwork           | `apps/client/public/assets/environment/walls/wall-y-38.png`           | 128 × 144 | 8 × 64            | 64, 116  | static             | wall; affine-projected painted material                         | complete |
| `wall-y-38-8x62p667` — ground-anchored world artwork  | `apps/client/public/assets/environment/walls/wall-y-38-8x62p667.png`  | 128 × 144 | 8 × 62.6667       | 64, 116  | static             | wall; exact partial segment from the existing authored geometry | complete |
| `wall-x-32-50x10` — ground-anchored world artwork     | `apps/client/public/assets/environment/walls/wall-x-32-50x10.png`     | 128 × 144 | 50 × 10           | 64, 116  | static             | wall; exact partial segment from the existing authored geometry | complete |
| `wall-y-32-10x45` — ground-anchored world artwork     | `apps/client/public/assets/environment/walls/wall-y-32-10x45.png`     | 128 × 144 | 10 × 45           | 64, 116  | static             | wall; exact partial segment from the existing authored geometry | complete |
| `wall-y-24-8x62p667` — ground-anchored world artwork  | `apps/client/public/assets/environment/walls/wall-y-24-8x62p667.png`  | 128 × 144 | 8 × 62.6667       | 64, 116  | static             | wall; exact partial segment from the existing authored geometry | complete |
| `wall-x-end` — ground-anchored world artwork          | `apps/client/public/assets/environment/walls/wall-x-end.png`          | 128 × 144 | 8 × 8             | 64, 116  | static             | wall / stone-door / rock; projected end                         | complete |
| `wall-x-damaged` — ground-anchored world artwork      | `apps/client/public/assets/environment/walls/wall-x-damaged.png`      | 128 × 144 | 64 × 8            | 64, 116  | static             | wall / stone-door / rock; projected damaged                     | complete |
| `wall-x-decorative` — ground-anchored world artwork   | `apps/client/public/assets/environment/walls/wall-x-decorative.png`   | 128 × 144 | 64 × 8            | 64, 116  | static             | wall / stone-door / rock; projected decorative                  | complete |
| `wall-door-opening-x` — ground-anchored world artwork | `apps/client/public/assets/environment/walls/wall-door-opening-x.png` | 160 × 160 | 86 × 10           | 80, 128  | static             | wall; separate jambs and lintel, 70-unit aperture               | complete |
| `wall-y-end` — ground-anchored world artwork          | `apps/client/public/assets/environment/walls/wall-y-end.png`          | 128 × 144 | 8 × 8             | 64, 116  | static             | wall / stone-door / rock; projected end                         | complete |
| `wall-y-damaged` — ground-anchored world artwork      | `apps/client/public/assets/environment/walls/wall-y-damaged.png`      | 128 × 144 | 8 × 64            | 64, 116  | static             | wall / stone-door / rock; projected damaged                     | complete |
| `wall-y-decorative` — ground-anchored world artwork   | `apps/client/public/assets/environment/walls/wall-y-decorative.png`   | 128 × 144 | 8 × 64            | 64, 116  | static             | wall / stone-door / rock; projected decorative                  | complete |
| `wall-door-opening-y` — ground-anchored world artwork | `apps/client/public/assets/environment/walls/wall-door-opening-y.png` | 160 × 160 | 10 × 86           | 80, 128  | static             | wall; separate jambs and lintel, 70-unit aperture               | complete |
| `wall-corner-inner` — ground-anchored world artwork   | `apps/client/public/assets/environment/walls/wall-corner-inner.png`   | 224 × 176 | 64 × 64           | 112, 136 | static             | wall; two perpendicular generated-material segments             | complete |
| `wall-corner-outer` — ground-anchored world artwork   | `apps/client/public/assets/environment/walls/wall-corner-outer.png`   | 224 × 176 | 64 × 64           | 112, 136 | static             | wall; two perpendicular generated-material segments             | complete |

### environment/doors

| ID / intended use                                     | File                                                                  | Pixels    | Logical footprint | Anchor   | States / animation | Source / processing                                        | Status   |
| ----------------------------------------------------- | --------------------------------------------------------------------- | --------- | ----------------- | -------- | ------------------ | ---------------------------------------------------------- | -------- |
| `door-wood-x-closed` — ground-anchored world artwork  | `apps/client/public/assets/environment/doors/door-wood-x-closed.png`  | 256 × 192 | 70 × 10           | 128, 136 | closed             | wood-door; affine projection and 90-degree hinge rotation  | complete |
| `door-wood-x-open` — ground-anchored world artwork    | `apps/client/public/assets/environment/doors/door-wood-x-open.png`    | 256 × 192 | 70 × 10           | 128, 136 | open               | wood-door; affine projection and 90-degree hinge rotation  | complete |
| `door-metal-x-closed` — ground-anchored world artwork | `apps/client/public/assets/environment/doors/door-metal-x-closed.png` | 256 × 192 | 70 × 10           | 128, 136 | closed             | metal-door; affine projection and 90-degree hinge rotation | complete |
| `door-metal-x-open` — ground-anchored world artwork   | `apps/client/public/assets/environment/doors/door-metal-x-open.png`   | 256 × 192 | 70 × 10           | 128, 136 | open               | metal-door; affine projection and 90-degree hinge rotation | complete |
| `door-stone-x-closed` — ground-anchored world artwork | `apps/client/public/assets/environment/doors/door-stone-x-closed.png` | 256 × 192 | 70 × 10           | 128, 136 | closed             | stone-door; affine projection and 90-degree hinge rotation | complete |
| `door-stone-x-open` — ground-anchored world artwork   | `apps/client/public/assets/environment/doors/door-stone-x-open.png`   | 256 × 192 | 70 × 10           | 128, 136 | open               | stone-door; affine projection and 90-degree hinge rotation | complete |
| `door-wood-y-closed` — ground-anchored world artwork  | `apps/client/public/assets/environment/doors/door-wood-y-closed.png`  | 256 × 192 | 10 × 70           | 128, 136 | closed             | wood-door; affine projection and 90-degree hinge rotation  | complete |
| `door-wood-y-open` — ground-anchored world artwork    | `apps/client/public/assets/environment/doors/door-wood-y-open.png`    | 256 × 192 | 10 × 70           | 128, 136 | open               | wood-door; affine projection and 90-degree hinge rotation  | complete |
| `door-metal-y-closed` — ground-anchored world artwork | `apps/client/public/assets/environment/doors/door-metal-y-closed.png` | 256 × 192 | 10 × 70           | 128, 136 | closed             | metal-door; affine projection and 90-degree hinge rotation | complete |
| `door-metal-y-open` — ground-anchored world artwork   | `apps/client/public/assets/environment/doors/door-metal-y-open.png`   | 256 × 192 | 10 × 70           | 128, 136 | open               | metal-door; affine projection and 90-degree hinge rotation | complete |
| `door-stone-y-closed` — ground-anchored world artwork | `apps/client/public/assets/environment/doors/door-stone-y-closed.png` | 256 × 192 | 10 × 70           | 128, 136 | closed             | stone-door; affine projection and 90-degree hinge rotation | complete |
| `door-stone-y-open` — ground-anchored world artwork   | `apps/client/public/assets/environment/doors/door-stone-y-open.png`   | 256 × 192 | 10 × 70           | 128, 136 | open               | stone-door; affine projection and 90-degree hinge rotation | complete |

### characters

| ID / intended use                                 | File                                                       | Pixels     | Logical footprint | Anchor  | States / animation                    | Source / processing                                                           | Status      |
| ------------------------------------------------- | ---------------------------------------------------------- | ---------- | ----------------- | ------- | ------------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| `explorer` — ground-anchored world artwork        | `docs/art/samples/explorer.png`                            | 96 × 128   | 28 × 28           | 48, 122 | static                                | explorer; alpha cleanup, trim, Lanczos normalization                          | sample-only |
| `explorer-blue` — ground-anchored world artwork   | `apps/client/public/assets/characters/explorer-blue.png`   | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | explorer-sheet; five native views, three mirrored, blue-only cloth recoloring | complete    |
| `explorer-orange` — ground-anchored world artwork | `apps/client/public/assets/characters/explorer-orange.png` | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | explorer-sheet; five native views, three mirrored, blue-only cloth recoloring | complete    |
| `scout-blue` — ground-anchored world artwork      | `apps/client/public/assets/characters/scout-blue.png`      | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | scout-sheet; five native views, three mirrored, blue-only cloth recoloring    | complete    |
| `scout-orange` — ground-anchored world artwork    | `apps/client/public/assets/characters/scout-orange.png`    | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | scout-sheet; five native views, three mirrored, blue-only cloth recoloring    | complete    |
| `traveler-blue` — ground-anchored world artwork   | `apps/client/public/assets/characters/traveler-blue.png`   | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | traveler-sheet; five native views, three mirrored, blue-only cloth recoloring | complete    |
| `traveler-orange` — ground-anchored world artwork | `apps/client/public/assets/characters/traveler-orange.png` | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | traveler-sheet; five native views, three mirrored, blue-only cloth recoloring | complete    |
| `ranger-blue` — ground-anchored world artwork     | `apps/client/public/assets/characters/ranger-blue.png`     | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | ranger-sheet; five native views, three mirrored, blue-only cloth recoloring   | complete    |
| `ranger-orange` — ground-anchored world artwork   | `apps/client/public/assets/characters/ranger-orange.png`   | 480 × 1024 | 28 × 28           | 48, 120 | idle, walk; 40 × 96×128; 8 directions | ranger-sheet; five native views, three mirrored, blue-only cloth recoloring   | complete    |

### props

| ID / intended use                                   | File                                                    | Pixels    | Logical footprint | Anchor  | States / animation | Source / processing                                                       | Status   |
| --------------------------------------------------- | ------------------------------------------------------- | --------- | ----------------- | ------- | ------------------ | ------------------------------------------------------------------------- | -------- |
| `chest` — ground-anchored world artwork             | `apps/client/public/assets/props/chest.png`             | 96 × 96   | 48 × 40           | 48, 72  | static             | chest; alpha cleanup, trim, Lanczos normalization                         | complete |
| `crate` — ground-anchored world artwork             | `apps/client/public/assets/props/crate.png`             | 144 × 144 | 46 × 46           | 72, 108 | static             | crate-painted; normalized illustrated crate / storage variant             | complete |
| `storage-container` — ground-anchored world artwork | `apps/client/public/assets/props/storage-container.png` | 144 × 144 | 42 × 32           | 72, 108 | static             | crate-painted; normalized illustrated crate / storage variant             | complete |
| `table` — ground-anchored world artwork             | `apps/client/public/assets/props/table.png`             | 192 × 160 | 80 × 44           | 96, 120 | static             | table-painted; normalized isolated illustrated furniture                  | complete |
| `stool` — ground-anchored world artwork             | `apps/client/public/assets/props/stool.png`             | 192 × 160 | 28 × 28           | 96, 120 | static             | stool-painted; normalized isolated illustrated furniture                  | complete |
| `bookshelf` — ground-anchored world artwork         | `apps/client/public/assets/props/bookshelf.png`         | 192 × 176 | 68 × 28           | 96, 144 | static             | bookshelf-painted; normalized isolated bookshelf with legible book spines | complete |
| `barrel` — ground-anchored world artwork            | `apps/client/public/assets/props/barrel.png`            | 80 × 112  | 36 × 36           | 40, 90  | static             | barrel; alpha cleanup, trim, Lanczos normalization                        | complete |
| `sack` — ground-anchored world artwork              | `apps/client/public/assets/props/sack.png`              | 96 × 96   | 40 × 40           | 48, 74  | static             | sack; alpha cleanup, trim, Lanczos normalization                          | complete |
| `book` — ground-anchored world artwork              | `apps/client/public/assets/props/book.png`              | 80 × 64   | 28 × 20           | 40, 44  | static             | book; alpha cleanup, trim, Lanczos normalization                          | complete |
| `lantern` — ground-anchored world artwork           | `apps/client/public/assets/props/lantern.png`           | 80 × 112  | 22 × 22           | 40, 94  | static             | lantern; alpha cleanup, trim, Lanczos normalization                       | complete |
| `candle` — ground-anchored world artwork            | `apps/client/public/assets/props/candle.png`            | 80 × 96   | 22 × 22           | 40, 76  | static             | candle; alpha cleanup, trim, Lanczos normalization                        | complete |
| `pottery` — ground-anchored world artwork           | `apps/client/public/assets/props/pottery.png`           | 112 × 96  | 44 × 36           | 56, 73  | static             | pottery; alpha cleanup, trim, Lanczos normalization                       | complete |
| `rock` — ground-anchored world artwork              | `apps/client/public/assets/props/rock.png`              | 112 × 80  | 48 × 40           | 56, 52  | static             | rock; alpha cleanup, trim, Lanczos normalization                          | complete |
| `rope` — ground-anchored world artwork              | `apps/client/public/assets/props/rope.png`              | 112 × 80  | 48 × 40           | 56, 53  | static             | rope; alpha cleanup, trim, Lanczos normalization                          | complete |
| `scroll` — ground-anchored world artwork            | `apps/client/public/assets/props/scroll.png`            | 96 × 80   | 36 × 24           | 48, 54  | static             | parchment; matching decorative scroll                                     | complete |
| `rubble` — ground-anchored world artwork            | `apps/client/public/assets/props/rubble.png`            | 144 × 96  | 64 × 48           | 72, 72  | static             | rock; deliberately assembled indexed rubble cluster                       | complete |
| `books-stack` — ground-anchored world artwork       | `apps/client/public/assets/props/books-stack.png`       | 96 × 96   | 36 × 28           | 48, 88  | static             | book; separate layered material-consistent stack                          | complete |

### puzzles

| ID / intended use                                          | File                                                             | Pixels    | Logical footprint | Anchor  | States / animation | Source / processing                                                  | Status      |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | --------- | ----------------- | ------- | ------------------ | -------------------------------------------------------------------- | ----------- |
| `panel` — ground-anchored world artwork                    | `docs/art/samples/panel.png`                                     | 112 × 96  | 56 × 8            | 56, 66  | static             | panel; alpha cleanup, trim, Lanczos normalization                    | sample-only |
| `symbol-triangle` — screen-space UI                        | `apps/client/public/assets/puzzles/symbol-triangle.png`          | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `symbol-circle` — screen-space UI                          | `apps/client/public/assets/puzzles/symbol-circle.png`            | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `symbol-square` — screen-space UI                          | `apps/client/public/assets/puzzles/symbol-square.png`            | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `symbol-diamond` — screen-space UI                         | `apps/client/public/assets/puzzles/symbol-diamond.png`           | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `symbol-complete` — screen-space UI                        | `apps/client/public/assets/puzzles/symbol-complete.png`          | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `symbol-disabled` — screen-space UI                        | `apps/client/public/assets/puzzles/symbol-disabled.png`          | 64 × 64   | screen / package  | 32, 32  | static             | original deterministic ink glyph; runtime-composable, no secret code | complete    |
| `indicator-locked` — screen-space UI                       | `apps/client/public/assets/puzzles/indicator-locked.png`         | 48 × 48   | screen / package  | 24, 24  | locked             | icon-lock; separate door-state overlay                               | complete    |
| `indicator-unlocked` — screen-space UI                     | `apps/client/public/assets/puzzles/indicator-unlocked.png`       | 48 × 48   | screen / package  | 24, 24  | unlocked           | icon-unlock; separate door-state overlay                             | complete    |
| `panel-x-inactive` — ground-anchored world artwork         | `apps/client/public/assets/puzzles/panel-x-inactive.png`         | 144 × 160 | 80 × 4            | 72, 128 | inactive           | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-y-inactive` — ground-anchored world artwork         | `apps/client/public/assets/puzzles/panel-y-inactive.png`         | 144 × 160 | 4 × 80            | 72, 128 | inactive           | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-x-active` — ground-anchored world artwork           | `apps/client/public/assets/puzzles/panel-x-active.png`           | 144 × 160 | 80 × 4            | 72, 128 | active             | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-y-active` — ground-anchored world artwork           | `apps/client/public/assets/puzzles/panel-y-active.png`           | 144 × 160 | 4 × 80            | 72, 128 | active             | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-x-completed` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/panel-x-completed.png`        | 144 × 160 | 80 × 4            | 72, 128 | completed          | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-y-completed` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/panel-y-completed.png`        | 144 × 160 | 4 × 80            | 72, 128 | completed          | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-x-disabled` — ground-anchored world artwork         | `apps/client/public/assets/puzzles/panel-x-disabled.png`         | 144 × 160 | 80 × 4            | 72, 128 | disabled           | panel; independently composable lamp state / affine mounting         | complete    |
| `panel-y-disabled` — ground-anchored world artwork         | `apps/client/public/assets/puzzles/panel-y-disabled.png`         | 144 × 160 | 4 × 80            | 72, 128 | disabled           | panel; independently composable lamp state / affine mounting         | complete    |
| `terminal-x-inactive` — ground-anchored world artwork      | `apps/client/public/assets/puzzles/terminal-x-inactive.png`      | 144 × 160 | 80 × 4            | 72, 128 | inactive           | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-y-inactive` — ground-anchored world artwork      | `apps/client/public/assets/puzzles/terminal-y-inactive.png`      | 144 × 160 | 4 × 80            | 72, 128 | inactive           | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-x-active` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/terminal-x-active.png`        | 144 × 160 | 80 × 4            | 72, 128 | active             | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-y-active` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/terminal-y-active.png`        | 144 × 160 | 4 × 80            | 72, 128 | active             | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-x-completed` — ground-anchored world artwork     | `apps/client/public/assets/puzzles/terminal-x-completed.png`     | 144 × 160 | 80 × 4            | 72, 128 | completed          | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-y-completed` — ground-anchored world artwork     | `apps/client/public/assets/puzzles/terminal-y-completed.png`     | 144 × 160 | 4 × 80            | 72, 128 | completed          | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-x-disabled` — ground-anchored world artwork      | `apps/client/public/assets/puzzles/terminal-x-disabled.png`      | 144 × 160 | 80 × 4            | 72, 128 | disabled           | terminal; independently composable lamp state / affine mounting      | complete    |
| `terminal-y-disabled` — ground-anchored world artwork      | `apps/client/public/assets/puzzles/terminal-y-disabled.png`      | 144 × 160 | 4 × 80            | 72, 128 | disabled           | terminal; independently composable lamp state / affine mounting      | complete    |
| `switch-x-inactive` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/switch-x-inactive.png`        | 144 × 160 | 44 × 4            | 72, 128 | inactive           | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-y-inactive` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/switch-y-inactive.png`        | 144 × 160 | 4 × 44            | 72, 128 | inactive           | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-x-active` — ground-anchored world artwork          | `apps/client/public/assets/puzzles/switch-x-active.png`          | 144 × 160 | 44 × 4            | 72, 128 | active             | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-y-active` — ground-anchored world artwork          | `apps/client/public/assets/puzzles/switch-y-active.png`          | 144 × 160 | 4 × 44            | 72, 128 | active             | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-x-completed` — ground-anchored world artwork       | `apps/client/public/assets/puzzles/switch-x-completed.png`       | 144 × 160 | 44 × 4            | 72, 128 | completed          | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-y-completed` — ground-anchored world artwork       | `apps/client/public/assets/puzzles/switch-y-completed.png`       | 144 × 160 | 4 × 44            | 72, 128 | completed          | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-x-disabled` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/switch-x-disabled.png`        | 144 × 160 | 44 × 4            | 72, 128 | disabled           | switch; independently composable lamp state / affine mounting        | complete    |
| `switch-y-disabled` — ground-anchored world artwork        | `apps/client/public/assets/puzzles/switch-y-disabled.png`        | 144 × 160 | 4 × 44            | 72, 128 | disabled           | switch; independently composable lamp state / affine mounting        | complete    |
| `push-button-x-inactive` — ground-anchored world artwork   | `apps/client/public/assets/puzzles/push-button-x-inactive.png`   | 144 × 160 | 44 × 4            | 72, 128 | inactive           | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-y-inactive` — ground-anchored world artwork   | `apps/client/public/assets/puzzles/push-button-y-inactive.png`   | 144 × 160 | 4 × 44            | 72, 128 | inactive           | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-x-active` — ground-anchored world artwork     | `apps/client/public/assets/puzzles/push-button-x-active.png`     | 144 × 160 | 44 × 4            | 72, 128 | active             | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-y-active` — ground-anchored world artwork     | `apps/client/public/assets/puzzles/push-button-y-active.png`     | 144 × 160 | 4 × 44            | 72, 128 | active             | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-x-completed` — ground-anchored world artwork  | `apps/client/public/assets/puzzles/push-button-x-completed.png`  | 144 × 160 | 44 × 4            | 72, 128 | completed          | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-y-completed` — ground-anchored world artwork  | `apps/client/public/assets/puzzles/push-button-y-completed.png`  | 144 × 160 | 4 × 44            | 72, 128 | completed          | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-x-disabled` — ground-anchored world artwork   | `apps/client/public/assets/puzzles/push-button-x-disabled.png`   | 144 × 160 | 44 × 4            | 72, 128 | disabled           | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-y-disabled` — ground-anchored world artwork   | `apps/client/public/assets/puzzles/push-button-y-disabled.png`   | 144 × 160 | 4 × 44            | 72, 128 | disabled           | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-x-pressed` — ground-anchored world artwork    | `apps/client/public/assets/puzzles/push-button-x-pressed.png`    | 144 × 160 | 44 × 4            | 72, 128 | pressed            | push-button; independently composable lamp state / affine mounting   | complete    |
| `push-button-y-pressed` — ground-anchored world artwork    | `apps/client/public/assets/puzzles/push-button-y-pressed.png`    | 144 × 160 | 4 × 44            | 72, 128 | pressed            | push-button; independently composable lamp state / affine mounting   | complete    |
| `pressure-plate-inactive` — ground-anchored world artwork  | `apps/client/public/assets/puzzles/pressure-plate-inactive.png`  | 128 × 96  | 48 × 48           | 64, 60  | inactive           | pressure-plate; projected top, physically lowered pressed state      | complete    |
| `pressure-plate-active` — ground-anchored world artwork    | `apps/client/public/assets/puzzles/pressure-plate-active.png`    | 128 × 96  | 48 × 48           | 64, 60  | active             | pressure-plate; projected top, physically lowered pressed state      | complete    |
| `pressure-plate-pressed` — ground-anchored world artwork   | `apps/client/public/assets/puzzles/pressure-plate-pressed.png`   | 128 × 96  | 48 × 48           | 64, 60  | pressed            | pressure-plate; projected top, physically lowered pressed state      | complete    |
| `pressure-plate-disabled` — ground-anchored world artwork  | `apps/client/public/assets/puzzles/pressure-plate-disabled.png`  | 128 × 96  | 48 × 48           | 64, 60  | disabled           | pressure-plate; projected top, physically lowered pressed state      | complete    |
| `pressure-plate-completed` — ground-anchored world artwork | `apps/client/public/assets/puzzles/pressure-plate-completed.png` | 128 × 96  | 48 × 48           | 64, 60  | completed          | pressure-plate; projected top, physically lowered pressed state      | complete    |

### environment/structures

| ID / intended use                                 | File                                                                   | Pixels    | Logical footprint | Anchor  | States / animation | Source / processing                                    | Status   |
| ------------------------------------------------- | ---------------------------------------------------------------------- | --------- | ----------------- | ------- | ------------------ | ------------------------------------------------------ | -------- |
| `wooden-beam-x` — ground-anchored world artwork   | `apps/client/public/assets/environment/structures/wooden-beam-x.png`   | 144 × 144 | 64 × 8            | 72, 108 | static             | wood-door plank painting; projected beam               | complete |
| `wooden-beam-y` — ground-anchored world artwork   | `apps/client/public/assets/environment/structures/wooden-beam-y.png`   | 144 × 144 | 8 × 64            | 72, 108 | static             | wood-door plank painting; projected beam               | complete |
| `column` — ground-anchored world artwork          | `apps/client/public/assets/environment/structures/column.png`          | 144 × 176 | 36 × 36           | 72, 144 | static             | wall / rock; assembled stone column                    | complete |
| `column-short` — ground-anchored world artwork    | `apps/client/public/assets/environment/structures/column-short.png`    | 144 × 176 | 36 × 36           | 72, 144 | static             | wall / rock; assembled stone column                    | complete |
| `broken-column` — ground-anchored world artwork   | `apps/client/public/assets/environment/structures/broken-column.png`   | 144 × 176 | 36 × 36           | 72, 144 | static             | wall / rock; assembled stone column                    | complete |
| `archway-x` — ground-anchored world artwork       | `apps/client/public/assets/environment/structures/archway-x.png`       | 160 × 160 | 86 × 10           | 80, 128 | static             | wall; squared fortress archway, separate opening asset | complete |
| `archway-y` — ground-anchored world artwork       | `apps/client/public/assets/environment/structures/archway-y.png`       | 160 × 160 | 10 × 86           | 80, 128 | static             | wall; squared fortress archway, separate opening asset | complete |
| `stone-carving-x` — ground-anchored world artwork | `apps/client/public/assets/environment/structures/stone-carving-x.png` | 128 × 144 | 50 × 4            | 64, 116 | static             | stone-door; isolated relief panel                      | complete |
| `stone-carving-y` — ground-anchored world artwork | `apps/client/public/assets/environment/structures/stone-carving-y.png` | 128 × 144 | 4 × 50            | 64, 116 | static             | stone-door; isolated relief panel                      | complete |
| `wall-torch` — ground-anchored world artwork      | `apps/client/public/assets/environment/structures/wall-torch.png`      | 96 × 144  | 8 × 8             | 48, 136 | static             | candle flame / wood-door; assembled wall-mounted torch | complete |

### artifacts

| ID / intended use                                 | File                                                      | Pixels  | Logical footprint | Anchor | States / animation | Source / processing                           | Status   |
| ------------------------------------------------- | --------------------------------------------------------- | ------- | ----------------- | ------ | ------------------ | --------------------------------------------- | -------- |
| `key-world` — ground-anchored world artwork       | `apps/client/public/assets/artifacts/key-world.png`       | 80 × 80 | 24 × 24           | 40, 40 | static             | key; world sprite from generated cutout       | complete |
| `key-icon` — screen-space UI                      | `apps/client/public/assets/artifacts/key-icon.png`        | 96 × 96 | screen / package  | 48, 48 | static             | key; corresponding UI icon                    | complete |
| `medallion-world` — ground-anchored world artwork | `apps/client/public/assets/artifacts/medallion-world.png` | 80 × 80 | 24 × 24           | 40, 40 | static             | medallion; world sprite from generated cutout | complete |
| `medallion-icon` — screen-space UI                | `apps/client/public/assets/artifacts/medallion-icon.png`  | 96 × 96 | screen / package  | 48, 48 | static             | medallion; corresponding UI icon              | complete |
| `crystal-world` — ground-anchored world artwork   | `apps/client/public/assets/artifacts/crystal-world.png`   | 80 × 80 | 24 × 24           | 40, 64 | static             | crystal; world sprite from generated cutout   | complete |
| `crystal-icon` — screen-space UI                  | `apps/client/public/assets/artifacts/crystal-icon.png`    | 96 × 96 | screen / package  | 48, 48 | static             | crystal; corresponding UI icon                | complete |
| `coin-world` — ground-anchored world artwork      | `apps/client/public/assets/artifacts/coin-world.png`      | 80 × 80 | 24 × 24           | 40, 40 | static             | coin; world sprite from generated cutout      | complete |
| `coin-icon` — screen-space UI                     | `apps/client/public/assets/artifacts/coin-icon.png`       | 96 × 96 | screen / package  | 48, 48 | static             | coin; corresponding UI icon                   | complete |
| `parchment-world` — ground-anchored world artwork | `apps/client/public/assets/artifacts/parchment-world.png` | 80 × 80 | 24 × 24           | 40, 40 | static             | parchment; world sprite from generated cutout | complete |
| `parchment-icon` — screen-space UI                | `apps/client/public/assets/artifacts/parchment-icon.png`  | 96 × 96 | screen / package  | 48, 48 | static             | parchment; corresponding UI icon              | complete |

### ui

| ID / intended use                      | File                                                  | Pixels    | Logical footprint | Anchor   | States / animation | Source / processing                              | Status   |
| -------------------------------------- | ----------------------------------------------------- | --------- | ----------------- | -------- | ------------------ | ------------------------------------------------ | -------- |
| `icon-interaction` — screen-space UI   | `apps/client/public/assets/ui/icon-interaction.png`   | 96 × 96   | screen / package  | 48, 48   | static             | ui-hand; alpha-normalized UI cutout              | complete |
| `icon-inventory` — screen-space UI     | `apps/client/public/assets/ui/icon-inventory.png`     | 96 × 96   | screen / package  | 48, 48   | static             | ui-inventory; alpha-normalized UI cutout         | complete |
| `icon-lock` — screen-space UI          | `apps/client/public/assets/ui/icon-lock.png`          | 96 × 96   | screen / package  | 48, 48   | static             | ui-lock; alpha-normalized UI cutout              | complete |
| `icon-artifact` — screen-space UI      | `apps/client/public/assets/ui/icon-artifact.png`      | 96 × 96   | screen / package  | 48, 48   | static             | medallion; alpha-normalized UI cutout            | complete |
| `icon-unlock` — screen-space UI        | `apps/client/public/assets/ui/icon-unlock.png`        | 96 × 96   | screen / package  | 48, 48   | static             | ui-lock; separated body and pivoted open shackle | complete |
| `badge-blue` — screen-space UI         | `apps/client/public/assets/ui/badge-blue.png`         | 96 × 96   | screen / package  | 48, 48   | static             | ui-badge; cloth-only hue variation               | complete |
| `badge-orange` — screen-space UI       | `apps/client/public/assets/ui/badge-orange.png`       | 96 × 96   | screen / package  | 48, 48   | static             | ui-badge; cloth-only hue variation               | complete |
| `icon-puzzle-status` — screen-space UI | `apps/client/public/assets/ui/icon-puzzle-status.png` | 96 × 96   | screen / package  | 48, 48   | static             | medallion and composable complete ink symbol     | complete |
| `icon-progress` — screen-space UI      | `apps/client/public/assets/ui/icon-progress.png`      | 96 × 96   | screen / package  | 48, 48   | static             | medallion and composable diamond ink symbol      | complete |
| `dialogue-frame` — screen-space UI     | `apps/client/public/assets/ui/dialogue-frame.png`     | 640 × 288 | screen / package  | 320, 144 | static             | ui-panel; clean blank parchment UI               | complete |
| `modal-background` — screen-space UI   | `apps/client/public/assets/ui/modal-background.png`   | 512 × 384 | screen / package  | 256, 192 | static             | ui-panel; clean blank parchment UI               | complete |
| `button-normal` — screen-space UI      | `apps/client/public/assets/ui/button-normal.png`      | 256 × 96  | screen / package  | 128, 48  | normal             | ui-panel; consistent parchment button state      | complete |
| `button-hover` — screen-space UI       | `apps/client/public/assets/ui/button-hover.png`       | 256 × 96  | screen / package  | 128, 48  | hover              | ui-panel; consistent parchment button state      | complete |
| `button-pressed` — screen-space UI     | `apps/client/public/assets/ui/button-pressed.png`     | 256 × 96  | screen / package  | 128, 48  | pressed            | ui-panel; consistent parchment button state      | complete |
| `button-disabled` — screen-space UI    | `apps/client/public/assets/ui/button-disabled.png`    | 256 × 96  | screen / package  | 128, 48  | disabled           | ui-panel; consistent parchment button state      | complete |
| `progress-frame` — screen-space UI     | `apps/client/public/assets/ui/progress-frame.png`     | 320 × 48  | screen / package  | 160, 24  | static             | ui-panel; empty progress track decoration        | complete |

### tilesets

| ID / intended use                              | File                                                  | Pixels    | Logical footprint | Anchor | States / animation | Source / processing                        | Status   |
| ---------------------------------------------- | ----------------------------------------------------- | --------- | ----------------- | ------ | ------------------ | ------------------------------------------ | -------- |
| `comic-floors` — ground-anchored world artwork | `apps/client/public/assets/tilesets/comic-floors.png` | 272 × 108 | screen / package  | 0, 0   | static             | packed floor exports; 2px extruded gutters | complete |

## Retained sources

The 40 retained generated paintings are editable PNGs, not layered PSDs. Their exact generation prompts and paths are indexed in `generation-sources.json`. They are source material only, excluded from the production count. The supplied reference illustration is not redistributed.

All source artwork and derivatives use the reuse terms in LICENSE.md. No new font files, stock art, external textures or asset packs are bundled.
