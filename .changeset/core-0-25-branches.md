---
'@elek-io/desktop': minor
---

Move to elek.io Core 0.25.1, which renames a Project's branches.

Editing now happens on `draft`, and a Release promotes it to `main`. The branches `work` and `production` are gone, and nothing renames them for you. A Project created with an earlier Desktop still opens and saves changes on this computer, but it can't sync, and a copy of it can't be cloned, until its branches are renamed.

In every copy of such a Project, open a terminal in its folder, `elek.io/projects/<Project id>` in your home folder, and run:

```sh
git branch -m work draft
git branch -m production main
```

If the Project syncs with a Git repository, rename the branches there too, from one copy only. Make `main` the repository's default branch at your Git host first, since most hosts refuse to delete the default branch. Then run:

```sh
git push origin draft main
git push origin --delete work production
git branch -u origin/draft draft
git branch -u origin/main main
```

Every other copy then runs `git fetch --prune` and the two `git branch -u` lines.

Also new with Core 0.25.1:

- Cloning a Project checks out `draft`. A repository without `draft` is refused, and the Clone dialog says so and keeps the address.
- The first sync to an empty repository uploads the Project with every Release made so far. A repository that holds anything else, such as a README your Git host created, is refused, so create it empty. The sync dialog says so.
- Your name and email still sign each change, but are no longer written into each Project's git settings.
