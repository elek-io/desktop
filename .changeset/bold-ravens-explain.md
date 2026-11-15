---
'@elek-io/desktop': minor
---

Say which one thing stopped a sync, and what to do about it.

elek.io Core now names what it refused a synchronization for, so the sync dialog says that one thing with what gets past it, rather than a sentence listing everything it could have been. A few of them, as an editor reads them:

- "The Git repository holds something other than this Project. Ask whoever set up this Project for an empty Git repository."
- "The Git repository will not take this Project's Assets. Ask whoever set up this Project to turn on Git LFS there, or to use another Git host."
- "The same text was changed here and on another computer, so the two cannot be put together. Ask whoever set up this Project."
- "Somebody else kept syncing with the Git repository while this sync ran. Try again."
- "The Git repository holds a published Release this computer does not have. Sync on the computer that published it, then sync here again."

Every cause elek.io Core has a value for gets a sentence of its own, fourteen of them, so a sync stopped by something rarer says so too: a Git host that cannot take all of the changes in one go, a Project whose files were changed outside elek.io Desktop, or a copy of a Project made for building a site.

A refusal elek.io Core names no cause for says the one thing that is true whatever stopped it, that nothing was synced and your changes stay on this computer, and names no cause at all. So does a sync stopped by something a newer elek.io Core added, instead of a sentence about the wrong cause.

What you read is still only that sentence. The name elek.io Core uses for a cause is for code to read, so it never reaches the screen, and neither does the message elek.io Core or Git wrote, which can carry the password in a Git repository's address.

Nothing about your Projects changes, and nothing needs a migration.
