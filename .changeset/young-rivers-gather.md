---
'@elek-io/desktop': minor
---

See what a Project holds on its Dashboard, keep its settings on two pages, and find your Profile and the app's language where they belong.

**The Dashboard** is the Project's first page and says what it holds: how many Entries there are and in how many Collections, how many Assets and how many of those are images, the languages with the default named, and the Release it is at. Below that the five latest changes stand in the History's own rows, each saying who did what and when, with Full History beside them. Until now the page printed the Project's stored file as raw text, which said nothing an editor could use.

**A Project's settings** are a list of pages beside the chosen one, which is where more of them will go. General holds the name, the description and the languages, and ends with Remove from this computer. Sync holds the address of the Git repository and says that Desktop checks it for incoming changes every three minutes. The list says where the Project syncs, by the name of its Git host or "This computer only", so you can tell without opening the page.

**A password in a Git address stays hidden.** An address such as `https://you:your-token@github.com/...` used to stand on the Sync page in full, readable by anyone looking at the screen and copied along with the address. The password is now bullets, and saving puts the stored one back, so changing the rest of the address keeps the Project pointing at a repository it can reach. Typing a new password over the bullets saves that one instead.

**Removing a Project asks once and says what it loses.** The confirm names the Project, says that its folder here goes while its Git repository and the copies on other computers stay, and counts the changes that are not synced yet. A Project without a Git repository is deleted rather than removed, and the confirm says it cannot be brought back. Where Desktop cannot reach the Git repository to count, it says changes that are not synced may be lost, rather than saying there are none. Until now a removal was refused first and then offered again in a second dialog that spoke of remotes and unpushed commits.

**The Profile** is one form of 360 px: your name and your email address, the same note about them the first start shows, and the Local API's port with the address other apps on this computer read your Projects at. Saving keeps you on the page, as every other settings page does.

**The user menu** holds Profile, Local API, Theme and Language. The app's language moved here from the Profile and offers the languages Desktop has words for, each named in its own language, in place of the 24 language codes Core knows and Desktop cannot speak. The Local API's switch is the one place it is turned on and off, and it now remembers your choice, so the API comes back the next time you open Desktop.

Nothing about your Projects changes, and nothing needs a migration.
