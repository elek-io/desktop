import { parseIpcError } from '@root/src/shared/ipcError';
import { Rocket } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@renderer/components/ui/badge';
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
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import {
  bumpWord,
  describeReleaseChanges,
  releaseReason,
  RELEASE_CREATE_FALLBACK,
  RELEASE_CREATE_REFUSALS,
  RELEASE_READ_FALLBACK,
  RELEASE_READ_REFUSALS,
  type DescribedReleaseChange,
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
 * reason in one sentence and every change in words. A Release cannot be undone,
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
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Release</DialogTitle>
          <DialogDescription>
            A Release publishes everything saved in this Project, so a website
            can build from it. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isPreparingRelease || pendingRelease === undefined ? (
            <PendingReleaseSkeleton />
          ) : pendingRelease.status === 'refused' ? (
            <p role="alert" className="text-sm text-destructive">
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
            <p role="alert" className="text-sm text-destructive">
              {describeCoreError(
                parseIpcError(createError).type,
                RELEASE_CREATE_REFUSALS,
                RELEASE_CREATE_FALLBACK
              )}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
          {pendingRelease?.status === 'refused' ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => await readPendingReleaseAgain()}
            >
              Try again
            </Button>
          ) : null}
          {canRelease ? (
            <Button
              Icon={Rocket}
              isLoading={isCreatingRelease}
              onClick={onCreateRelease}
            >
              {isCreatingRelease ? 'Creating Release' : 'Create Release'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingReleaseSkeleton(): ReactElement {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-6 w-40 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
    </div>
  );
}

function PendingReleaseSummary({ diff }: { diff: ReleaseDiff }): ReactElement {
  const changes = describeReleaseChanges(diff);

  return (
    <div className="grid gap-4">
      {diff.bump === null || diff.nextVersion === null ? null : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Version {diff.currentVersion} becomes
          </span>
          <span className="text-lg font-semibold">{diff.nextVersion}</span>
          <Badge variant="secondary">{bumpWord(diff.bump)}</Badge>
        </div>
      )}

      <p className="text-sm">{releaseReason(diff, changes)}</p>

      {changes.length === 0 ? null : <ReleaseChangeList changes={changes} />}
    </div>
  );
}

function ReleaseChangeList({
  changes,
}: {
  changes: DescribedReleaseChange[];
}): ReactElement {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">What changed</h3>
      {/* Each change in words. The bump of a single change is not repeated
          here: the badge above carries the Release's, and the sentence above
          names the change that drove it. */}
      <ul className="grid gap-1 text-sm">
        {changes.map((change) => (
          <li key={change.key}>{change.description}</li>
        ))}
      </ul>
    </div>
  );
}
