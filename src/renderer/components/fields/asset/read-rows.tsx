import { Trans, useLingui } from '@lingui/react/macro';
import { ImageIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { AssetDisplay } from '@renderer/components/asset-display';
import { markedReferences } from '@renderer/components/fields/value-contracts';
import {
  ReadRow,
  ReadRowLead,
  ReadRowList,
} from '@renderer/components/history/read-field';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { assetFileName } from '@renderer/lib/assetFile';
import { formatBytes } from '@renderer/lib/utils';
import { type ValueMark } from '@renderer/lib/valueMarks';
import { queryOptions } from '@renderer/queries';

import { type FieldTypeReadRowsProps } from '../module';

// What a change shows of an Asset field: a row per Asset it points at, with its
// preview, its name and what the file is, which is how ci draws it and how the
// field's own control draws it.
//
// The count the Value reads as names no file, so a change that swapped one
// Asset for another would read "1 Asset" struck beside "1 Asset" underlined.
// The rows say which file went and which came instead.

/** One row: the Asset of one reference, as it stood at the change. */
function AssetRow({
  projectId,
  id,
  commitHash,
  mark,
}: {
  projectId: string;
  id: string;
  /** The commit the Asset is read at, so a file that was replaced since still
   * reads as it did then. */
  commitHash: string | undefined;
  mark: ValueMark['mark'];
}): ReactElement {
  const { t } = useLingui();
  // The read is answered by the pane this change is drawn in, as every other
  // read of it is: a reference pointing at an Asset that was not in the
  // Project at this commit is what a sync can leave behind, and Core refuses
  // to save one, see contributing/error-handling.md.
  const { data: asset, isPending } = useQueryNoError(
    queryOptions.assets.read({
      projectId,
      id,
      ...(commitHash === undefined ? {} : { commitHash }),
    })
  );

  if (isPending) {
    return (
      <ReadRow
        lead={
          <ReadRowLead>
            <ImageIcon className="size-4" />
          </ReadRowLead>
        }
        name={<Skeleton className="h-3 w-32 rounded" />}
      />
    );
  }

  const type = asset.extension.toUpperCase();
  const size = formatBytes(asset.size);

  return (
    <ReadRow
      mark={mark}
      lead={
        <ReadRowLead>
          <AssetDisplay
            {...asset}
            static
            fit="cover"
            className="h-10 w-16 rounded-sm"
          />
        </ReadRowLead>
      }
      name={assetFileName(asset)}
      line={t`${type}, ${size}`}
    />
  );
}

/**
 * The Assets this change shows the field pointing at, which `markedReferences`
 * puts in the order they are read.
 */
export function AssetReadRows({
  language,
  before,
  after,
  isMarked,
}: FieldTypeReadRowsProps<'asset'>): ReactElement {
  const { projectId } = useProject();
  const references = markedReferences({ before, after, isMarked, language });

  if (references.length === 0) {
    return (
      <ReadRow
        lead={
          <ReadRowLead>
            <ImageIcon className="size-4" />
          </ReadRowLead>
        }
        name={
          <span className="text-muted-foreground">
            <Trans>No Asset chosen</Trans>
          </span>
        }
      />
    );
  }

  return (
    <ReadRowList>
      {references.map((reference) => (
        <AssetRow
          // A row stands for one Asset in one state of the Value, which is
          // what an Asset replaced by another needs: the same id can stand
          // once struck through and once underlined.
          key={`${reference.mark ?? 'kept'}-${reference.id}`}
          projectId={projectId}
          id={reference.id}
          commitHash={reference.commitHash}
          mark={reference.mark}
        />
      ))}
    </ReadRowList>
  );
}
