import { useState, type ReactElement } from 'react';

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
import { Label } from '@renderer/components/ui/label';

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
          <DialogTitle>Link the selected text</DialogTitle>
          <DialogDescription>
            The link applies to the text selected in the editor. Core accepts
            http(s), mailto and tel URLs, plus relative and fragment links.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Label htmlFor="markdown-link-href">URL</Label>
          <Input
            id="markdown-link-href"
            type="url"
            placeholder="https://example.com"
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
          />
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={confirm} disabled={href.trim() === ''}>
            Apply link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
