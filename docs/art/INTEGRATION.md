# Next iteration: integrate the reviewed art

This branch contains assets and offline review tooling. The live application intentionally still uses its existing procedural graphics. No source map, projection, collision rectangle, puzzle behavior, inventory, door logic or server schema changed.

## Loading contract

All runtime PNGs are under `apps/client/public/assets/`. Strip `apps/client/public` from a manifest file path to obtain its Vite URL, for example `/assets/props/chest.png`. `manifest.json` records dimensions, logical footprints, anchors, density, states and source processing for every exported image. Two representative sample exports live separately in `docs/art/samples/` and are marked sample-only.

Keep the existing **64 × 32 projected tile / 64 × 64 logical unit** convention. Floors are already at 1× density; objects and character frames are at 2× and use `displayScale: 0.5`. For a sprite, set origin to `anchorPixels / frameDimensions`, apply its display scale, and place it at `worldToScreen(logicalPosition)`. Never divide the world coordinates by two. Character depth remains the projected feet Y; label sizing and reconnection fading remain independent.

Floor origins are tile centers, not top vertices. Place them at `worldToScreen({x: tileX*64+32, y: tileY*64+32})`. Existing ground GIDs map directly: 1 regular, 2 cracked, 3 worn. The other nine floor variants are available for later authoring. The 12-tile atlas has two-pixel extruded margins and four-pixel spacing; do not include those gutters in tile dimensions.

For wall segments, choose an exact logical footprint and elevation variant from the manifest, including the partial lengths in the authored alcoves and west/east boundaries. Standard walls include heights 24, 32 and 38. Footprint anchors are base centers; corner assets are anchored to the first segment center and include attachment offsets for the perpendicular segment. Preserve the existing local wall-occlusion fade. Decor props have documented visual footprints; never infer collision from a PNG's bounding box.

## Characters

Four designs: explorer, braided scout, long-coat traveler and bob-haired ranger. Each has blue and orange exports. Every sheet is **480 × 1024**, containing five columns and eight rows of **96 × 128** frames. Frame origin is `(48,120)`, or `(0.5,0.9375)`. At scale 0.5 the figure is about 52 projected pixels tall, comparable to the existing character.

Row order uses **screen-space** headings: S, SE, E, NE, N, NW, W, SW. For each row, column 0 is idle and columns 1–4 are the four-pose walk loop at 7 fps. Native paintings provide S/SE/E/NE/N; NW/W/SW are pre-mirrored exports of NE/E/SE. Equipment asymmetry and painted highlights also mirror. This is the explicit animation compromise; no run, interaction or emote animations are claimed.

Use either Phaser's numeric spritesheet loader with `characters/animations.json`, or its named atlas loader with each `*.atlas.json`. The latter has names such as `se-idle` and `se-walk-1`. Numeric animation indices belong to the spritesheet loading path; do not pass those numeric indices to a named atlas. All frame rectangles and pivots are explicit.

Keep existing nickname/color identifiers in addition to team cloth and badges. Four base silhouettes need not uniquely identify twenty people by themselves. Team hue variations change saturated blue cloth while preserving skin, hair and warm leather.

## Doors and puzzles

Wood, metal and stone doors each provide X/Y orientations and open/closed leaves. X runs along logical X, not screen horizontal. Open leaves rotate 90 degrees about their documented hinge; their fixed canvas and anchor account for the overhang. Keep wall openings and status overlays separate. The present map gates are 70 × 10 logical units, height 34 projected pixels. Door art must never itself decide collision or unlock state.

Clue panels, terminals, switches and buttons have X/Y orientations and inactive/active/completed/disabled states. Buttons also have pressed art. The pressure plate has five states including a physically lowered pressed plunger. Locked/unlocked indicators, triangle/circle/square/diamond and completion glyphs are standalone PNGs. Code displays and keycaps remain blank: draw all secrets, values and labels at runtime. Small world lamps supplement UI status; use a larger modal/status icon when detailed state needs to be read on a phone.

Each artifact's world sprite and icon use the same source painting. This iteration supplies artwork only. No collection, inventory or puzzle action is implemented.

## Tiled

`tilesets/comic-floors.tsj` is a real 64 × 32 atlas tileset with twelve indexed entries. `docs/art/twin-vaults-art-preview.tmj` preserves every existing map layer, object, collision, spawn and GID; only its tileset reference changes for editor review. It is **not** a replacement runtime map: the current shared loader requires the existing embedded tileset contract and rejects external tilesets.

`tilesets/comic-architecture.tsj` is an image collection for editor inspection. Its images retain 2× raster dimensions; resize placed tile objects to 0.5 and honor the explicit custom anchor properties. Do not use it as a native 1× world tile layer, or add it to the runtime parser without a separate reviewed change. Geometry and collisions remain separately authored rectangles.

Navigable stairs are not included because the current map has one collision plane and no height-traversal geometry. The squared fortress archways, beams, columns, reliefs and wall torch are decorative assets compatible with the existing projection.

## UI

Parchment frames are empty. `nineSlice` arrays use `[left,right,top,bottom]` in raster pixels; `contentInsets` use `[left,top,right,bottom]`. Apply origin and scale according to screen layout rather than world density when using UI art. Keep touch targets at least 44 CSS pixels. Render names, dialogue and status as application text, using the existing font stack.

## Recommended implementation order

1. Add a preload path for approved art; replace `IsometricMap` floors, walls, pillars and crates while preserving geometry, depth and occlusion.
2. Replace `PlayerEntity` body drawings with directional animation sheets; retain labels, local ring, interpolation and disconnect fading. Verify all eight joystick directions, both teams and phone/host cameras.
3. Render the existing server-controlled doors with separate leaves and indicators. Add no client-authoritative unlock behavior.
4. Add reusable object views and accessible interaction UI for clues, switches, buttons, plates and terminals, then define server-owned interaction state in a separate gameplay iteration.
5. Build cooperative puzzle validation and shared status only after those object contracts are tested. Add artifact collection and inventory afterwards.

## Rebuilding and checking

Install the repository's pinned Node 24 / pnpm 10.34.9 dependencies. Art tooling separately uses Python 3.12, Pillow and NumPy (`scripts/art-requirements.txt`). Contact-sheet captions require DejaVu Sans available on the build machine.

```sh
python -m pip install -r scripts/art-requirements.txt
python scripts/art_pipeline.py
python scripts/validate_art.py
node scripts/check-art-browser.mjs
```

The browser check uses the repository's existing Playwright dependency and a local Chrome/Chromium binary (`CHROME_BIN` can override its path). It loads every production PNG, all eight named atlases and numeric sheets, plays walking loops, and parses/renders the real isometric floor map with the new atlas. `--serve` exposes the same isolated review page on localhost. This is an offline asset review fixture, not a new gameplay scene. The Art assets GitHub Actions workflow runs the browser check and uploads its report and Phaser render.

The initial task environment blocked spawning Chromium and its separate review browser could not reach the local fixture. The PNG/geometry checks and existing type/test/build checks ran locally; CI supplies the independent Phaser browser check. Physical Android/iPhone testing remains part of the later integration iteration.
