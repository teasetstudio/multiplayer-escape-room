# Verification record

Iteration 2 retains the Iteration 1 unit and real-WebSocket integration coverage for validated movement, boundaries, safe spawns, nickname normalization, host authorization, five simultaneous players, twenty-player capacity, manual host/player reconnection, automatic reconnection, and room disposal.

## Automated checks

The original nine tests passed before changes. The final suite has **22 passing tests**, including projection round trips, logical tile conversions, eight screen-space input directions, diagonal speed, Tiled loading/versioning, wall sliding, obstacle corners, thin-wall tunneling, boundaries/voids, closed-door collision, safe spawn selection, and corridor connectivity.

Real Colyseus clients verify map/door initialization, simultaneous movement by five players against different collision shapes, identical replicated positions, spoofed-field rejection, and preservation of position and identity after reconnecting following movement. Doors remain closed when clients include forged door state in input.

Commands run successfully with Node 24 and pinned pnpm 10.34.9:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The SDK logs expected rejection/drop messages during negative tests; the test runner reports zero failures. No physics, rendering, or test dependencies were added.

## Browser checks

Chromium checks completed on the feature implementation:

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

Before a group session, follow the real-phone test in README.md with at least five phones, including Android Chrome and iPhone Safari. Check landscape rotation, joystick release, safe areas, background/resume, Wi-Fi recovery, and host overview. Do not interpret Node integration tests as physical-device acceptance.

GitHub Actions runs frozen installation, lint, type checking, tests, and production builds. The pull request records the latest local check results.
