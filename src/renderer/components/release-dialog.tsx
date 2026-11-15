import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { Tag } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  ReleaseSummary,
  ReleaseSummarySkeleton,
} from '@renderer/components/release-summary';
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
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import {
  describeReleaseChanges,
  releaseReason,
  RELEASE_CREATE_FALLBACK,
  RELEASE_CREATE_REFUSALS,
  RELEASE_READ_FALLBACK,
  RELEASE_READ_REFUSALS,
  RELEASE_READ_RETRYABLE,
} from '@renderer/lib/release';
import { queryOptions } from '@renderer/queries';

import { type Project, type ReleaseDiff } from '@elek-io/core';

export interface ReleaseDialogProps {
  project: Project;
  /**
   * The control that opens the dialog, rendered as the dialog's own trigger, so
   * focus moves into the dialog on open and back to this control on close
   * without either side keeping the open state.
   */
  children: ReactElement;
}

/**
 * Cuts a Release of a Project, after showing what it would publish.
 *
 * The version is the one Core computed from what changed, never a choice, so
 * the dialog shows the old and the new version, the bump with its word, the
 * reason in one sentence, and the Entries and Assets it would add, change and
 * delete, see `components/release-summary.tsx`. A Release cannot be undone,
 * which the dialog says before Create Release is pressed.
 *
 * Both halves answer a refusal in place: reading what a Release would publish
 * (see `releases.prepare`) and making it. Core unwinds a failed Release itself,
 * so the dialog stays open with one line above its button and the same call can
 * be made again. See contributing/error-handling.md.
 */
export function ReleaseDialog({
  project,
  children,
}: ReleaseDialogProps): ReactElement {
  const { t } = useLingui();

  const [isOpen, setIsOpen] = useState(false);
  const {
    data: pendingRelease,
    isFetching: isPreparingRelease,
    refetch: readPendingReleaseAgain,
  } = useQueryNoError({
    ...queryOptions.releases.prepare(project),
    enabled: isOpen,
  });
  const [createError, setCreateError] = useState<unknown>(null);
  const {
    mutateAsync: createRelease,
    isPending: isCreatingRelease,
    handleError: handleCreateError,
  } = useAppMutation(queryOptions.releases.create, {
    handled: {
      PreconditionFailed: setCreateError,
      Unauthorized: setCreateError,
      Internal: setCreateError,
    },
  });

  const onCreateRelease = async (): Promise<void> => {
    setCreateError(null);
    try {
      await createRelease({ projectId: project.id });
      setIsOpen(false);
    } catch (error) {
      handleCreateError(error);
    }
  };

  const diff =
    pendingRelease?.status === 'readable' ? pendingRelease.diff : undefined;
  const canRelease = diff !== undefined && diff.bump !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setCreateError(null);
        setIsOpen(open);
      }}
    >
      <DialogTrigger render={children} />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Create Release</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              A Release is a version of the whole Project that your website and
              apps build from. It cannot be undone.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isPreparingRelease || pendingRelease === undefined ? (
            <ReleaseSummarySkeleton />
          ) : pendingRelease.status === 'refused' ? (
            <p role="alert" className="text-sm text-error">
              {describeCoreError(
                pendingRelease.errorType,
                RELEASE_READ_REFUSALS,
                RELEASE_READ_FALLBACK
              )}
            </p>
          ) : (
            <PendingReleaseSummary diff={pendingRelease.diff} />
          )}

          {createError === null ? null : (
            <p role="alert" className="text-sm text-error">
              {describeCoreError(
                parseIpcError(createError).type,
                RELEASE_CREATE_REFUSALS,
                RELEASE_CREATE_FALLBACK
              )}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {/*
            Nothing to confirm means nothing to cancel either, so the one
            button says what it does: with a Release to make it cancels it,
            and where there is none it closes the dialog.
          */}
          <DialogClose render={<Button type="button" variant="ghost" />}>
            {canRelease ? t`Cancel` : t`Close`}
          </DialogClose>
          {pendingRelease?.status === 'refused' &&
          RELEASE_READ_RETRYABLE.has(pendingRelease.errorType) ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => await readPendingReleaseAgain()}
            >
              <Trans>Try again</Trans>
            </Button>
          ) : null}
          {canRelease ? (
            <Button
              Icon={Tag}
              isLoading={isCreatingRelease}
              onClick={onCreateRelease}
            >
              {isCreatingRelease ? t`Creating Release` : t`Create Release`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the Release would publish, in the same shape a Release that was
 * published is shown in on the Releases screen.
 *
 * The sentence is this dialog's own: ci opens it with what sets the version,
 * since the editor is about to let Desktop set one, and a Project with nothing
 * to publish says that instead.
 */
function PendingReleaseSummary({ diff }: { diff: ReleaseDiff }): ReactElement {
  const reason = releaseReason(diff, describeReleaseChanges(diff));

  return (
    <ReleaseSummary
      diff={diff}
      reason={
        diff.bump === null ? (
          reason
        ) : (
          <>
            <Trans>Desktop sets the version from what changed.</Trans> {reason}
          </>
        )
      }
    />
  );
}
