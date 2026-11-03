import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState, type ReactElement, type ReactNode } from 'react';

import { entryTitle } from '@renderer/components/fields/entry-title';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { FilterInput } from '@renderer/components/ui/filter-input';
import { Label } from '@renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@renderer/components/ui/radio-group';
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
} from '@elek-io/core';

// The one dialog that chooses Entries: the Entry field's Choose opens it, and
// so does the markdown editor's Reference an Entry. Each Entry is a row like a
// row of the list of Entries, with a radio button where one may be chosen and a
// checkbox where several may.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/** One Entry the dialog offers, with the Collection it belongs to. */
export interface PickableEntry {
  entry: Entry;
  collection: Collection;
  /** The Entry's title, which `entryTitle` is the one source of. */
  title: string;
}

export interface EntryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the dialog is called, which names the field it was opened from. */
  title: string;
  /** The one line below the title, saying what choosing does. */
  description: ReactNode;
  /** The Collections the field allows, or every Collection where it is empty. */
  ofCollections: string[];
  /** The Entries already chosen, so the dialog opens on them. */
  chosenIds: string[];
  /**
   * How many Entries may be chosen at once. One draws radio buttons and more
   * draws checkboxes, and the maximum holds here rather than at the save.
   */
  max: number | null;
  /** The Entries that were chosen, in the order the list shows them. */
  onChoose: (entries: PickableEntry[]) => void;
}

/** A dialog that chooses Entries of the Collections a field allows. */
export function EntryPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  ofCollections,
  chosenIds,
  max,
  onChoose,
}: EntryPickerDialogProps): ReactElement {
  const { t } = useLingui();
  const itemId = useId();
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
    : ofCollections.length > 0
      ? collectionList.list.filter((collection) =>
          ofCollections.includes(collection.id)
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

  // What is chosen inside the dialog, which only reaches the field once Choose
  // is pressed, so Cancel changes nothing. Opening the dialog takes the field's
  // own choice up again, adjusted during the render rather than in an effect,
  // so the list is never drawn with the previous choice.
  const [draftIds, setDraftIds] = useState<string[]>(chosenIds);
  const [filter, setFilter] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraftIds(chosenIds);
      setFilter('');
    }
  }

  const takesOne = max === 1;
  const groups: { collection: Collection; entries: PickableEntry[] }[] =
    allowedCollections.map((collection, index) => {
      const entryQuery = entryQueries[index];
      const entries =
        entryQuery !== undefined && entryQuery.isPending === false
          ? entryQuery.data.list
          : [];
      return {
        collection,
        entries: entries.map((entry) => ({
          entry,
          collection,
          title: entryTitle({
            entry,
            fieldDefinitions: flattenFieldDefinitions(
              collection.fieldDefinitions
            ),
            language: titleLanguage,
          }),
        })),
      };
    });
  const everyEntry = groups.flatMap((group) => group.entries);
  const needle = filter.trim().toLowerCase();
  const matches = (pickable: PickableEntry): boolean =>
    needle === '' || pickable.title.toLowerCase().includes(needle);
  const shownGroups = groups
    .map((group) => ({
      collection: group.collection,
      entries: group.entries.filter(matches),
    }))
    .filter((group) => group.entries.length > 0);
  const maxReached = max !== null && draftIds.length >= max;

  // ci names a Collection and its Entries by the Collection's own plural, and
  // keeps "Entries" where several Collections meet, which is what a field that
  // allows more than one of them shows.
  const onlyCollection =
    allowedCollections.length === 1 ? allowedCollections[0] : undefined;
  const onlyCollectionName =
    onlyCollection === undefined
      ? null
      : translateContent({
          key: 'collection.name.plural',
          record: onlyCollection.name.plural,
        });
  const filterName =
    onlyCollectionName === null
      ? t`Filter Entries`
      : t`Filter ${onlyCollectionName}`;

  function toggle(entryId: string, isChosen: boolean): void {
    if (takesOne) {
      setDraftIds([entryId]);
      return;
    }
    setDraftIds(
      isChosen
        ? draftIds.filter((id) => id !== entryId)
        : [...draftIds, entryId]
    );
  }

  function choose(): void {
    // In the order the list shows them rather than the order they were ticked,
    // so what the field holds reads like what was on screen.
    onChoose(
      everyEntry.filter((pickable) => draftIds.includes(pickable.entry.id))
    );
    onOpenChange(false);
  }

  function row(pickable: PickableEntry): ReactElement {
    const isChosen = draftIds.includes(pickable.entry.id);
    const id = `${itemId}-${pickable.entry.id}`;

    return (
      <Label
        key={pickable.entry.id}
        htmlFor={id}
        className={cn(
          'flex items-center gap-3 rounded-md border border-border px-3 py-2 font-normal',
          'has-data-checked:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
          isChosen === false && maxReached ? 'opacity-50' : null
        )}
      >
        {takesOne ? (
          <RadioGroupItem id={id} value={pickable.entry.id} />
        ) : (
          <Checkbox
            id={id}
            checked={isChosen}
            disabled={isChosen === false && maxReached}
            onCheckedChange={() => toggle(pickable.entry.id, isChosen)}
          />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm">{pickable.title}</span>
          <span className="text-small text-muted-foreground">
            {translateContent({
              key: 'collection.name.singular',
              record: pickable.collection.name.singular,
            })}
          </span>
        </span>
      </Label>
    );
  }

  const list = shownGroups.map((group) => (
    <div key={group.collection.id} className="flex flex-col gap-1">
      {/* A heading per Collection only where more than one of them meets, so a
      field that allows one does not repeat its name above every row. */}
      {allowedCollections.length > 1 ? (
        <h3 className="text-label text-muted-foreground">
          {translateContent({
            key: 'collection.name.plural',
            record: group.collection.name.plural,
          })}
        </h3>
      ) : null}
      {group.entries.map(row)}
    </div>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <FilterInput
            name={filterName}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {isReadingCollections || isReadingEntries ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, index) => {
                const key = `skeleton-${String(index)}`;
                return <Skeleton key={key} className="h-10" />;
              })}
            </div>
          ) : everyEntry.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>
                No Entry yet in the Collections this field allows. Create one
                first.
              </Trans>
            </p>
          ) : shownGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>No Entry matches the filter.</Trans>
            </p>
          ) : takesOne ? (
            <RadioGroup
              aria-label={title}
              value={draftIds[0] ?? null}
              onValueChange={(entryId: string) => toggle(entryId, false)}
            >
              {list}
            </RadioGroup>
          ) : (
            <div
              role="group"
              aria-label={title}
              className="flex flex-col gap-3"
            >
              {list}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            <Trans>Cancel</Trans>
          </DialogClose>
          <Button type="button" onClick={choose}>
            <Trans>Choose</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
