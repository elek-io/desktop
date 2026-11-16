import { useMemo } from 'react';

import { AssetCard } from '@renderer/components/asset-card';
import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { type GitCommit, type Project } from '@elek-io/core';

export function AssetDiff({
  project,
  commit,
}: {
  project: Project;
  commit: GitCommit;
}): React.JSX.Element | undefined {
  // Fetch the Project's full history to find the commit before this one
  const { data: history, isPending: isReadingHistory } = useQueryNoError(
    queryOptions.projects.history({ id: project.id })
  );

  // Derive commitBefore during render with useMemo
  const commitBefore = useMemo(() => {
    if (commit.message.method === 'create') {
      return undefined;
    }

    // History not loaded yet, the loading skeleton is shown below
    if (!history) {
      return undefined;
    }

    const assetCommitHistory = history.fullHistory.filter(
      (commitFromHistory) =>
        commitFromHistory.message.reference.objectType === 'asset' &&
        commitFromHistory.message.reference.id === commit.message.reference.id
    );
    const currentCommitIndex = assetCommitHistory.findIndex(
      (commitFromHistory) => commitFromHistory.hash === commit.hash
    );
    const previousCommit = assetCommitHistory.at(currentCommitIndex + 1);

    if (!previousCommit) {
      throw new Error(
        `No previous commit found for Asset "${commit.message.reference.id}" ` +
          `before "${commit.message.method}" at commit ${commit.hash}`
      );
    }

    return previousCommit;
  }, [commit, history]);

  // Derive commitAfter during render with useMemo
  const commitAfter = useMemo(() => {
    if (commit.message.method === 'delete') {
      return undefined;
    }
    return commit;
  }, [commit]);

  const { data: assetBefore, isPending: isReadingAssetBefore } =
    useQueryNoError({
      ...queryOptions.assets.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitBefore?.hash,
      }),
      enabled: commitBefore !== undefined,
    });

  const { data: assetAfter, isPending: isReadingAssetAfter } = useQueryNoError({
    ...queryOptions.assets.read({
      projectId: project.id,
      id: commit.message.reference.id,
      commitHash: commitAfter?.hash,
    }),
    enabled: commitAfter !== undefined,
  });

  // Show loading skeleton while queries are pending
  if (
    isReadingHistory ||
    (commitBefore && isReadingAssetBefore) ||
    (commitAfter && isReadingAssetAfter)
  ) {
    // Show appropriate number of skeletons based on operation
    if (commitBefore && commitAfter) {
      // Update operation - show 2 skeletons
      return (
        <>
          <DiffContainerSkeleton />
          <DiffContainerSkeleton />
        </>
      );
    }
    // Create or delete operation - show 1 centered skeleton
    return <DiffContainerSkeleton centered />;
  }

  // Handle create operation
  if (!commitBefore && commitAfter) {
    if (assetAfter === undefined) {
      return <DiffContainerSkeleton centered />;
    }
    return (
      <DiffContainer type="create" commit={commitAfter}>
        <AssetCard asset={assetAfter} />
      </DiffContainer>
    );
  }

  // Handle delete operation
  if (!commitAfter && commitBefore) {
    if (assetBefore === undefined) {
      return <DiffContainerSkeleton centered />;
    }
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <AssetCard asset={assetBefore} />
      </DiffContainer>
    );
  }

  // Handle update operation (both commits exist)
  if (commitBefore && commitAfter) {
    if (assetBefore === undefined || assetAfter === undefined) {
      return <DiffContainerSkeleton centered />;
    }
    return (
      <>
        <DiffContainer type="before" commit={commitBefore}>
          <AssetCard asset={assetBefore} />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <AssetCard asset={assetAfter} />
        </DiffContainer>
      </>
    );
  }

  return undefined;
}
