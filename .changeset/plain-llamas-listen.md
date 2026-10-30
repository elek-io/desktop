---
'@elek-io/desktop': patch
---

Electron moves from 45.0.0 to 45.1.0. The Chromium that draws every screen goes from 156.0.8078.48 to 156.0.8078.49 and the Node that runs the app's file and Git work from 24.22.0 to 24.22.1, both patch releases. Electron fixes a crash on Linux and how the app reads its own archive on every platform.

No operating system version is dropped by this. The macOS 13 (Ventura) floor this release carries comes from the move to Electron 45.

Nothing changed on screen. The icon set moves up a release and redraws none of the icons the app uses, and every window, dialog, form and list is drawn by the same components and behaves the same way.
