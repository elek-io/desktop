---
'@elek-io/desktop': minor
---

Cut a Release of a Project, so a website can build from what you published.

Every Project now has a Releases page, reached from its sidebar. It lists what was published and when, and a Project with nothing published yet says so. Release opens a dialog that shows what a Release would publish before you confirm it: the version it moves up from, the version it moves to, whether that is a major, a minor or a patch Release, why in one sentence, and each change in words. elek.io sets the version from what changed, so there is nothing to choose. A Release cannot be undone, and the dialog says so before you press Create Release. Afterwards the Project carries its new version and its History shows the Release.

If the Project synchronizes with a Git repository, the Release is published there too: the dialog reads the repository before it shows you anything, so the version and the changes are the ones that will go out, and Create Release sends everything in one go.

When a Release cannot be made, nothing is released and the Project is left exactly as it was:

- Changes were saved or a Release was made on another computer, so you synchronize first and release again. The dialog reads the Git repository as it opens, so Synchronize is ready the moment the dialog asks you to use it.
- The Git repository refused access or could not be reached, so you check your connection or ask whoever set up the Project, and press Create Release again.
- Nothing has changed since the last Release, so the dialog says that and offers nothing to press.

Preview Releases are not in elek.io Desktop yet. One made elsewhere shows in the list, marked Preview, so it is never read as the version a website builds from.
