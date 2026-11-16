---
'@elek-io/desktop': minor
---

Read what stopped a screen without reading the password in a Git address or your own folder names.

**The screen an error replaces your work with is rebuilt.** It says that an unexpected error stopped this screen, that nothing about it was sent to us, and offers Report an issue as its one button, with Reload and Back to Projects beside it. The address the app has no screen for takes the same screen, which now names the address it tried.

**The error itself stands behind Details, closed until you open it.** It carries what elek.io Core raised: the kind of error, its message and the stack it came from. Copy details, in the text's own top right corner, puts exactly that text on the clipboard and says "Details copied". The text opens below Details without moving the screen, and scrolls in a block you can reach with the keyboard.

**What you read there, and what you copy, is masked where elek.io Core runs.** It runs the same rules it masks its own log files with, so the credentials in an address such as `https://you:your-token@github.com/org/repo.git` become `[redacted]`, an email address becomes `[email]`, and your home folder becomes `~`. The address still says which host and which repository it was about, so a report still says what went wrong. Where that masking cannot run, Details says it has no details rather than showing the text, and offers nothing to copy.

**The box that comes up when elek.io Desktop cannot start at all says what happened in your words.** It used to paste in the message elek.io Core raised, which can carry the address of a Git repository with its password and the name of your home folder, with nowhere to hide either. It now says that something went wrong while starting and what to try, and the error itself goes to the log files on this computer, where elek.io Core got far enough to write one.

Nothing about your Projects changes, and nothing needs a migration.
