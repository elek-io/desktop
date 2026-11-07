import { t } from '@lingui/core/macro';

import { type GitCommit, type ObjectType } from '@elek-io/core';

// What one change of a Project says it is, in the sentence a row of the
// History shows.
//
// Core writes a commit's message as a method and a reference rather than as
// words, so the words are derived here. Every one of them is a message of the
// catalog, see contributing/renderer/internationalization.md.

/** What a change happened to, with the article a sentence needs for it. */
function changedThing(objectType: ObjectType): string {
  switch (objectType) {
    case 'project':
      return t`this Project`;
    case 'collection':
      return t`a Collection`;
    case 'component':
      return t`a Component`;
    case 'entry':
      return t`an Entry`;
    case 'asset':
      return t`an Asset`;
    case 'value':
      return t`a Value`;
  }
}

/**
 * What happened, in one sentence: who did it and what they did.
 *
 * One message per shape rather than a verb dropped into one sentence, because
 * a verb carries grammar that cannot be translated on its own, and one per
 * author too, since a language words what somebody else did differently from
 * what you did. What was changed is a placeholder, because it is already a
 * phrase of the catalog carrying its own article.
 *
 * Call it during a render, so the words come out of the catalog in use.
 */
export function changeSentence(commit: GitCommit, byYou: boolean): string {
  const author = commit.author.name;
  const thing = changedThing(commit.message.reference.objectType);

  switch (commit.message.method) {
    case 'create':
      // Nobody adds a Project to itself, so a Project's own first change is
      // the one that created it.
      if (commit.message.reference.objectType === 'project') {
        return byYou
          ? t`You created this Project`
          : t`${author} created this Project`;
      }

      return byYou ? t`You added ${thing}` : t`${author} added ${thing}`;
    case 'update':
      return byYou ? t`You changed ${thing}` : t`${author} changed ${thing}`;
    case 'delete':
      return byYou ? t`You deleted ${thing}` : t`${author} deleted ${thing}`;
    case 'upgrade':
      return byYou
        ? t`You upgraded this Project`
        : t`${author} upgraded this Project`;
    case 'release': {
      // An upgrade's tag carries a Core version rather than a Release, so only
      // a Release and a preview have a version to name.
      const version =
        commit.tag === null || commit.tag.message.type === 'upgrade'
          ? null
          : commit.tag.message.version;

      if (version === null) {
        return byYou
          ? t`You released this Project`
          : t`${author} released this Project`;
      }

      return byYou
        ? t`You released ${version}`
        : t`${author} released ${version}`;
    }
  }
}
