import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { CollectionForm } from '@renderer/components/forms/collection-form';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  updateCollectionSchema,
  type GitCommit,
  type Project,
} from '@elek-io/core';

export function CollectionDiff({
  project,
  commit,
}: {
  project: Project;
  commit: GitCommit;
}): React.JSX.Element {
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

    const collectionCommitHistory = history.fullHistory.filter(
      (commitFromHistory) =>
        commitFromHistory.message.reference.objectType === 'collection' &&
        commitFromHistory.message.reference.id === commit.message.reference.id
    );
    const currentCommitIndex = collectionCommitHistory.findIndex(
      (commitFromHistory) => commitFromHistory.hash === commit.hash
    );
    const previousCommit = collectionCommitHistory.at(currentCommitIndex + 1);

    if (!previousCommit) {
      throw new Error(
        `No previous commit found for Collection "${commit.message.reference.id}" ` +
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

  const { data: collectionBefore, isPending: isReadingCollectionBefore } =
    useQueryNoError({
      ...queryOptions.collections.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitBefore?.hash,
      }),
      enabled: commitBefore !== undefined,
    });

  const collectionFormBefore = useForm({
    resolver: zodResolver(updateCollectionSchema),
    defaultValues: {
      projectId: project.id,
      icon: 'home',
      name: {
        singular: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
        plural: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
      },
      description: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      slug: {
        singular: '',
        plural: '',
      },
      fieldDefinitions: [],
    },
  });

  useEffect(() => {
    if (isReadingCollectionBefore === false) {
      collectionFormBefore.reset(collectionBefore);
    }
  }, [isReadingCollectionBefore, collectionFormBefore, collectionBefore]);

  const { data: collectionAfter, isPending: isReadingCollectionAfter } =
    useQueryNoError({
      ...queryOptions.collections.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
    });

  const collectionFormAfter = useForm({
    resolver: zodResolver(updateCollectionSchema),
    defaultValues: {
      projectId: project.id,
      icon: 'home',
      name: {
        singular: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
        plural: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
      },
      description: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      slug: {
        singular: '',
        plural: '',
      },
      fieldDefinitions: [],
    },
  });

  useEffect(() => {
    if (isReadingCollectionAfter === false) {
      collectionFormAfter.reset(collectionAfter);
    }
  }, [isReadingCollectionAfter, collectionFormAfter, collectionAfter]);

  // Show loading skeleton while queries are pending
  if (
    isReadingHistory ||
    (commitBefore && isReadingCollectionBefore) ||
    (commitAfter && isReadingCollectionAfter)
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
        <CollectionForm
          project={project}
          collectionForm={collectionFormAfter}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  // Handle delete operation
  if (!commitAfter && commitBefore) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <CollectionForm
          project={project}
          collectionForm={collectionFormBefore}
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
          <CollectionForm
            project={project}
            collectionForm={collectionFormBefore}
            isViewOnly
          />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <CollectionForm
            project={project}
            collectionForm={collectionFormAfter}
            isViewOnly
          />
        </DiffContainer>
      </>
    );
  }

  return <></>;
}
