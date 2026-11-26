import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { AssetDisplay } from '@renderer/components/asset-display';
import { changeBefore } from '@renderer/components/history/change-before';
import { ChangePage } from '@renderer/components/history/change-page';
import {
  ReadField,
  ReadFields,
  ReadFieldsSkeleton,
  ReadValue,
} from '@renderer/components/history/read-field';
import { textReading } from '@renderer/components/history/value-reading';
import { Button } from '@renderer/components/ui/button';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { assetFileName } from '@renderer/lib/assetFile';
import { type ChangeSyncState } from '@renderer/lib/changeSyncState';
import { formatBytes } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import { type Asset, type GitCommit, type Project } from '@elek-io/core';

// A change of one Asset, as ci shows it: the Asset once, read rather than
// edited, in the order its own pane shows it, with what changed marked in
// place.

/** The type and the size of a file, as every other screen says them. */
function typeAndSize(
  asset: Asset | undefined,
  say: (type: string, size: string) => string
): string {
  return asset === undefined
    ? ''
    : say(asset.extension.toUpperCase(), formatBytes(asset.size));
}

export interface AssetChangeProps {
  project: Project;
  commit: GitCommit;
  /** Every change of the Project, newest first, to find the one before this. */
  history: GitCommit[];
  syncState: ChangeSyncState;
}

/**
 * The chosen change of an Asset: its preview, its type and size, its name and
 * its description.
 *
 * ci lays it out in the order the Asset's own pane shows it, without the
 * buttons that pane carries, since nothing here is edited. A change that added
 * the Asset has no state before it and one that deleted it none after it, so
 * each of those shows the one state it has without marks.
 */
export function AssetChange({
  project,
  commit,
  history,
  syncState,
}: AssetChangeProps): ReactElement {
  const { t } = useLingui();
  const { method, reference } = commit.message;
  const projectId = project.id;
  const previous =
    method === 'create' ? undefined : changeBefore(history, commit);
  const isMarked =
    method !== 'create' && method !== 'delete' && previous !== undefined;

  // A change that deleted the Asset has no state after it to read.
  const afterQuery = useQueryNoError({
    ...queryOptions.assets.read({
      projectId,
      id: reference.id,
      commitHash: commit.hash,
    }),
    enabled: method !== 'delete',
  });
  const beforeQuery = useQueryNoError({
    ...queryOptions.assets.read({
      projectId,
      id: reference.id,
      ...(previous === undefined ? {} : { commitHash: previous.hash }),
    }),
    enabled: previous !== undefined,
  });

  const isReading =
    (method !== 'delete' && afterQuery.isPending) ||
    (previous !== undefined && beforeQuery.isPending);
  const before = beforeQuery.data;
  const after = afterQuery.data;
  // The Asset as this change left it, which is what the page names and shows a
  // preview of: the state after it, or the last one there was where the change
  // deleted it.
  const shown = after ?? before;
  const sizeWords = (type: string, size: string): string => t`${type}, ${size}`;
  const name = textReading({
    before: before === undefined ? '' : assetFileName(before),
    after: after === undefined ? '' : assetFileName(after),
    isMarked,
  });
  const description = textReading({
    before: before?.description ?? '',
    after: after?.description ?? '',
    isMarked,
  });
  // The file itself, which a replace swaps for another. Its type and size say
  // what it is, so they are what a replaced file is marked by, and neither is
  // text to compare word by word. They are also all Desktop can read of the
  // file, since an Asset's sidecar carries no fingerprint of its content, so a
  // file replaced by another of the same type and byte count leaves the field
  // unmarked, see contributing/renderer/forms.md.
  const file = textReading({
    before: typeAndSize(before, sizeWords),
    after: typeAndSize(after, sizeWords),
    isMarked,
    readsAsWords: false,
  });

  return (
    <ChangePage
      commit={commit}
      title={shown === undefined ? '' : assetFileName(shown)}
      whatItIs={t`An Asset`}
      syncState={syncState}
      open={
        // Nothing to open where the change deleted the Asset.
        method === 'delete' ? undefined : (
          <Button
            variant="outline"
            className="no-underline"
            render={
              <Link
                to="/projects/$projectId/assets/$assetId"
                params={{ projectId, assetId: reference.id }}
              />
            }
          >
            <Trans>Open Asset</Trans>
          </Button>
        )
      }
    >
      {isReading || shown === undefined ? (
        <ReadFieldsSkeleton fields={3} label={t`Reading this change`} />
      ) : (
        <ReadFields>
          {/* The preview first, as the Asset's own pane shows it. It says the
          same as the name below it, so it stays out of what is read out. */}
          <span aria-hidden="true" className="col-span-12">
            <AssetDisplay
              {...shown}
              static
              className="max-h-64 w-full rounded-md border"
            />
          </span>
          <ReadField
            label={<Trans>File</Trans>}
            isChanged={file.isChanged}
            className="col-span-12"
          >
            <ReadValue marks={file.marks} />
          </ReadField>
          <ReadField
            label={<Trans>Name</Trans>}
            isChanged={name.isChanged}
            className="col-span-12"
          >
            <ReadValue marks={name.marks} />
          </ReadField>
          <ReadField
            label={<Trans>Description</Trans>}
            isChanged={description.isChanged}
            className="col-span-12"
          >
            <ReadValue marks={description.marks} />
          </ReadField>
        </ReadFields>
      )}
    </ChangePage>
  );
}
