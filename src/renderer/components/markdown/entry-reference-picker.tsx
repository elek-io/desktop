import { Trans, useLingui } from '@lingui/react/macro';
import type { ReactElement } from 'react';

import { EntryPickerDialog } from '@renderer/components/pickers/entry-picker-dialog';

import type { Collection, Entry } from '@elek-io/core';

export interface EntryReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Restricts which Collections can be picked from, empty means any
  ofCollections: string[];
  onPick: (pick: {
    entry: Entry;
    collection: Collection;
    label: string;
  }) => void;
}

/**
 * The dialog that picks one Entry to reference inside the markdown editor.
 *
 * It is the Entry field's own picker with one choice, so the Entries are listed
 * the same way, each with a radio button.
 */
export const EntryReferencePicker = ({
  open,
  onOpenChange,
  ofCollections,
  onPick,
}: EntryReferencePickerProps): ReactElement => {
  const { t } = useLingui();

  return (
    <EntryPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t`Reference an Entry`}
      description={
        <Trans>The reference is inserted at the cursor position.</Trans>
      }
      ofCollections={ofCollections}
      chosenIds={[]}
      max={1}
      onChoose={(entries) => {
        const chosen = entries[0];
        if (chosen !== undefined) {
          onPick({
            entry: chosen.entry,
            collection: chosen.collection,
            label: chosen.title,
          });
        }
      }}
    />
  );
};
