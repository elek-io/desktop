import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { Page } from '@renderer/components/page';
import { Pane } from '@renderer/components/pane';
import { StateMarker } from '@renderer/components/project-state';
import {
  ReleaseSummary,
  ReleaseSummarySkeleton,
} from '@renderer/components/release-summary';
import { Button } from '@renderer/components/ui/button';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { bumpReason, describeReleaseChanges } from '@renderer/lib/release';
import { queryOptions } from '@renderer/queries';

import { type ReleaseListItem } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/releases/$tagId')({
  component: ProjectReleasePage,
});

/**
 * The chosen Release beside the list: what it is, who published it and when,
 * then the version it moved to and what it changed.
 *
 * What it changed comes from Core, which reports a Release that was published
 * in the shape a pending one is read in, so the same summary draws both, see
 * `components/release-summary.tsx`. Who published it is on the Release's own
 * tag, which `releases.list` answers, and that list is what the pane beside
 * this one already read.
 */
function ProjectReleasePage(): ReactElement {
  const { t } = useLingui();

  const { projectId, tagId } = Route.useParams();
  const { data: diff, isPending: isReadingChanges } = useQueryNoError(
    queryOptions.releases.changes({ projectId, tagId })
  );
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );
  const release = isListingReleases
    ? undefined
    : releases.list.find((listed) => listed.tagId === tagId);
  const version = release?.version ?? '';
  const isPreview = release?.type === 'preview';
  useBreadcrumb(
    Route,
    release === undefined
      ? undefined
      : isPreview
        ? t`Preview ${version}`
        : t`Release ${version}`
  );

  return (
    <Pane name={t`this Release`}>
      <Page
        title={
          release === undefined
            ? ''
            : isPreview
              ? t`Preview ${version}`
              : t`Release ${version}`
        }
        actions={<OpenInHistory projectId={projectId} tagId={tagId} />}
      >
        {release === undefined ? null : <WhoReleasedIt release={release} />}
        {isReadingChanges ? (
          <ReleaseSummarySkeleton />
        ) : (
          <ReleaseSummary
            diff={diff}
            reason={bumpReason(diff.bump, describeReleaseChanges(diff))}
          />
        )}
      </Page>
    </Pane>
  );
}

/**
 * What the Release is about, who published it and when, as ci writes the line
 * below the title.
 *
 * The brand marker, because this is the Release the line is about, and the
 * sentence says it is the whole Project rather than one Entry or Collection,
 * which is what every other change of the History names there.
 */
function WhoReleasedIt({
  release,
}: {
  release: ReleaseListItem;
}): ReactElement {
  const { t } = useLingui();
  const {
    formatDatetime,
    userQuery: { data: user },
  } = useProject();
  const when = formatDatetime({ datetime: release.datetime }).absolute;
  const author = release.author.name;
  const byYou = user?.email === release.author.email;

  return (
    <p className="mb-4 flex items-center gap-2 text-small text-muted-foreground">
      <StateMarker variant="release" />
      <span>
        {byYou
          ? t`The whole Project. You released it on ${when}`
          : t`The whole Project. ${author} released it on ${when}`}
      </span>
    </p>
  );
}

/**
 * The way into the History, where the Release stands among the changes it
 * published.
 *
 * The History addresses a change by the commit it is, and a Release's own tag
 * names the commit it points at, so the commit is looked up in the Project's
 * History rather than worked out here. The link appears once that read
 * answers, like every other way on a head gains when what names it is read.
 */
function OpenInHistory({
  projectId,
  tagId,
}: {
  projectId: string;
  tagId: string;
}): ReactElement {
  const { data: history, isPending: isReadingHistory } = useQueryNoError(
    queryOptions.projects.history({ id: projectId })
  );
  const commit = isReadingHistory
    ? undefined
    : history.fullHistory.find((listed) => listed.tag?.id === tagId);

  if (commit === undefined) {
    return <></>;
  }

  return (
    <Button
      variant="outline"
      className="no-underline"
      render={
        <Link
          to="/projects/$projectId/history/$commitHash"
          params={{ projectId, commitHash: commit.hash }}
        />
      }
    >
      <Trans>Open in History</Trans>
    </Button>
  );
}
