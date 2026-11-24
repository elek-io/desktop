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

import { type Collection, type GitCommit, type Project } from '@elek-io/core';

// What a change to a Collection looked like before and after it, for the
// History.
//
// It reads the Collection rather than filling a form with it, so the settings
// screen stays one editable page, see
// contributing/renderer/forms.md#view-only-forms-and-diffs.

/** One line of the settings, read rather than edited. */
function SettingLine({
  label,
  text,
}: {
  label: string;
  text: string;
}): React.JSX.Element {
  return (
    <FieldShell label={label} rules={fieldRules({ required: false })}>
      {() => <p className="text-sm">{text}</p>}
    </FieldShell>
  );
}

/** A Collection's settings as they stood at one commit. */
function CollectionSettings({
  collection,
}: {
  collection: Collection;
}): React.JSX.Element {
  const { t } = useLingui();
  const { translateContent } = useProject();

  return (
    <div className="flex flex-col gap-4 p-6">
      <SettingLine
        label={t`Collection name`}
        text={translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        })}
      />
      <SettingLine
        label={t`Entry name`}
        text={translateContent({
          key: 'collection.name.singular',
          record: collection.name.singular,
        })}
      />
      <SettingLine label={t`Collection slug`} text={collection.slug.plural} />
      <SettingLine label={t`Entry slug`} text={collection.slug.singular} />
      <SettingLine
        label={t`Description`}
        text={translateContent({
          key: 'collection.description',
          record: collection.description,
        })}
      />
      <div className="@container grid grid-cols-12 gap-x-6 gap-y-2 border-t pt-4">
        {collection.fieldDefinitions.map((fieldDefinition) =>
          'isGroup' in fieldDefinition ? (
            fieldDefinition.fieldDefinitions.map((member) => (
              <FieldDefinitionPreview
                key={member.id}
                fieldDefinition={member}
              />
            ))
          ) : (
            <FieldDefinitionPreview
              key={fieldDefinition.id}
              fieldDefinition={fieldDefinition}
            />
          )
        )}
      </div>
    </div>
  );
}

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

  const { data: collectionAfter, isPending: isReadingCollectionAfter } =
    useQueryNoError({
      ...queryOptions.collections.read({
        projectId: project.id,
        id: commit.message.reference.id,
        commitHash: commitAfter?.hash,
      }),
      enabled: commitAfter !== undefined,
    });

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
  // The object itself is read as well, since a query that is switched off
  // stays pending and so says nothing about what it holds.
  if (!commitBefore && commitAfter && collectionAfter !== undefined) {
    return (
      <DiffContainer type="create" commit={commitAfter}>
        <CollectionSettings collection={collectionAfter} />
      </DiffContainer>
    );
  }

  // Handle delete operation
  if (!commitAfter && commitBefore && collectionBefore !== undefined) {
    return (
      <DiffContainer type="delete" commit={commitBefore}>
        <CollectionSettings collection={collectionBefore} />
      </DiffContainer>
    );
  }

  // Handle update operation (both commits exist)
  if (
    commitBefore &&
    commitAfter &&
    collectionBefore !== undefined &&
    collectionAfter !== undefined
  ) {
    return (
      <>
        <DiffContainer type="before" commit={commitBefore}>
          <CollectionSettings collection={collectionBefore} />
        </DiffContainer>

        <DiffContainer type="after" commit={commitAfter}>
          <CollectionSettings collection={collectionAfter} />
        </DiffContainer>
      </>
    );
  }

  return <></>;
}
