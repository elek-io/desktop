import { i18n } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { changeBefore } from '@renderer/components/history/change-before';
import { ChangePage } from '@renderer/components/history/change-page';
import {
  ReadField,
  ReadFields,
  ReadFieldsSkeleton,
  ReadValue,
} from '@renderer/components/history/read-field';
import { textReading } from '@renderer/components/history/value-reading';
import { Button } from '@renderer/components/ui/button';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { type ChangeSyncState } from '@renderer/lib/changeSyncState';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import { type GitCommit, type Project } from '@elek-io/core';

// A change of the Project itself, as ci shows it: the Project once, read rather
// than edited, in the order its Settings show it, with what changed marked in
// place.

/**
 * The Project's languages as its Settings show them, joined the way the
 * language the app is read in joins a list.
 *
 * Each name comes from the system's own language data rather than from the
 * catalog, which is why the list is built rather than worded, see
 * `languageName`.
 */
function languageList(project: Project | undefined): string {
  if (project === undefined) {
    return '';
  }

  return new Intl.ListFormat(i18n.locale, {
    // Intl's own option names, which nobody reads.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    style: 'long',
    type: 'conjunction',
  }).format(
    project.settings.language.supported.map((language) =>
      languageName(language)
    )
  );
}

export interface ProjectChangeProps {
  /** The Project as it stands, which names the page while its states are read. */
  project: Project;
  commit: GitCommit;
  /** Every change of the Project, newest first, to find the one before this. */
  history: GitCommit[];
  syncState: ChangeSyncState;
}

/**
 * The chosen change of the Project: its name, its description, its languages
 * and its default language.
 *
 * ci lays it out in the order the Project's Settings show it. The change that
 * created the Project has no state before it, so it shows without marks, and
 * the Project is never deleted from its own History, since deleting it takes
 * the repository with it.
 */
export function ProjectChange({
  project,
  commit,
  history,
  syncState,
}: ProjectChangeProps): ReactElement {
  const { t } = useLingui();
  const { method } = commit.message;
  const projectId = project.id;
  const previous =
    method === 'create' ? undefined : changeBefore(history, commit);
  const isMarked = method !== 'create' && previous !== undefined;

  const afterQuery = useQueryNoError(
    queryOptions.projects.read({ id: projectId, commitHash: commit.hash })
  );
  const beforeQuery = useQueryNoError({
    ...queryOptions.projects.read({
      id: projectId,
      ...(previous === undefined ? {} : { commitHash: previous.hash }),
    }),
    enabled: previous !== undefined,
  });

  const isReading =
    afterQuery.isPending || (previous !== undefined && beforeQuery.isPending);
  const before = beforeQuery.data;
  const after = afterQuery.data;
  const name = textReading({
    before: before?.name ?? '',
    after: after?.name ?? '',
    isMarked,
  });
  const description = textReading({
    before: before?.description ?? '',
    after: after?.description ?? '',
    isMarked,
  });
  const languages = textReading({
    before: languageList(before),
    after: languageList(after),
    isMarked,
  });
  // One language out of the Project's, which is a choice rather than words, so
  // a change in it shows the old one beside the new one.
  const defaultLanguage = textReading({
    before:
      before === undefined
        ? ''
        : languageName(before.settings.language.default),
    after:
      after === undefined ? '' : languageName(after.settings.language.default),
    isMarked,
    readsAsWords: false,
  });

  return (
    <ChangePage
      commit={commit}
      title={after?.name ?? before?.name ?? ''}
      whatItIs={t`The whole Project`}
      syncState={syncState}
      open={
        <Button
          variant="outline"
          className="no-underline"
          render={
            <Link
              to="/projects/$projectId/settings/general"
              params={{ projectId }}
            />
          }
        >
          <Trans>Open settings</Trans>
        </Button>
      }
    >
      {isReading ? (
        <ReadFieldsSkeleton label={t`Reading this change`} />
      ) : (
        <ReadFields>
          <ReadField
            label={<Trans>Name</Trans>}
            isChanged={name.isChanged}
            className="col-span-12"
          >
            <ReadValue marks={name.marks} />
          </ReadField>
          <ReadField
            label={<Trans>Description</Trans>}
            isChanged={description.isChanged}
            className="col-span-12"
          >
            <ReadValue marks={description.marks} />
          </ReadField>
          <ReadField
            label={<Trans>Languages</Trans>}
            isChanged={languages.isChanged}
            className="col-span-12 @min-[344px]:col-span-6"
          >
            <ReadValue marks={languages.marks} />
          </ReadField>
          <ReadField
            label={<Trans>Default language</Trans>}
            isChanged={defaultLanguage.isChanged}
            className="col-span-12 @min-[344px]:col-span-6"
          >
            <ReadValue marks={defaultLanguage.marks} />
          </ReadField>
        </ReadFields>
      )}
    </ChangePage>
  );
}
