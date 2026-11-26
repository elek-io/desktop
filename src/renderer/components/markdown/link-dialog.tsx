import { Trans } from '@lingui/react/macro';
import { useState, type ReactElement } from 'react';

import { FieldShell } from '@renderer/components/ui/app-form';
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
import { Input } from '@renderer/components/ui/input';
import { fieldRules } from '@renderer/lib/fieldRules';

export interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (href: string) => void;
}

/**
 * Small dialog asking for a URL to toggle a link on the editor's current
 * text selection.
 */
export const LinkDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: LinkDialogProps): ReactElement => {
  const [href, setHref] = useState('');

  function confirm(): void {
    if (href.trim() === '') {
      return;
    }
    onConfirm(href.trim());
    setHref('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Link the selected text</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              The link applies to the text selected in the editor. Core accepts
              http(s), mailto and tel URLs, plus relative and fragment links.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {/* The one field with no form behind it, so it draws the same shell
          through FieldShell. Apply link is held until it holds something, and
          Required is that rule said before anybody presses it. */}
          <FieldShell
            label={<Trans>URL</Trans>}
            rules={fieldRules({ required: true })}
          >
            {(controlProps) => (
              <Input
                type="url"
                value={href}
                onChange={(event) => {
                  setHref(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirm();
                  }
                }}
                {...controlProps}
              />
            )}
          </FieldShell>
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            <Trans>Cancel</Trans>
          </DialogClose>
          <Button type="button" onClick={confirm} disabled={href.trim() === ''}>
            <Trans>Apply link</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
