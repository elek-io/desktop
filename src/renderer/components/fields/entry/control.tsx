import { Trans, useLingui } from '@lingui/react/macro';
import { ListIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { entryTitle } from '@renderer/components/fields/entry-title';
import {
  EntryPickerDialog,
  type PickableEntry,
} from '@renderer/components/pickers/entry-picker-dialog';
import { Button } from '@renderer/components/ui/button';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { cn } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  type Collection,
  type EntryFieldDefinition,
  type ValueContentReferenceToEntry,
} from '@elek-io/core';

export interface FormEntryFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: EntryFieldDefinition;
  /** The field's label, which every button of the field names itself with. */
  label: string;
  disabled: boolean;
}

/**
 * The control of an Entry field: a row per chosen Entry with its title, its
 * Collection and Remove, then Choose while the field allows another, which is
 * how ci draws it.
 *
 * The field is several controls rather than one, so the control-association
 * props land on their container, and every button inside names the field's
 * rules, its description and its error, so each of them is read out with them.
 * `aria-required` never arrives, since a button's role does not take it: Choose
 * carries the word in its accessible name instead.
 */
export function EntryControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  label,
  disabled,
  className,
  ...controlProps
}: FormEntryFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);

  const {
    projectId,
    translateContent,
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  /* eslint-disable lingui/no-unlocalized-strings -- a language code, which is
  the same in every language */
  const titleLanguage = isReadingProject
    ? 'en'
    : project.settings.language.default;
  /* eslint-enable lingui/no-unlocalized-strings */
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  const allowedCollections: Collection[] = isReadingCollections
    ? []
    : fieldDefinition.ofCollections.length > 0
      ? collectionList.list.filter((collection) =>
          fieldDefinition.ofCollections.includes(collection.id)
        )
      : collectionList.list;

  const entryQueries = useQueriesNoError(
    allowedCollections.map((collection) =>
      queryOptions.entries.list({
        projectId,
        collectionId: collection.id,
        limit: 0,
      })
    )
  );
  const isReadingEntries = entryQueries.some((query) => query.isPending);

  const availableEntries: PickableEntry[] = isReadingEntries
    ? []
    : allowedCollections.flatMap((collection, index) => {
        const entryQuery = entryQueries[index];
        if (entryQuery === undefined || entryQuery.isPending) {
          return [];
        }
        return entryQuery.data.list.map((entry) => ({
          entry,
          collection,
          title: entryTitle({
            entry,
            fieldDefinitions: flattenFieldDefinitions(
              collection.fieldDefinitions
            ),
            language: titleLanguage,
          }),
        }));
      });

  const chosenRefs: ValueContentReferenceToEntry[] = Array.isArray(field.value)
    ? field.value
    : [];
  const chosenEntries: PickableEntry[] = chosenRefs
    .map((reference) =>
      availableEntries.find((pickable) => pickable.entry.id === reference.id)
    )
    .filter((pickable): pickable is PickableEntry => pickable !== undefined);
  const maxReached =
    fieldDefinition.max !== null && chosenRefs.length >= fieldDefinition.max;
  const describedBy = controlProps['aria-describedby'];
  const isInvalid = controlProps['aria-invalid'] === true;
  const required = fieldDefinition.isRequired;
  // What the dialog is called, and what its button is called. Required belongs
  // to the field rather than to the dialog, so only the button says it.
  const chooseTitle = t`Choose ${label}`;
  const chooseName = required ? t`Choose ${label}, Required` : chooseTitle;
  const rowClassName = cn(
    'flex items-center gap-3 rounded-md border px-3 py-2',
    isInvalid ? 'border-destructive' : 'border-border'
  );

  /**
   * Core's `valueContentReferenceToEntrySchema` wants `collectionId` beside
   * `id` and `objectType`, and refines it against the definition's
   * `ofCollections`, so the Collection comes off the chosen Entry's own rather
   * than being worked out later.
   */
  function chosen(entries: PickableEntry[]): void {
    field.onChange(
      entries.map((pickable) => ({
        id: pickable.entry.id,
        objectType: 'entry' as const,
        collectionId: pickable.collection.id,
      })) as typeof field.value
    );
  }

  function remove(entryId: string): void {
    field.onChange(
      chosenRefs.filter(
        (reference) => reference.id !== entryId
      ) as typeof field.value
    );
  }

  return (
    <div
      {...controlProps}
      className={cn('flex flex-col gap-2', className)}
      ref={field.ref}
      onBlur={field.onBlur}
    >
      {chosenEntries.length === 0 ? (
        <div className={rowClassName}>
          <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
            <ListIcon className="size-4" />
          </span>
          <span className="flex-1 text-sm text-muted-foreground">
            <Trans>No Entry chosen</Trans>
          </span>
        </div>
      ) : (
        chosenEntries.map((pickable) => {
          const title = pickable.title;

          return (
            <div key={pickable.entry.id} className={rowClassName}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{title}</span>
                <span className="text-small text-muted-foreground">
                  {translateContent({
                    key: 'collection.name.singular',
                    record: pickable.collection.name.singular,
                  })}
                </span>
              </span>
              {disabled ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-describedby={describedBy}
                  aria-label={t`Remove ${title} from ${label}`}
                  onClick={() => remove(pickable.entry.id)}
                  Icon={XIcon}
                >
                  <Trans>Remove</Trans>
                </Button>
              )}
            </div>
          );
        })
      )}

      {/* Choose stands while the field allows another Entry, which is what ci
      draws, so a field that holds its maximum shows its rows alone. */}
      {disabled || maxReached ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          aria-describedby={describedBy}
          aria-label={chooseName}
          onClick={() => setIsPickerOpen(true)}
        >
          <Trans>Choose</Trans>
        </Button>
      )}

      <EntryPickerDialog
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        title={chooseTitle}
        description={<Trans>The Entries this field allows.</Trans>}
        ofCollections={fieldDefinition.ofCollections}
        chosenIds={chosenRefs.map((reference) => reference.id)}
        max={fieldDefinition.max}
        onChoose={chosen}
      />
    </div>
  );
}
