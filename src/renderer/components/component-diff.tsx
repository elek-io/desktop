import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { ComponentForm } from '@renderer/components/forms/component-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
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
  const componentFormBefore = useAppForm({
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
    // Filled from the query rather than reset in an effect.
    ...(isReadingComponentBefore
      ? {}
      : {
          values: {
            projectId: project.id,
            id: componentBefore.id,
            name: componentBefore.name,
            slug: componentBefore.slug,
            description: componentBefore.description,
            fieldDefinitions: componentBefore.fieldDefinitions,
          },
        }),
    disabled: isReadingComponentBefore,
  });

  const { data: componentAfter, isPending: isReadingComponentAfter } =
    useQueryNoError({
      ...queryOptions.components.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
    });

  const componentFormAfter = useAppForm({
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
    // Filled from the query rather than reset in an effect.
    ...(isReadingComponentAfter
      ? {}
      : {
          values: {
            projectId: project.id,
            id: componentAfter.id,
            name: componentAfter.name,
            slug: componentAfter.slug,
            description: componentAfter.description,
            fieldDefinitions: componentAfter.fieldDefinitions,
          },
        }),
    disabled: isReadingComponentAfter,
  });

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
          schema={updateComponentSchema}
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
          schema={updateComponentSchema}
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
            schema={updateComponentSchema}
            project={project}
            componentForm={componentFormBefore}
            isViewOnly
          />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <ComponentForm
            schema={updateComponentSchema}
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
