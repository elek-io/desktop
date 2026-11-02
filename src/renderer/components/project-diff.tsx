import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import {
  ProjectForm,
  type ProjectFormValues,
} from '@renderer/components/forms/project-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  createProjectSchema,
  type GitCommit,
  type Project,
} from '@elek-io/core';

export function ProjectDiff({
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

    const projectCommitHistory = history.fullHistory.filter(
      (commitFromHistory) =>
        commitFromHistory.message.reference.objectType === 'project' &&
        commitFromHistory.message.reference.id === commit.message.reference.id
    );
    const currentCommitIndex = projectCommitHistory.findIndex(
      (commitFromHistory) => commitFromHistory.hash === commit.hash
    );
    const previousCommit = projectCommitHistory.at(currentCommitIndex + 1);

    if (!previousCommit) {
      throw new Error(
        `No previous commit found for Project "${commit.message.reference.id}" ` +
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

  const { data: projectBefore, isPending: isReadingProjectBefore } =
    useQueryNoError({
      ...queryOptions.projects.read({
        id: project.id,
        commitHash: commitBefore?.hash,
      }),
      enabled: commitBefore !== undefined,
    });

  const projectFormBefore = useAppForm<ProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      settings: {
        // Language codes, which are the same in every language.
        /* eslint-disable lingui/no-unlocalized-strings */
        language: {
          default: 'en',
          supported: ['en'],
        },
        /* eslint-enable lingui/no-unlocalized-strings */
      },
    },
    // Filled from the query rather than reset in an effect.
    ...(isReadingProjectBefore
      ? {}
      : {
          values: {
            name: projectBefore.name,
            description: projectBefore.description,
            settings: projectBefore.settings,
          },
        }),
    disabled: isReadingProjectBefore,
  });

  const { data: projectAfter, isPending: isReadingProjectAfter } =
    useQueryNoError({
      ...queryOptions.projects.read({
        id: project.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
    });

  const projectFormAfter = useAppForm<ProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      settings: {
        /* eslint-disable lingui/no-unlocalized-strings */
        language: {
          default: 'en',
          supported: ['en'],
        },
        /* eslint-enable lingui/no-unlocalized-strings */
      },
    },
    // Filled from the query rather than reset in an effect.
    ...(isReadingProjectAfter
      ? {}
      : {
          values: {
            name: projectAfter.name,
            description: projectAfter.description,
            settings: projectAfter.settings,
          },
        }),
    disabled: isReadingProjectAfter,
  });

  // Show loading skeleton while queries are pending
  if (
    isReadingHistory ||
    (commitBefore && isReadingProjectBefore) ||
    (commitAfter && isReadingProjectAfter)
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
        <ProjectForm
          schema={createProjectSchema}
          projectForm={projectFormAfter}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  // Handle delete operation
  if (!commitAfter && commitBefore) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <ProjectForm
          schema={createProjectSchema}
          projectForm={projectFormBefore}
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
          <ProjectForm
            schema={createProjectSchema}
            projectForm={projectFormBefore}
            isViewOnly
          />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <ProjectForm
            schema={createProjectSchema}
            projectForm={projectFormAfter}
            isViewOnly
          />
        </DiffContainer>
      </>
    );
  }

  return <></>;
}
