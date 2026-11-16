---
'@elek-io/desktop': minor
---

Rebuild the window around one inset panel and a two bar header, and answer a part that cannot be read where it sits.

The window is one ground with a panel on it. The header has two bars: the top one holds nothing but your system's own window controls, so it looks the same on Windows, macOS and Linux, and the one below it holds the elek.io Desktop logo, which opens your Projects, then back and forward with the trail of where you are, and Help and your account on the right. On Windows and Linux the controls follow the theme you chose, light or dark. On macOS they stay your system's own, where they always sat.

Help is new, and it holds the documentation, Report an issue and the versions of elek.io Desktop, elek.io Core and the runtime they run on. The versions used to be behind the name in the old title bar, and Report an issue used to be a Feedback button of its own.

A part of a screen that is still reading now shows still rows where its content will be, instead of a pulsing block: nothing moves while a screen loads. A part whose content cannot be read says so in one sentence in its own place, with Try again, and the rest of the window keeps working. Until now a single read that failed replaced the whole screen with the error screen. A failed save still goes there, where you can report it.

The window cannot be made smaller than 1168 by 560 px, which is the smallest size every screen holds at. A window that opens smaller than that opens at it instead.

Nothing about your Projects changes, and nothing needs a migration.
