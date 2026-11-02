import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { CheckIcon, ListPlusIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { entryTitle } from '@renderer/components/fields/entry-title';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { cn } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  type Collection,
  type Entry,
  type EntryFieldDefinition,
  type ValueContentReferenceToEntry,
} from '@elek-io/core';

export interface FormEntryFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: EntryFieldDefinition;
  disabled: boolean;
}

/**
 * Form field component for selecting one or multiple existing Entries.
 * Opens a dialog to browse and select entries from allowed collections.
 * The field value is an array of ValueContentReferenceToEntry objects. The
 * control-association props land on the dialog trigger, its focusable control.
 */
export function EntryControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  ...controlProps
}: FormEntryFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();

  const {
    projectId,
    translateContent,
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  // The language the picker shows an Entry's title in, which is the Project's
  // default until it has loaded.
  /* eslint-disable lingui/no-unlocalized-strings -- a language code, which is
  the same in every language */
  const titleLanguage = isReadingProject
    ? 'en'
    : project.settings.language.default;
  /* eslint-enable lingui/no-unlocalized-strings */
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  // Filter collections based on ofCollections restriction
  const allowedCollections: Collection[] = isReadingCollections
    ? []
    : fieldDefinition.ofCollections.length > 0
      ? collectionList.list.filter((c) =>
          fieldDefinition.ofCollections.includes(c.id)
        )
      : collectionList.list;

  // Fetch entries for each allowed collection
  const entryQueries = useQueriesNoError(
    allowedCollections.map((c) =>
      queryOptions.entries.list({ projectId, collectionId: c.id, limit: 0 })
    )
  );

  const isReadingEntries = entryQueries.some((q) => q.isPending);

  // Build a flat list of all available entries with their collection context
  const availableEntries: Array<{ entry: Entry; collection: Collection }> = [];
  if (isReadingEntries === false) {
    allowedCollections.forEach((collection, index) => {
      const entryQuery = entryQueries[index];
      if (entryQuery !== undefined && entryQuery.isPending === false) {
        entryQuery.data.list.forEach((entry) => {
          availableEntries.push({ entry, collection });
        });
      }
    });
  }

  const selectedRefs: ValueContentReferenceToEntry[] = Array.isArray(
    field.value
  )
    ? field.value
    : [];

  const selectedIds = new Set(selectedRefs.map((ref) => ref.id));

  const maxReached =
    fieldDefinition.max !== null && selectedRefs.length >= fieldDefinition.max;

  // How many Entries may be picked, as one sentence per shape rather than
  // fragments joined together.
  const entryMaximum = fieldDefinition.max;
  const entryMinimum = fieldDefinition.min;
  const entryLimitsSentence = [
    entryMaximum !== null
      ? t`Select up to ${plural(entryMaximum, {
          one: '# entry',
          other: '# entries',
        })}.`
      : t`Select one or more entries.`,
    entryMinimum !== null ? t`At least ${entryMinimum} required.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  /**
   * Core's `valueContentReferenceToEntrySchema` requires `collectionId`
   * alongside `id` and `objectType`, and refines it against the definition's
   * `ofCollections`. The collection is therefore taken from the selected
   * Entry's own collection, not inferred later.
   */
  function setRefs(refs: ValueContentReferenceToEntry[]): void {
    field.onChange(refs);
  }

  function toggleEntry(entryId: string, collectionId: Collection['id']): void {
    if (selectedIds.has(entryId)) {
      setRefs(selectedRefs.filter((ref) => ref.id !== entryId));
    } else if (maxReached === false) {
      setRefs([
        ...selectedRefs,
        { id: entryId, objectType: 'entry', collectionId },
      ]);
    }
  }

  function removeEntry(entryId: string): void {
    setRefs(selectedRefs.filter((ref) => ref.id !== entryId));
  }

  // Resolve selected refs to entries with collection context for display
  const selectedEntries = selectedRefs
    .map((ref) => {
      const found = availableEntries.find((ae) => ae.entry.id === ref.id);
      return found !== undefined ? found : null;
    })
    .filter(
      (item): item is { entry: Entry; collection: Collection } => item !== null
    );

  // Group available entries by collection for the picker dialog
  const entriesByCollection = allowedCollections.map((collection, index) => ({
    collection,
    entries:
      isReadingEntries === false &&
      entryQueries[index] !== undefined &&
      entryQueries[index].isPending === false
        ? entryQueries[index].data.list
        : [],
  }));

  return (
    <div className="space-y-3">
      {selectedEntries.length > 0 && (
        <div className="space-y-1">
          {selectedEntries.map(({ entry, collection }) => {
            const title = entryTitle({
              entry,
              fieldDefinitions: flattenFieldDefinitions(
                collection.fieldDefinitions
              ),
              language: titleLanguage,
            });
            return (
              <div
                key={entry.id}
                className="group flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {translateContent({
                      key: 'collection.name.singular',
                      record: collection.name.singular,
                    })}
                  </span>
                </div>
                {disabled !== true && (
                  <Button
                    variant="ghost"
                    size="icon"
                    // Shown on hover and on keyboard focus, so reaching it with
                    // Tab does not leave an invisible control focused.
                    className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => removeEntry(entry.id)}
                    type="button"
                    Icon={XIcon}
                  >
                    {/* The icon alone names nothing, so the Entry it removes is
                    said for a screen reader. */}
                    <span className="sr-only">{t`Remove ${title}`}</span>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog>
        <DialogTrigger
          render={
            <Button
              {...controlProps}
              ref={field.ref}
              onBlur={field.onBlur}
              variant="secondary"
              type="button"
              disabled={disabled === true || maxReached}
              Icon={ListPlusIcon}
            />
          }
        >
          <Trans>Select Entries</Trans>
          {fieldDefinition.min !== null || fieldDefinition.max !== null ? (
            <span className="ml-1 text-muted-foreground">
              ({selectedRefs.length}
              {fieldDefinition.max !== null ? ` / ${fieldDefinition.max}` : ''})
            </span>
          ) : null}
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Select Entries</Trans>
            </DialogTitle>
            <DialogDescription>{entryLimitsSentence}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {isReadingCollections === true || isReadingEntries === true ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  const key = `skeleton-${String(i)}`;
                  return <Skeleton key={key} className="h-10" />;
                })}
              </div>
            ) : availableEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                <Trans>
                  No entries available. Create entries in the allowed
                  collections first.
                </Trans>
              </p>
            ) : (
              <div className="space-y-6">
                {entriesByCollection.map(({ collection, entries }) => {
                  if (entries.length === 0) return null;
                  return (
                    <div key={collection.id}>
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                        {translateContent({
                          key: 'collection.name.plural',
                          record: collection.name.plural,
                        })}
                      </h4>
                      <div className="space-y-1">
                        {entries.map((entry) => {
                          const isSelected = selectedIds.has(entry.id);
                          const isDisabledOption =
                            isSelected === false && maxReached;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              disabled={isDisabledOption}
                              onClick={() =>
                                toggleEntry(entry.id, collection.id)
                              }
                              className={cn(
                                'flex w-full items-center rounded-md border-2 px-3 py-2 text-left transition-all',
                                isSelected === true
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-input',
                                isDisabledOption === true &&
                                  'cursor-not-allowed opacity-50'
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {entryTitle({
                                  entry,
                                  fieldDefinitions: flattenFieldDefinitions(
                                    collection.fieldDefinitions
                                  ),
                                  language: titleLanguage,
                                })}
                              </span>
                              {isSelected === true ? (
                                <div className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <CheckIcon className="h-3 w-3" />
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              <Trans>Done</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
