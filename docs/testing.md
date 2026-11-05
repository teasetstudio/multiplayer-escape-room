# Verification record

Iteration 1 has automated unit and real-WebSocket integration coverage for validated movement, boundaries, safe spawns, nickname normalization, host authorization, five simultaneous players, twenty-player capacity, manual host/player reconnection, automatic reconnection, and room disposal.

The host home screen, session creation, lobby, and QR URL were checked in Chromium. A development proxy conflict affecting direct join URLs was corrected. Full browser gameplay and physical Android/iPhone testing still require verification.

Before a group session, follow the real-phone test in README.md with at least five phones, including Android Chrome and iPhone Safari. Check landscape rotation, joystick release, safe areas, background/resume, Wi-Fi recovery, and host overview. Do not interpret Node integration tests as physical-device acceptance.

GitHub Actions runs frozen installation, lint, type checking, tests, and production builds. The pull request records the latest local check results.
