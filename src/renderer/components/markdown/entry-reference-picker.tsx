import type { ReactElement } from 'react';

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
} from '@renderer/components/ui/dialog';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import type { Collection, Entry } from '@elek-io/core';

export interface EntryReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Restricts which Collections can be picked from, empty means any
  ofCollections: string[];
  onPick: (pick: {
    entry: Entry;
    collection: Collection;
    label: string;
  }) => void;
}

/**
 * Returns a human-readable label for an entry by extracting the first string
 * value from its content, or falls back to a truncated id. Same heuristic as
 * the Entry field's picker.
 */
function entryLabel(entry: Entry): string {
  for (const value in entry.values) {
    if (entry.values[value]?.valueType === 'string') {
      const content = Object.values(entry.values[value].content).find(
        (v) => typeof v === 'string' && v.length > 0
      );
      if (content !== undefined) {
        return String(content);
      }
    }
  }
  return entry.id.slice(0, 8);
}

/**
 * Dialog to pick a single Entry for an entryReference inside the markdown
 * editor. Single-select variant of the Entry field's picker.
 */
export const EntryReferencePicker = ({
  open,
  onOpenChange,
  ofCollections,
  onPick,
}: EntryReferencePickerProps): ReactElement => {
  const { projectId, translateContent } = useProject();
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

  const entriesByCollection = allowedCollections.map((collection, index) => {
    const entryQuery = entryQueries[index];
    return {
      collection,
      entries:
        entryQuery !== undefined && entryQuery.isPending === false
          ? entryQuery.data.list
          : [],
    };
  });
  const hasEntries = entriesByCollection.some(
    ({ entries }) => entries.length > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reference an Entry</DialogTitle>
          <DialogDescription>
            The reference is inserted at the cursor position.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isReadingCollections || isReadingEntries ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => {
                const key = `skeleton-${String(i)}`;
                return (
                  <div
                    key={key}
                    className="h-10 animate-pulse rounded-md bg-muted"
                  />
                );
              })}
            </div>
          ) : hasEntries === false ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No Entries available. Create Entries in the allowed Collections
              first.
            </p>
          ) : (
            <div className="space-y-6">
              {entriesByCollection.map(({ collection, entries }) => {
                if (entries.length === 0) {
                  return null;
                }
                return (
                  <div key={collection.id}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {translateContent({
                        key: 'collection.name.plural',
                        record: collection.name.plural,
                      })}
                    </h3>
                    <div className="space-y-1">
                      {entries.map((entry) => {
                        const label = entryLabel(entry);
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              onPick({ entry, collection, label });
                            }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-input"
                          >
                            <span className="text-sm font-medium">{label}</span>
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
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
