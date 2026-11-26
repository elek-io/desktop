import { Trans } from '@lingui/react/macro';
import { ListIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { CollectionIcon } from '@renderer/components/collection-icon';
import { entryTitle } from '@renderer/components/fields/entry-title';
import { markedReferences } from '@renderer/components/fields/value-contracts';
import {
  ReadRow,
  ReadRowLead,
  ReadRowList,
} from '@renderer/components/history/read-field';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { type ValueMark } from '@renderer/lib/valueMarks';
import { queryOptions } from '@renderer/queries';

import { flattenFieldDefinitions } from '@elek-io/core';

import { type FieldTypeReadRowsProps } from '../module';

// What a change shows of an Entry field: a row per Entry it points at, with its
// Collection's icon, its title and the Collection it belongs to, which is how
// ci draws it and how the field's own control draws it.
//
// As with an Asset field, the count the Value reads as names no Entry, so the
// rows are what say which Entry went and which came.

/** One row: the Entry of one reference, as it stood at the change. */
function EntryRow({
  projectId,
  collectionId,
  id,
  commitHash,
  mark,
}: {
  projectId: string;
  collectionId: string;
  id: string;
  /**
   * The commit the Entry is read at, so one that was renamed since still
   * reads as it did then.
   */
  commitHash: string | undefined;
  mark: ValueMark['mark'];
}): ReactElement {
  const {
    translateContent,
    userQuery: { data: user },
  } = useProject();
  const at = commitHash === undefined ? {} : { commitHash };
  // The Collection is what lays an Entry's title out and what the row names
  // below it, so both are read, and both are answered by the pane this change
  // is drawn in, as every other read of it is.
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({ projectId, id: collectionId, ...at })
  );
  const { data: entry, isPending: isReadingEntry } = useQueryNoError(
    queryOptions.entries.read({ projectId, collectionId, id, ...at })
  );

  if (
    isReadingCollection ||
    isReadingEntry ||
    user === null ||
    user === undefined
  ) {
    return (
      <ReadRow
        lead={
          <ReadRowLead>
            <ListIcon className="size-4" />
          </ReadRowLead>
        }
        name={<Skeleton className="h-3 w-32 rounded" />}
      />
    );
  }

  return (
    <ReadRow
      mark={mark}
      lead={
        <ReadRowLead>
          <CollectionIcon name={collection.icon} className="size-4" />
        </ReadRowLead>
      }
      // Named the way every other place names an Entry, in the language the
      // app is read in, as the rows of the History name one.
      name={entryTitle({
        entry,
        fieldDefinitions: flattenFieldDefinitions(collection.fieldDefinitions),
        language: user.language,
      })}
      line={translateContent({
        key: 'collection.name.plural',
        record: collection.name.plural,
      })}
    />
  );
}

/**
 * The Entries this change shows the field pointing at, which
 * `markedReferences` puts in the order they are read.
 *
 * Core keeps the Collection beside the id of an Entry reference, so each row
 * is two reads of its own rather than a search through every Collection. A
 * reference that carries no Collection has nothing to be read from, so it
 * draws no row.
 */
export function EntryReadRows({
  language,
  before,
  after,
  isMarked,
}: FieldTypeReadRowsProps<'entry'>): ReactElement {
  const { projectId } = useProject();
  const references = markedReferences({ before, after, isMarked, language });

  if (references.length === 0) {
    return (
      <ReadRow
        lead={
          <ReadRowLead>
            <ListIcon className="size-4" />
          </ReadRowLead>
        }
        name={
          <span className="text-muted-foreground">
            <Trans>No Entry chosen</Trans>
          </span>
        }
      />
    );
  }

  return (
    <ReadRowList>
      {references.map((reference) =>
        reference.collectionId === undefined ? null : (
          <EntryRow
            // A row stands for one Entry in one state of the Value, so the
            // same Entry can stand once struck through and once underlined.
            key={`${reference.mark ?? 'kept'}-${reference.id}`}
            projectId={projectId}
            collectionId={reference.collectionId}
            id={reference.id}
            commitHash={reference.commitHash}
            mark={reference.mark}
          />
        )
      )}
    </ReadRowList>
  );
}
