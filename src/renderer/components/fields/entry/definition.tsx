import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { useWatch } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  entryFieldDefinitionSchema,
  uuid,
  type EntryFieldDefinition,
} from '@elek-io/core';

// Authoring for the entry field type. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The ofCollections picker is backed by a Collections list query. That query and
// its projectId hook stay inside the Extras component, so the shared engine
// never learns about queries.

function EntryExtras({
  form,
}: DefinitionExtrasProps<EntryFieldDefinition>): ReactElement {
  const { projectId, translateContent } = useProject();
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  const selectedCollectionIds = useWatch({
    control: form.control,
    name: 'ofCollections',
  });

  function toggleCollection(collectionId: string): void {
    form.setValue(
      'ofCollections',
      selectedCollectionIds.includes(collectionId)
        ? selectedCollectionIds.filter((id) => id !== collectionId)
        : [...selectedCollectionIds, collectionId]
    );
  }

  return (
    <>
      <AppField
        form={form}
        name="ofCollections"
        label={<Trans>Restrict to Collections</Trans>}
        required
        description={
          <Trans>
            Only Entries from the selected Collections can be referenced. If
            none are selected, Entries from all Collections are available.
          </Trans>
        }
      >
        {({ controlProps }) => (
          <div className="space-y-2" {...controlProps}>
            {isReadingCollections === true ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => {
                  const key = `skeleton-${String(i)}`;
                  return <Skeleton key={key} className="h-10" />;
                })}
              </div>
            ) : collectionList.list.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Trans>No Collections available in this project.</Trans>
              </p>
            ) : (
              collectionList.list.map((collection) => {
                const name = translateContent({
                  key: 'collection.name.plural',
                  record: collection.name.plural,
                });
                return (
                  <div
                    key={collection.id}
                    className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
                  >
                    <div className="mr-4">
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                    <Switch
                      aria-label={name}
                      checked={selectedCollectionIds.includes(collection.id)}
                      onCheckedChange={() => toggleCollection(collection.id)}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}
      </AppField>

      <div className="flex flex-row items-center justify-between space-x-2">
        <AppField
          form={form}
          name="min"
          label={<Trans>Minimum</Trans>}
          description={
            <Trans>
              The minimum number of Entries the user needs to select.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
        <AppField
          form={form}
          name="max"
          label={<Trans>Maximum</Trans>}
          description={
            <Trans>
              The maximum number of Entries the user is able to select.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
      </div>
    </>
  );
}

const entrySpec: DefinitionSpec<EntryFieldDefinition> = {
  resolver: zodResolver(entryFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'reference',
    fieldType: 'entry',
    isUnique: false,
    ofCollections: [],
    min: null,
    max: null,
  }),
  Extras: EntryExtras,
};

/** The entry authoring entry: a DefinitionDraft over the entry spec. */
export function EntryDefinitionDraft(
  props: DefinitionDraftProps
): ReactElement {
  return <DefinitionDraft {...props} spec={entrySpec} />;
}
