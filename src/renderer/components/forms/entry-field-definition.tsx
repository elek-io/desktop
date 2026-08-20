import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
import { useWatch } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { FieldLegend, FieldSet } from '@renderer/components/ui/field';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
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
      <FormField
        control={form.control}
        name="ofCollections"
        render={() => (
          <FormItem>
            <FieldSet className="gap-2">
              <FieldLegend variant="label" className="mb-0">
                Restrict to Collections
              </FieldLegend>
              <FormDescription>
                Only Entries from the selected Collections can be referenced. If
                none are selected, Entries from all Collections are available.
              </FormDescription>
              <div className="space-y-2">
                {isReadingCollections === true ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => {
                      const key = `skeleton-${String(i)}`;
                      return (
                        <div
                          key={key}
                          className="h-10 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800"
                        />
                      );
                    })}
                  </div>
                ) : collectionList.list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Collections available in this project.
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
                        className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700"
                      >
                        <div className="mr-4">
                          <span className="text-sm font-medium">{name}</span>
                        </div>
                        <Switch
                          aria-label={name}
                          checked={selectedCollectionIds.includes(
                            collection.id
                          )}
                          onCheckedChange={() =>
                            toggleCollection(collection.id)
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
              <FormMessage />
            </FieldSet>
          </FormItem>
        )}
      />

      <div className="flex flex-row items-center justify-between space-x-2">
        <FormField
          control={form.control}
          name="min"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Minimum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The minimum number of Entries the user needs to select.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="max"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Maximum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The maximum number of Entries the user is able to select.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

const entrySpec: DefinitionSpec<EntryFieldDefinition> = {
  authorableFieldType: 'entry',
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
