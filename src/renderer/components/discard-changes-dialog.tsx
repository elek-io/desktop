import { Trans } from '@lingui/react/macro';
import { type ReactElement } from 'react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';

export interface DiscardChangesDialogProps {
  open: boolean;
  /** The page the changes belong to, as its own title names it. */
  title: string;
  /** Keeps the page and what was typed on it. */
  onKeepEditing: () => void;
  /** Lets go of what was typed and carries on. */
  onDiscard: () => void;
}

/**
 * The question asked before changes nobody saved are lost: leaving the page
 * they are on, closing the window, or quitting the app.
 *
 * It names the page, so somebody who has two things open knows which one is
 * being asked about. Keep editing is the ghost button and changes nothing,
 * Discard is the red one, which is the pair ci draws for a question whose
 * answer cannot be taken back. Dismissing it any other way keeps editing, so
 * nothing is lost by pressing Escape.
 *
 * It holds the question and nothing about who asked, so the leave guard and the
 * question before the window closes are one dialog rather than two that drift
 * apart. See contributing/renderer/forms.md.
 */
export function DiscardChangesDialog({
  open,
  title,
  onKeepEditing,
  onDiscard,
}: DiscardChangesDialogProps): ReactElement {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen === false) {
          onKeepEditing();
        }
      }}
    >
      <AlertDialogContent data-slot="discard-changes-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Discard your changes to {title}?</Trans>
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onKeepEditing}>
            <Trans>Keep editing</Trans>
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            <Trans>Discard</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
