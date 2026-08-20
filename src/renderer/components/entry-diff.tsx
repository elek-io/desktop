import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { EntryForm } from '@renderer/components/forms/entry-form';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { updateEntrySchema, type GitCommit, type Project } from '@elek-io/core';

export function EntryDiff({
  project,
  commit,
}: {
  project: Project;
  commit: GitCommit;
}): React.JSX.Element | undefined {
  const collectionId = commit.message.reference.collectionId;
  if (collectionId === undefined) {
    throw new Error(
      `Entry commit ${commit.hash} missing collectionId reference`
    );
  }

  // Fetch collection for field definitions
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({ projectId: project.id, id: collectionId })
  );

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

    const entryCommitHistory = history.fullHistory.filter(
      (commitFromHistory) =>
        commitFromHistory.message.reference.objectType === 'entry' &&
        commitFromHistory.message.reference.id === commit.message.reference.id
    );
    const currentCommitIndex = entryCommitHistory.findIndex(
      (commitFromHistory) => commitFromHistory.hash === commit.hash
    );
    const previousCommit = entryCommitHistory.at(currentCommitIndex + 1);

    if (!previousCommit) {
      throw new Error(
        `No previous commit found for Entry "${commit.message.reference.id}" ` +
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

  const { data: entryBefore, isPending: isReadingEntryBefore } =
    useQueryNoError({
      ...queryOptions.entries.read({
        projectId: project.id,
        collectionId,
        id: commit.message.reference.id,
        commitHash: commitBefore?.hash,
      }),
      enabled: commitBefore !== undefined,
    });

  const entryFormBefore = useForm({
    resolver: zodResolver(updateEntrySchema),
    defaultValues: {
      projectId: project.id,
      collectionId,
      id: commit.message.reference.id,
      values: {},
    },
  });

  useEffect(() => {
    if (isReadingEntryBefore === false) {
      entryFormBefore.reset(entryBefore);
    }
  }, [isReadingEntryBefore, entryFormBefore, entryBefore]);

  const { data: entryAfter, isPending: isReadingEntryAfter } = useQueryNoError({
    ...queryOptions.entries.read({
      projectId: project.id,
      collectionId,
      id: commit.message.reference.id,
      commitHash: commitAfter?.hash,
    }),
    enabled: commitAfter !== undefined,
  });

  const entryFormAfter = useForm({
    resolver: zodResolver(updateEntrySchema),
    defaultValues: {
      projectId: project.id,
      collectionId,
      id: commit.message.reference.id,
      values: {},
    },
  });

  useEffect(() => {
    if (isReadingEntryAfter === false) {
      entryFormAfter.reset(entryAfter);
    }
  }, [isReadingEntryAfter, entryFormAfter, entryAfter]);

  // Show loading skeleton while any query is pending
  if (
    isReadingCollection ||
    isReadingHistory ||
    (commitBefore && isReadingEntryBefore) ||
    (commitAfter && isReadingEntryAfter)
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
    return (
      <DiffContainer type="create" commit={commitAfter}>
        <EntryForm
          entryForm={entryFormAfter}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  // Handle delete operation
  if (!commitAfter && commitBefore) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <EntryForm
          entryForm={entryFormBefore}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  // Handle update operation (both commits exist)
  if (commitBefore && commitAfter) {
    return (
      <>
        <DiffContainer type="before" commit={commitBefore}>
          <EntryForm
            entryForm={entryFormBefore}
            fieldDefinitions={collection.fieldDefinitions}
            project={project}
            isViewOnly
          />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <EntryForm
            entryForm={entryFormAfter}
            fieldDefinitions={collection.fieldDefinitions}
            project={project}
            isViewOnly
          />
        </DiffContainer>
      </>
    );
  }

  return undefined;
}
