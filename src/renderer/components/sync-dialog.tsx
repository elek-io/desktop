import { Trans } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

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
} from '@renderer/components/ui/dialog';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import {
  syncConflictReferencesOf,
  SYNC_REFUSAL_FALLBACK,
  SYNC_REFUSALS,
  type SyncConflictReference,
} from '@renderer/lib/sync';
import { queryOptions } from '@renderer/queries';

import { flattenFieldDefinitions, type Collection } from '@elek-io/core';

/**
 * What stopped a synchronization the editor started, and what to do about it.
 *
 * It answers a sync the editor started while focus was still on Sync, which is
 * where ci puts a failure somebody is waiting for, and Show why in the Project
 * card reopens it afterwards. One sentence says what stopped the sync and what
 * to do next, each Entry Core named is a link with the field inside it, and one
 * line says that nothing was synced, which holds because Core pushes nothing
 * until every step before it went through.
 *
 * It never shows Core's error type, Core's own message or what git wrote, since
 * a Git repository's address can carry a credential, see
 * contributing/error-handling.md.
 */
export function SyncDialog({
  open,
  onOpenChange,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The refusal the dialog is about, held by the Project card. */
  error: unknown;
}): ReactElement {
  const { type } = parseIpcError(error);
  const references = syncConflictReferencesOf(error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        An alert dialog, because it answers something the editor just started
        and is waiting for, which is what ci draws it as. It keeps the dialog
        shell rather than the alert dialog's, since its list of Entries is as
        long as Core makes it and so needs a body that scrolls.
      */}
      <DialogContent role="alertdialog" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Sync failed</Trans>
          </DialogTitle>
          <DialogDescription>
            {describeCoreError(type, SYNC_REFUSALS, SYNC_REFUSAL_FALLBACK)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-3">
            {references.length === 0 ? null : (
              <SyncConflictList references={references} />
            )}

            <p className="text-small text-muted-foreground">
              <Trans>
                Nothing was synced, and your changes stay on this computer.
              </Trans>
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button type="button" />}>
            <Trans>Close</Trans>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One row per reference Core named: the Entry as a link, and the field inside
 * it at the right.
 *
 * The Entry is named the way every other place names one, through
 * `entryTitle`, rather than by the id Core sent, so the row reads as the Entry
 * somebody wrote. Its Collection carries the field definitions that naming
 * needs and the field's own label, so both come out of the one list of
 * Collections the sidebar already reads.
 */
function SyncConflictList({
  references,
}: {
  references: SyncConflictReference[];
}): ReactElement {
  const {
    projectId,
    translateContent,
    userQuery: { data: user },
  } = useProject();
  const { data: collectionList, isPending: isListingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const entryQueries = useQueriesNoError(
    references.map((reference) =>
      queryOptions.entries.read({
        projectId,
        collectionId: reference.collectionId,
        id: reference.entryId,
      })
    )
  );

  const collectionOf = (
    reference: SyncConflictReference
  ): Collection | undefined =>
    isListingCollections
      ? undefined
      : collectionList.list.find(
          (candidate) => candidate.id === reference.collectionId
        );

  return (
    <ul className="grid border-t">
      {references.map((reference, index) => {
        const collection = collectionOf(reference);
        const entryQuery = entryQueries[index];
        const entry =
          entryQuery === undefined || entryQuery.isPending
            ? undefined
            : entryQuery.data;
        const fieldDefinitions =
          collection === undefined
            ? []
            : flattenFieldDefinitions(collection.fieldDefinitions);
        const fieldDefinition = fieldDefinitions.find(
          (candidate) => candidate.slug === reference.fieldSlug
        );
        // The field by the label somebody gave it, and by the slug a site
        // reads its Value under where the Collection no longer has the field,
        // which is what a reference into a field that was just removed leaves.
        const field =
          fieldDefinition === undefined
            ? reference.fieldSlug
            : translateContent({
                key: 'fieldDefinition.label',
                record: fieldDefinition.label,
              });
        // Named the way every other place names an Entry, and left as the
        // field's own row while the Entry is still being read, so the row
        // never shows an id of its own.
        const title =
          entry === undefined || user === null || user === undefined
            ? undefined
            : entryTitle({ entry, fieldDefinitions, language: user.language });

        return (
          <li
            key={`${reference.entryId}/${reference.fieldSlug}`}
            className="flex min-h-9 items-center gap-3 border-b py-1"
          >
            {title === undefined ? (
              <span className="text-muted-foreground">
                <Trans>Reading this Entry</Trans>
              </span>
            ) : (
              <Link
                to="/projects/$projectId/collections/$collectionId/$entryId/update"
                params={{
                  projectId,
                  collectionId: reference.collectionId,
                  entryId: reference.entryId,
                }}
                className="truncate underline decoration-link-underline decoration-2 underline-offset-2"
              >
                {title}
              </Link>
            )}
            <span className="ml-auto shrink-0 text-muted-foreground">
              {field}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
