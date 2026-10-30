---
'@elek-io/desktop': patch
---

Electron is on 45.1.0, so the Chromium that draws every screen is 156.0.8078.49 and the Node that runs the app's file and Git work is 24.22.1. Electron fixes a crash on Linux and how the app reads its own archive on every platform.

The macOS 13 (Ventura) floor this release carries comes from the move to Electron 45, and 45.1.0 raises no floor of its own.

Nothing else changes on screen. Every window, dialog, form and list is drawn by the same components and behaves as it did before.
