import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { AssetDiff } from '@renderer/components/asset-diff';
import { CollectionDiff } from '@renderer/components/collection-diff';
import { ComponentDiff } from '@renderer/components/component-diff';
import { DiffContainerSkeleton } from '@renderer/components/diff-container';
import { EntryDiff } from '@renderer/components/entry-diff';
import { Page } from '@renderer/components/page';
import { ProjectDiff } from '@renderer/components/project-diff';
import { Badge } from '@renderer/components/ui/badge';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { type GitCommit } from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/history/$commitHash'
)({
  component: ProjectHistoryCommitPage,
});

function ProjectHistoryCommitPage(): ReactElement {
  const { projectId, commitHash } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    formatDatetime,
  } = useProject();
  const { data: history } = useQueryNoError(
    queryOptions.projects.history({ id: projectId })
  );
  const [commit, setCommit] = useState<GitCommit | null>(null);
  useBreadcrumb(
    Route,
    commit
      ? `${commit.message.method} ${commit.message.reference.objectType} (${formatDatetime({ datetime: commit.datetime }).relative})`
      : undefined
  );

  useEffect(() => {
    if (history !== undefined) {
      setCommit(
        history.fullHistory.find(
          (commitFromHistory) => commitFromHistory.hash === commitHash
        ) || null
      );
    }
  }, [history, commitHash]);

  function DisplayChanges(): ReactElement {
    if (!commit || isReadingProject) {
      return (
        <>
          <DiffContainerSkeleton />
          <DiffContainerSkeleton />
        </>
      );
    }

    switch (commit.message.reference.objectType) {
      case 'value':
        return <></>;
      case 'project':
        return <ProjectDiff project={project} commit={commit} />;
      case 'asset':
        return <AssetDiff project={project} commit={commit} />;
      case 'collection':
        return <CollectionDiff project={project} commit={commit} />;
      case 'entry':
        return <EntryDiff project={project} commit={commit} />;
      case 'component':
        return <ComponentDiff project={project} commit={commit} />;
      default:
        return <Trans>Object changes</Trans>;
    }
  }

  function Description(): ReactElement {
    return (
      <>
        {commit && commit.tag ? (
          <>
            <br />
            <Badge className="relative mt-2" variant="secondary">
              <Tag className="absolute -right-3 -bottom-2 h-4 w-4" />
              <TagLabel message={commit.tag.message} />
            </Badge>
          </>
        ) : null}
      </>
    );
  }

  return (
    <Page
      title={
        commit
          ? `${commit.message.method} ${commit.message.reference.objectType}`
          : ''
      }
      description={<Description />}
    >
      <div className="grid grid-cols-12 gap-6">
        <DisplayChanges />
      </div>
    </Page>
  );
}

/**
 * What a tag says, as one sentence per kind rather than a word dropped into
 * one, since a word that carries grammar cannot be translated on its own.
 */
function TagLabel({
  message,
}: {
  message: NonNullable<GitCommit['tag']>['message'];
}): ReactElement {
  if (message.type === 'upgrade') {
    const { coreVersion } = message;
    return <Trans>Core {coreVersion}</Trans>;
  }
  const { version } = message;
  return message.type === 'release' ? (
    <Trans>Release {version}</Trans>
  ) : (
    <Trans>Preview {version}</Trans>
  );
}
