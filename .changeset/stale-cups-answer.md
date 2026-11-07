---
'@elek-io/desktop': minor
---

See in the sidebar what is synced, what is not and what was published, and read in a dialog what stopped a sync.

The Project at the top of the sidebar is a card now, and it says what state the Project is in. How many changes are not synced yet, counted by elek.io Core, and how many are waiting in the Git repository, each on a line of its own. Which Release the Project last published, with the day it went out. And "Everything synced" when there is nothing either way, so you no longer have to read two zeros to find that out.

Sync takes the card's full width and says "Syncing" while it runs. Below it, "Checked 2 min. ago" says when the Git repository was last asked, and Check now asks again at once. Desktop keeps asking on its own every three minutes, as it did before.

A Project without a Git repository says "This computer only" and links to the Settings page that sets one up, instead of showing a Sync that cannot do anything.

**A Git repository Desktop cannot reach no longer empties the window.** Opening such a Project used to leave the counts blank and then replace everything with the error screen. The card says "Can't reach the Git repository" straight away and keeps Sync as the way to try again. A repository that answered and refused you says so in its own words, "The Git repository refused access", rather than claiming it could not be reached.

**A sync that fails now tells you what stopped it.** Press Sync and, while you are still waiting on it, a dialog says in one sentence what went wrong and what to do next:

- An Entry or an Asset that something still points at was deleted here or on another computer. The dialog lists each Entry as a link with the field inside it, so you can open it, choose something else and sync again.
- The Git repository holds something besides this Project, cannot store the Assets, or the same text was changed in two places.
- The Git repository refused access.
- The Git repository could not be reached.

Either way the dialog says that nothing was synced and your changes stay on this computer, which is true: elek.io Core pushes nothing until every step before it went through. If you had already moved on to something else, a toast with Retry answers instead, so no dialog takes the keyboard away from what you were typing. And the card keeps one "Sync failed" line with Show why until a sync goes through, so the dialog is always one click away.

Any other failure of a sync still leads to the error screen, where it can be reported.

Nothing about your Projects changes, and nothing needs a migration.
