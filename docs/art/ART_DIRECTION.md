# Cinematic Adventure Comic — asset specification

## Direction

Original hand-inked expedition adventure: expressive charcoal contours, deliberately shaped cool shadows, weathered stone and leather, warm upper-left light, restrained printed grain. The supplied THE OTHER GROUP illustration was inspected directly as a style reference; no reference pixels are redistributed. Simplify its cinematic detail for small sprites. Avoid chibi, pixel art, glossy renders, photorealism, dense microtexture and baked writing.

| Role                   | Color     |
| ---------------------- | --------- |
| Ink                    | `#202529` |
| Deep shadow            | `#46525E` |
| Stone light            | `#71818A` |
| Leather                | `#8E6650` |
| Parchment / warm light | `#D4A079` |
| Discovery accent       | `#F25432` |
| Team A                 | `#4399DB` |
| Team B                 | `#EE8A39` |

## Repository audit (main at 2139b53)

Iterations 1–3, including reconnect follow-up PR #4, are merged. No open PRs existed at audit. The active map is `packages/shared/src/maps/twin-vaults.json`: two adjacent 12 × 12 chambers, ten spawns per room, rectangular walls, columns, crates, two closed gates. Floor GIDs are 1–3. The editor uses a three-tile SVG, while runtime graphics are constructed by `IsometricMap`; changing a tileset image alone does not change the running game. `WorldScene` currently has no preload method. `PlayerEntity` constructs a 32 × 34 cloak plus a head, boots and labels. No complete raster asset pack exists.

`world/projection.ts` defines 64 × 32 projected pixels per 64 × 64 logical tile. Logical X projects down-right; Y down-left. Tiled object coordinates multiply by two to obtain logical units. Wall thickness is typically 8 logical units; authored elevations are 24–38 pixels, columns 50–52, gates 34. Current gates occupy 70 × 10 logical units. Keep these footprints, collision rectangles and IDs unchanged.

Phones use camera zoom 1.15–1.8, independent of device pixel ratio. The host fits both rooms to the display. Feet determine sprite depth and position. Walls fade to 0.27 alpha when occluding the local player. Preserve this behavior during later integration.

## Export contract

- Projection: orthographic 2:1 dimetric; ground edges have screen slopes ±0.5. No perspective convergence.
- Logical geometry remains 64 × 64. Standard floor exports are exactly 64 × 32 with a complete pixel-center diamond mask. Floor center origin is `(0.5, 0.5)`; place at projected logical tile center, never at its top vertex.
- Objects and characters export at 2× raster density. Metadata `displayScale: 0.5` converts raster pixels to existing projected pixels. Never change projection constants to fit art.
- Tall sprites use explicit pixel anchors in the JSON manifest. Feet/ground anchor is fixed across animation and state frames. Sort at the logical footprint center's projected Y.
- Architecture is derived from generated material art and projected deterministically to the existing exact geometry. X/Y orientations are separately lit; do not mirror directional lighting.
- Warm light comes from screen upper-left. Top/left materials are warmest; right-facing planes remain cool. Floor details have restrained contrast.
- Character anatomy: approximately six heads tall, readable hair, jacket/coat, boots, backpack. Individual silhouettes plus large blue/orange clothing areas identify teams. Do not recolor skin or hair.
- At logical size use approximately 1–1.5 px outer ink, thinner internal strokes. Reserve vermilion for discoveries and status; avoid busy vermilion floors/walls.
- PNG RGBA, sRGB-compatible colors, straight alpha. No baked checkerboard, white backdrop, text, labels or secret codes. Transparent border for packed objects; floor edges are the intentional exception.
- Texture detail must survive 0.5× display of the source artwork. Inspect the native-size contact sheet and phone camera crop.

## UI language

Ink-edged parchment panels, leather/metal affordances and restrained warm highlights. Export empty backgrounds and isolated symbols, never nicknames, codes or status text. Panel nine-slice insets are specified in metadata. Touch hit regions are application layout: minimum 44 CSS px regardless of icon's artwork dimensions. Use the existing system sans-serif font stack; no additional font files or redistribution obligation.

## Workflow and acceptance

Generate six representative assets first: stone, wall, wood door, traveler, chest and clue panel. Composite exported assets using the real projection before producing categories. Keep each standalone asset isolated and each animation sheet indexed. Record source prompts and processing. Compare lighting, silhouettes, scale and team separation. Later batches must follow the accepted samples. Preview artwork is documentation, never a room background or a production tileset.

Only assets, art documentation and offline art tooling belong in this iteration. Do not change gameplay, maps, networking, collision, UI behavior or server state. Known compromises and any missing coverage must be reported explicitly in the manifest and review notes.
