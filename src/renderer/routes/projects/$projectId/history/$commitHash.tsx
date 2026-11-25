import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { CollectionDiff } from '@renderer/components/collection-diff';
import { ComponentDiff } from '@renderer/components/component-diff';
import { AssetChange } from '@renderer/components/history/asset-change';
import { ChangePage } from '@renderer/components/history/change-page';
import { EntryChange } from '@renderer/components/history/entry-change';
import { ProjectChange } from '@renderer/components/history/project-change';
import { ReadFieldsSkeleton } from '@renderer/components/history/read-field';
import { ReleaseChange } from '@renderer/components/history/release-change';
import { Page } from '@renderer/components/page';
import { Pane } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useProjectState } from '@renderer/hooks/useProjectState';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { changeSentence } from '@renderer/lib/changeSentence';
import {
  changeSyncState,
  type ChangeSyncState,
} from '@renderer/lib/changeSyncState';
import { entryLanguageSearchSchema } from '@renderer/lib/entryLanguage';
import { queryOptions } from '@renderer/queries';

import {
  isVersionedTag,
  type GitCommit,
  type Project,
  type SupportedLanguage,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/history/$commitHash'
)({
  component: ProjectHistoryCommitPage,
  // The language an Entry's change is read in lives in the address, as it does
  // in the Entry's own editor, so a link can name one and coming back opens
  // the language that was left open.
  validateSearch: entryLanguageSearchSchema,
});

/**
 * The head of a change whose object cannot be read, which says what happened
 * and nothing more.
 *
 * Core writes no commit that lands here today: it is what a reference naming
 * a Value, or an Entry without its Collection, would leave.
 */
function NothingToShow({
  commit,
  syncState,
}: {
  commit: GitCommit;
  syncState: ChangeSyncState;
}): ReactElement {
  const { t } = useLingui();

  return (
    <ChangePage
      commit={commit}
      title={t`This change`}
      whatItIs={t`A change of this Project`}
      syncState={syncState}
    >
      <p className="py-4 text-muted-foreground">
        <Trans>Desktop can&apos;t show what this change holds.</Trans>
      </p>
    </ChangePage>
  );
}

/**
 * A Collection's and a Component's change, still shown as the two states side
 * by side.
 *
 * It is the last change the History draws that way. The screen that lays a
 * changed Collection and Component out like their settings, read-only and
 * marked, replaces it.
 */
function ObjectDiffPage({
  project,
  commit,
  isCollection,
}: {
  project: Project;
  commit: GitCommit;
  isCollection: boolean;
}): ReactElement {
  const {
    userQuery: { data: user },
  } = useProject();

  return (
    // What happened, in the sentence the row of this change reads, until the
    // head of a changed Collection names the Collection itself.
    <Page title={changeSentence(commit, user?.email === commit.author.email)}>
      <div className="grid grid-cols-12 gap-6">
        {isCollection ? (
          <CollectionDiff project={project} commit={commit} />
        ) : (
          <ComponentDiff project={project} commit={commit} />
        )}
      </div>
    </Page>
  );
}

/**
 * What the chosen change changed, by the kind of object it was about.
 *
 * A Release is answered first, because Core writes it as a change of the
 * Project with the Release's own tag on it, and ci shows it as a Release
 * rather than as the Project.
 */
function WhatItChanged({
  project,
  commit,
  history,
  syncState,
  language,
  onLanguageChange,
}: {
  project: Project;
  commit: GitCommit;
  history: GitCommit[];
  syncState: ChangeSyncState;
  language: SupportedLanguage | undefined;
  onLanguageChange: (language: SupportedLanguage) => void;
}): ReactElement {
  const { method, reference } = commit.message;
  const { tag } = commit;

  if (method === 'release' && tag !== null && isVersionedTag(tag)) {
    return (
      <ReleaseChange
        project={project}
        commit={commit}
        tag={tag}
        syncState={syncState}
      />
    );
  }

  switch (reference.objectType) {
    case 'entry':
      // Core writes an Entry's Collection into the commit, and an Entry cannot
      // be read without it.
      return reference.collectionId === undefined ? (
        <NothingToShow commit={commit} syncState={syncState} />
      ) : (
        <EntryChange
          project={project}
          commit={commit}
          collectionId={reference.collectionId}
          history={history}
          syncState={syncState}
          search={{ language }}
          onLanguageChange={onLanguageChange}
        />
      );
    case 'asset':
      return (
        <AssetChange
          project={project}
          commit={commit}
          history={history}
          syncState={syncState}
        />
      );
    case 'project':
      return (
        <ProjectChange
          project={project}
          commit={commit}
          history={history}
          syncState={syncState}
        />
      );
    case 'collection':
      return <ObjectDiffPage project={project} commit={commit} isCollection />;
    case 'component':
      return (
        <ObjectDiffPage
          project={project}
          commit={commit}
          isCollection={false}
        />
      );
    // A Value belongs to an Entry, whose own id the commit does not carry, so
    // there is nothing to read it from.
    case 'value':
      return <NothingToShow commit={commit} syncState={syncState} />;
  }
}

/** The chosen change, with the state of the Git repository it is read against. */
function ChosenChange({
  project,
  commit,
  history,
}: {
  project: Project;
  commit: GitCommit;
  history: GitCommit[];
}): ReactElement {
  const navigate = Route.useNavigate();
  const { language } = Route.useSearch();
  // The same check the sidebar's Project card runs above this pane, so the
  // head here and the groups of the list beside it cannot disagree, and a
  // check that failed is a state rather than the error screen, see
  // contributing/error-handling.md.
  const state = useProjectState(project);
  const syncState = changeSyncState({ state, whenUntold: 'plain' })(commit);

  return (
    <WhatItChanged
      project={project}
      commit={commit}
      history={history}
      syncState={syncState}
      language={language}
      onLanguageChange={(next) => {
        // It replaces rather than pushes, so the way back leads out of the
        // change rather than through every language that was looked at, and
        // the change stays where it was scrolled to.
        void navigate({
          search: (previous) => ({ ...previous, language: next }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
}

/**
 * The change the address names, shown in the pane beside the list.
 *
 * Which change it is comes out of the Project's History, which the list beside
 * this pane already read, so opening one change after another costs no read of
 * its own.
 */
function ProjectHistoryCommitPage(): ReactElement {
  const { t } = useLingui();

  const { projectId, commitHash } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    userQuery: { data: user },
  } = useProject();
  const { data: history, isPending: isReadingHistory } = useQueryNoError(
    queryOptions.projects.history({ id: projectId })
  );
  const commit = isReadingHistory
    ? undefined
    : history.fullHistory.find((listed) => listed.hash === commitHash);
  useBreadcrumb(
    Route,
    commit === undefined
      ? undefined
      : changeSentence(commit, user?.email === commit.author.email)
  );

  return (
    <Pane name={t`this change`}>
      {isReadingProject || isReadingHistory ? (
        <div className="p-(--pane-edge)">
          <ReadFieldsSkeleton label={t`Reading this change`} />
        </div>
      ) : commit === undefined ? (
        // In plain text without the gradient, because the Project's History is
        // not empty, as a filter without matches says so plainly.
        <div className="flex flex-1 items-center justify-center p-(--pane-edge)">
          <p className="text-center text-muted-foreground">
            <Trans>This change isn&apos;t in the History of this Project</Trans>
          </p>
        </div>
      ) : (
        <ChosenChange
          project={project}
          commit={commit}
          history={history.fullHistory}
        />
      )}
    </Pane>
  );
}
