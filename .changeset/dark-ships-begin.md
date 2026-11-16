---
'@elek-io/desktop': minor
---

Start with your name and your first Project, and see on every Project card where it syncs and what is not synced yet.

The first minutes with elek.io Desktop are new. Until now the app opened on an empty Projects list, and the only way to a User was the Profile, which you had to find yourself. Now there is a screen for it, and the Projects page says what to do next.

**The first start.** Before any User exists, Desktop opens one card with your name and your email address, both marked as needed, and Continue. Every address settles on it until you have filled it in, because elek.io Core marks every change you make with those two, so nothing can be saved without them. The card says what they are for and where they go: they are saved with each change, so whoever you sync a Project with sees them, and Desktop sends them nowhere else without asking. The one thing that does send them is Report an issue, which fills them in for you to change or clear before you send it.

**Welcome.** A computer with no Project shows the elek.io mark, "Create your first Project", both ways to get one, and three short notes on working offline, syncing and publishing a Release. Nothing of it offers a service that does not exist yet.

**The Projects page.** Your Projects now stand in a ruled grid under "On this computer", with how many there are. A card shows the Project's name, its description and its languages, then where it syncs, by the Git host's name and logo or "This computer only", then what is not synced, what is coming in, and the last Release that went out. The lines are the ones the open Project's card shows in the sidebar, so a Project reads the same from the outside and the inside. A Git repository that cannot be reached, or one that refuses access, says so in its own card and nowhere else: each card checks its own, so one slow or unreachable repository no longer holds up the page or takes it to the error screen. A Project whose Releases cannot be read says that in its own card too, and the other Projects stay where they are. Filter Projects narrows the grid by name and description.

**Create Project.** One page asks where to keep the Project, on this computer or on another Git host, and for its name, description, languages and default language. Choosing another Git host asks for the address of an empty repository that supports Git LFS, and Desktop sets it up and syncs the Project with it. Where that does not work, the Project is still on this computer with everything you entered, and Desktop says what to check and opens it, rather than leaving you in front of a form that would make a second one. Create Project now says what is still missing instead of letting you press it and find out, and it asks before what you typed is lost.

**Download from another Git host** replaces "Clone a Project by URL". It asks for the address of the Project's Git repository, says who sends it to you, and answers a repository that holds no Project in the dialog, with the address kept so you can correct it. Download waits until you have entered an address and says that it is still missing, the way Save does on every form.

**Every empty state** is now one screen: the one elek.io gradient filling the panel, an icon of what is missing, a title, one sentence and the screen's own button. Assets, Releases, Components and a Project without a Collection all read the same way, and no button repeats the one the screen already offers. A filter without matches is not an empty state and says so in plain text in its list, because the page itself is not empty.

Nothing about your Projects changes, and nothing needs a migration.
