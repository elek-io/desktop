---
'@elek-io/desktop': minor
---

Say why Save cannot save yet, and ask before changes you have not saved are lost.

Save now says what keeps it from saving, instead of looking available and then doing nothing. An Entry that is still missing a required Value shows the reason on a line below Save, such as "German is missing 1 Value", and Save is marked unavailable while it stands there. Nothing is saved by pressing it, and nothing is saved by pressing Enter in a field either, so no half-finished Entry reaches elek.io Core.

The button stays reachable with the keyboard while it is blocked, and a screen reader reads it out together with the line that says why. A button that is switched off cannot be reached at all, which would have left the reason unread. The two other things that keep Save from saving, a save that is still running and a form nothing was changed in, now mark it the same way and say nothing, because there is nothing to fix in either case.

Leaving a page with changes you have not saved asks before they are lost: "Discard your changes to Spring opening hours?", named by the page you are on, with Keep editing and a red Discard. Until now choosing the next Entry, or anything else in the app, threw away what you had typed with nothing on screen to stop it. The five pages that edit something ask: an Entry, a Collection's settings, a Component, the Project's settings and your profile.

It asks the same thing in the same dialog when you close the window or quit elek.io Desktop, and the window stays open with your changes until you answer. Without changes it closes at once, as before.

What does not ask:

- Saving. The page you land on after a save is where the save was taking you.
- Deleting what the page is about, since the page and everything typed into it are gone either way.
- Reloading, which is how the error screen gets you back into the app.

The Entry page is now titled by the Entry's own name, the one its row, its breadcrumb and every picker already use, rather than by its id. The Project's settings page makes its form available again after it saved, so Save no longer stays offered with nothing left to save.

Nothing about your Projects changes, and nothing needs a migration.
