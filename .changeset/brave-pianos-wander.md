---
'@elek-io/desktop': minor
---

Move to Electron 45, which needs macOS 13 (Ventura) or newer.

Every dependency the app ships and builds with is on its newest release. Electron goes from 43 to 45, so the Chromium the interface is drawn with goes from 150 to 156 and brings its security fixes with it.

On macOS this release needs macOS 13 (Ventura) or newer. Electron 44 raised that floor, and this release crosses it, so the app no longer starts on macOS 12 (Monterey). Stay on 0.4.0 there. The 32 bit Windows and ARMv7 Linux builds Electron also stopped publishing were never part of elek.io Desktop, so no Windows or Linux machine that ran 0.4.0 loses the app.

The Git that versions your Projects moves from 2.53.0 to 2.56.0, which accounts for most of the roughly 4 MB each installer gains.

Nothing changed on screen. Every window, dialog, form and list is drawn by the same components as before, and every one of them behaves the same way.
