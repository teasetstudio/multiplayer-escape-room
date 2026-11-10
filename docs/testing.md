# Verification guide

## Iteration 5

`pnpm test` runs 50 server tests on the labelled placeholder deck (one further test checks the real Proverbs 4 dataset and is skipped until `pnpm scripture:import` has installed it).

- **Scripture data** (`content.test.ts`): a dataset must be exactly 27 numbered, distinct, non-empty verses with attribution; the importer is tested against a synthetic page in the eBible layout and must refuse incomplete, reordered or unlicensed input.
- **Placement**: level totals 5/5/5/6/6, team totals 14/13, every verse placed exactly once, a seed reproduces the manifest, different seeds differ, and every item, entrance, chamber exit and level exit is reachable by flood fill on the real collision world.
- **Puzzles**: each of the five engines is solved through its public interface; wrong input, one-team-only attempts and the timing window are covered.
- **Final board**: 600 random interleaved operations keep all 27 cards in exactly one place; stale moves, incomplete and wrong submissions, and a second victory are rejected.
- **Hidden chambers** (`adventure.test.ts`, real WebSocket clients): raw frames to the host, a teammate outside and the other team never contain chamber names, fixture IDs, explorer coordinates or undiscovered verse text; a container's contents arrive only after a valid nearby inspection; two simultaneous collections yield one card; reconnecting inside a chamber restores it and the exit.
- **Progression**: puzzle alone, verses alone and one team at its exit do not advance; forged client and host messages change nothing; levels 1–5, a reconnect during a transition, the shared board with concurrent edits, a wrong and a correct submission, and the single victory are played end to end.

`pnpm test:browser` additionally plays the adventure in the production Phaser client and saves screenshots of the public map, a hidden entrance, a hidden chamber, a cabinet/scroll and verse card, the collection counter, a locked exit, the final board (phone and host) and the victory screens under `test-results/`. Level completion in that run is driven by SDK bots through ordinary client messages; their positions are set on the server instead of walking.

Not tested: physical phones (Android Chrome, iPhone Safari), real Wi-Fi conditions, 20 real players on the final board, and the puzzles with 12–14-year-olds. No physical-device testing was performed in this iteration.

## Iteration 3

The unit and real WebSocket suite exercises the lobby-to-game transition, shuffling, reserved seats, capacity, room selection, safe spawns and movement. One test removes all physical colliders and checks the player footprint against arbitrary room bounds. Others drive forged inputs toward both sides of the actual divider and exercise the existing wall, crate and door collisions.

The full-capacity test compares each of 20 SDK clients’ decoded state with the host’s authoritative roster. Each phone sees ten players, one team and its own door. A separate test captures bytes arriving at the SDK before decoding, checks the first playing patch, and verifies that a known float coordinate reaches the host and teammates only. Reconnection tests cover a moved character, a missed start, the host, and subsequent permanent departures. Automatic SDK reconnect is also exercised across a missed start and a teammate departure while offline. The browser test drops the host connection, waits for the rotated token to be saved and then reloads the host page.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. After building, `pnpm test:browser` starts an ephemeral production server and opens Chrome with a desktop host and a landscape player. Nineteen SDK players fill the remaining seats. The browser check covers the QR join flow, counts, pointer joystick movement observed by a teammate, rotation, and player/host reloads. CI saves both screenshots in the **team-views** artifact.

Physical Android Chrome and iPhone Safari acceptance is pending. Check safe areas, touch cancellation, background/resume, Wi-Fi recovery and sustained frame rate on the intended phones using the [real-phone checklist](../README.md#real-phone-test).

## Historical Iteration 2 browser checks

Chromium checks recorded on the original Stone Hall:

- Host creation, QR/join URL, and five player browser connections in the lobby.
- Host start, the full isometric overview with all five colored characters, and player follow view.
- Pointer-operated joystick movement in screen space and camera following.
- A temporary iframe harness with **844 × 390** landscape and **390 × 844** portrait viewports: canvas/UI fit, fixed joystick, responsive resizing, and rotate-device warning. The harness was removed after testing.
- Player and host page reloads reconnect to the running game; the roster stays at five and the moved character returns.
- No application-origin console errors in the final player check. Browser-extension diagnostic errors were unrelated to the app.
- Canvas fallback initially exposed unsupported sprite tinting; color is now baked into reusable textures and was visually rechecked.

These are browser viewport checks, **not physical-device tests**. Device DPR/safe areas, true touch cancellation, Safari behavior, Wi-Fi recovery, battery usage, and sustained 20-player frame rate still need physical Android/iPhone validation.

![Desktop overview with five players](screenshots/desktop-overview.jpg)

![Player view in the Chromium landscape harness](screenshots/mobile-landscape.jpg)
