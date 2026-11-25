import { type GitCommit } from '@elek-io/core';

// Which change came before the chosen one, which is what a change is marked
// against.

/**
 * The change before this one to the same object, or `undefined` where there is
 * none to compare against.
 *
 * Core reads a Project's History as every commit of its repository, newest
 * first, so the one before this is the next commit of that list naming the same
 * object. There is none for the change that created the object, and none in a
 * copy of the repository whose history does not reach back that far, which is
 * what leaves a change showing the object as it stands rather than failing.
 */
export function changeBefore(
  history: GitCommit[],
  commit: GitCommit
): GitCommit | undefined {
  const sameObject = history.filter(
    (candidate) =>
      candidate.message.reference.objectType ===
        commit.message.reference.objectType &&
      candidate.message.reference.id === commit.message.reference.id
  );
  const here = sameObject.findIndex(
    (candidate) => candidate.hash === commit.hash
  );

  return here === -1 ? undefined : sameObject.at(here + 1);
}
