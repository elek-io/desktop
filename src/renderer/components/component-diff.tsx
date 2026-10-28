import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { ComponentForm } from '@renderer/components/forms/component-form';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  updateComponentSchema,
  type GitCommit,
  type Project,
} from '@elek-io/core';

/**
 * What one commit changed about a Component, drawn with the same form the
 * editor uses, read-only. So the Component is named by the name somebody gave
 * it here too, and a field added to the editor shows up here with no extra
 * work. Modelled on `collection-diff.tsx`.
 */
export function ComponentDiff({
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

  const commitBefore = useMemo(() => {
    if (commit.message.method === 'create') {
      return undefined;
    }

    // History not loaded yet, the loading skeleton is shown below
    if (!history) {
      return undefined;
    }

    const componentCommitHistory = history.fullHistory.filter(
      (commitFromHistory) =>
        commitFromHistory.message.reference.objectType === 'component' &&
        commitFromHistory.message.reference.id === commit.message.reference.id
    );
    const currentCommitIndex = componentCommitHistory.findIndex(
      (commitFromHistory) => commitFromHistory.hash === commit.hash
    );
    const previousCommit = componentCommitHistory.at(currentCommitIndex + 1);

    if (!previousCommit) {
      throw new Error(
        `No previous commit found for Component "${commit.message.reference.id}" ` +
          `before "${commit.message.method}" at commit ${commit.hash}`
      );
    }

    return previousCommit;
  }, [commit, history]);

  const commitAfter = useMemo(() => {
    if (commit.message.method === 'delete') {
      return undefined;
    }
    return commit;
  }, [commit]);

  const { data: componentBefore, isPending: isReadingComponentBefore } =
    useQueryNoError({
      ...queryOptions.components.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitBefore?.hash,
      }),
      enabled: commitBefore !== undefined,
    });

  // Seeded inline rather than from a shared object, so react-hook-form infers
  // the form values from the resolver and reads these as its deep partial. A
  // shared const would pin the value type to its own narrower shape instead.
  const componentFormBefore = useForm({
    resolver: zodResolver(updateComponentSchema),
    defaultValues: {
      projectId: project.id,
      id: commit.message.reference.id,
      name: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      slug: '',
      description: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      fieldDefinitions: [],
    },
  });

  useEffect(() => {
    if (isReadingComponentBefore === false) {
      componentFormBefore.reset({
        ...componentBefore,
        projectId: project.id,
      });
    }
  }, [
    isReadingComponentBefore,
    componentFormBefore,
    componentBefore,
    project.id,
  ]);

  const { data: componentAfter, isPending: isReadingComponentAfter } =
    useQueryNoError({
      ...queryOptions.components.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
    });

  const componentFormAfter = useForm({
    resolver: zodResolver(updateComponentSchema),
    defaultValues: {
      projectId: project.id,
      id: commit.message.reference.id,
      name: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      slug: '',
      description: translatableDefault({
        supportedLanguages: project.settings.language.supported,
        defaultValue: '',
      }),
      fieldDefinitions: [],
    },
  });

  useEffect(() => {
    if (isReadingComponentAfter === false) {
      componentFormAfter.reset({
        ...componentAfter,
        projectId: project.id,
      });
    }
  }, [isReadingComponentAfter, componentFormAfter, componentAfter, project.id]);

  if (
    isReadingHistory ||
    (commitBefore && isReadingComponentBefore) ||
    (commitAfter && isReadingComponentAfter)
  ) {
    if (commitBefore && commitAfter) {
      return (
        <>
          <DiffContainerSkeleton />
          <DiffContainerSkeleton />
        </>
      );
    }
    return <DiffContainerSkeleton centered />;
  }

  if (!commitBefore && commitAfter) {
    return (
      <DiffContainer type="create" commit={commitAfter}>
        <ComponentForm
          project={project}
          componentForm={componentFormAfter}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  if (!commitAfter && commitBefore) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <ComponentForm
          project={project}
          componentForm={componentFormBefore}
          isViewOnly
        />
      </DiffContainer>
    );
  }

  if (commitBefore && commitAfter) {
    return (
      <>
        <DiffContainer type="before" commit={commitBefore}>
          <ComponentForm
            project={project}
            componentForm={componentFormBefore}
            isViewOnly
          />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <ComponentForm
            project={project}
            componentForm={componentFormAfter}
            isViewOnly
          />
        </DiffContainer>
      </>
    );
  }

  return <></>;
}
