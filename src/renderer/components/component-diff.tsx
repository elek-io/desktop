import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import {
  DiffContainer,
  DiffContainerSkeleton,
} from '@renderer/components/diff-container';
import { FieldDefinitionPreview } from '@renderer/components/fields/field-from-definition';
import { FieldShell } from '@renderer/components/ui/app-form';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { fieldRules } from '@renderer/lib/fieldRules';
import { queryOptions } from '@renderer/queries';

import { type Component, type GitCommit, type Project } from '@elek-io/core';

/** A Component as it stood at one commit, read rather than edited. */
function ComponentSettings({
  component,
}: {
  component: Component;
}): React.JSX.Element {
  const { t } = useLingui();
  const { translateContent } = useProject();
  const line = (label: string, text: string): React.JSX.Element => (
    <FieldShell label={label} rules={fieldRules({ required: false })}>
      {() => <p className="text-sm">{text}</p>}
    </FieldShell>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      {line(
        t`Component name`,
        translateContent({ key: 'component.name', record: component.name })
      )}
      {line(t`Component slug`, component.slug)}
      {line(
        t`Description`,
        component.description === null
          ? ''
          : translateContent({
              key: 'component.description',
              record: component.description,
            })
      )}
      <div className="@container grid grid-cols-12 gap-x-6 gap-y-2 border-t pt-4">
        {component.fieldDefinitions.map((fieldDefinition) => (
          <FieldDefinitionPreview
            key={fieldDefinition.id}
            fieldDefinition={fieldDefinition}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * What one commit changed about a Component, read at the commit before it and
 * at the commit itself. Modelled on `collection-diff.tsx`.
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

  const { data: componentAfter, isPending: isReadingComponentAfter } =
    useQueryNoError({
      ...queryOptions.components.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
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

  // The object itself is read as well, since a query that is switched off
  // stays pending and so says nothing about what it holds.
  if (!commitBefore && commitAfter && componentAfter !== undefined) {
    return (
      <DiffContainer type="create" commit={commitAfter}>
        <ComponentSettings component={componentAfter} />
      </DiffContainer>
    );
  }

  if (!commitAfter && commitBefore && componentBefore !== undefined) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <ComponentSettings component={componentBefore} />
      </DiffContainer>
    );
  }

  if (
    commitBefore &&
    commitAfter &&
    componentBefore !== undefined &&
    componentAfter !== undefined
  ) {
    return (
      <>
        <DiffContainer type="before" commit={commitBefore}>
          <ComponentSettings component={componentBefore} />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <ComponentSettings component={componentAfter} />
        </DiffContainer>
      </>
    );
  }

  return <></>;
}
