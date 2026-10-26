---
'@elek-io/desktop': minor
---

Move to elek.io Core 0.26.0, which refuses a change that would delete content and renames a Project's branches.

A change in a Collection's settings that would delete Values is refused, and nothing is saved. Taking a Field out of a Collection deletes what every Entry holds in it, so that save is now blocked, the dialog says so, and the Project is left exactly as it was. Desktop can't accept such a loss yet, so until it can, a Field that holds something in any Entry stays. A Field no Entry has written in, and a Field of a Collection without Entries, still come out as before.

Editing now happens on a branch named `draft`, and a Release promotes it to `main`. The branches `work` and `production` are gone, and nothing renames them for you. A Project made with an earlier version of elek.io Desktop still opens and still saves what you write, but it can't synchronize, and a copy of it can't be cloned, until its branches are renamed.

That rename is the one step run by hand, and whoever set up the Project runs it. In every copy of such a Project, open a terminal in its folder, `elek.io/projects/<Project id>` in your home folder, and run:

```sh
git branch -m work draft
git branch -m production main
```

If the Project synchronizes with a Git repository, rename the branches there too, from one copy only. Make `main` the repository's default branch at your Git host first, since most hosts refuse to delete the default branch. Then run:

```sh
git push origin draft main
git push origin --delete work production
git branch -u origin/draft draft
git branch -u origin/main main
```

Every other copy then runs `git fetch --prune` and the two `git branch -u` lines.

What else changes when you synchronize:

- The first synchronization with an empty Git repository uploads the Project with every Release made so far. A repository that holds anything else, such as a README your Git host created, is refused, so create it empty.
- Cloning checks out `draft`. A repository without it holds no Project, or one made with an older version of elek.io Desktop, and the Clone dialog says so and keeps the address you typed.
- When a synchronization stops, the dialog names only what can have stopped it: an Entry pointing at something that no longer exists, a repository holding something besides this Project, a repository that can't store Assets, or the same text changed in two places. A repository that can't be reached is reported on the error screen instead.
- Your name and email still sign every change, and they are no longer written into each Project's Git repository, so a change you make after editing your profile is signed with the new name right away.
- A Git repository that asks for a password stops the synchronization with an error instead of opening a password prompt. Use an SSH key or a credential helper set up on this computer.
- The Git that ships with elek.io Desktop asks for the TLS library Fedora, RHEL, openSUSE and NixOS carry, so synchronizing over HTTPS no longer fails on those systems for a `libcurl-gnutls.so.4` none of them ships.

Two more changes reach you from this Core. A slug derived from a label no longer breaks at an apostrophe before punctuation, so "Ada's, blog" gives `adas-blog` where it gave `ada-s-blog`, and a slug already stored keeps its value. And a Field's character limits count an emoji as one character, so a limit of 2 takes two emoji.
