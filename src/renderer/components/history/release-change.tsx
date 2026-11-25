import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ChangePage } from '@renderer/components/history/change-page';
import {
  ReleaseSummary,
  ReleaseSummarySkeleton,
} from '@renderer/components/release-summary';
import { Button } from '@renderer/components/ui/button';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { type ChangeSyncState } from '@renderer/lib/changeSyncState';
import { bumpReason, describeReleaseChanges } from '@renderer/lib/release';
import { queryOptions } from '@renderer/queries';

import {
  type GitCommit,
  type Project,
  type VersionedGitTag,
} from '@elek-io/core';

// A Release in the History: its version, the bump it carried and what it
// changed, which is what the Releases screen shows of a Release.
//
// One summary for the Release dialog, the Releases screen and this, because
// Core answers a Release that was published and one that would be in the same
// shape, see node_modules/@elek-io/core/docs/releases.md.

export interface ReleaseChangeProps {
  project: Project;
  commit: GitCommit;
  /** The Release's own tag, which the commit carries and which holds its version. */
  tag: VersionedGitTag;
  syncState: ChangeSyncState;
}

/**
 * The chosen change where that change is a Release.
 *
 * A preview Release tags the editing branch without publishing anything, so it
 * is named as a preview, the way the Releases screen names one.
 */
export function ReleaseChange({
  project,
  commit,
  tag,
  syncState,
}: ReleaseChangeProps): ReactElement {
  const { t } = useLingui();
  const projectId = project.id;
  const { version } = tag.message;
  const { data: diff, isPending: isReadingChanges } = useQueryNoError(
    queryOptions.releases.changes({ projectId, tagId: tag.id })
  );

  return (
    <ChangePage
      commit={commit}
      title={
        tag.message.type === 'preview'
          ? t`Preview ${version}`
          : t`Release ${version}`
      }
      whatItIs={t`The whole Project`}
      syncState={syncState}
      open={
        <Button
          variant="outline"
          className="no-underline"
          render={
            <Link
              to="/projects/$projectId/releases/$tagId"
              params={{ projectId, tagId: tag.id }}
            />
          }
        >
          <Trans>Open Release</Trans>
        </Button>
      }
    >
      {isReadingChanges ? (
        <ReleaseSummarySkeleton />
      ) : (
        <ReleaseSummary
          diff={diff}
          reason={bumpReason(diff.bump, describeReleaseChanges(diff))}
        />
      )}
    </ChangePage>
  );
}
