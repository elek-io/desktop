import { Trans, useLingui } from '@lingui/react/macro';
import type { ReactElement } from 'react';

import { AssetPickerDialog } from '@renderer/components/pickers/asset-picker-dialog';

import type { Asset } from '@elek-io/core';

export interface AssetReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Restricts which mime types can be picked, empty means any
  ofAssetMimeTypes: string[];
  onPick: (asset: Asset) => void;
}

/**
 * The dialog that picks one Asset to reference inside the markdown editor.
 *
 * It is the Asset field's own picker with one choice, so the Assets are listed
 * the same way, each with a radio button.
 */
export const AssetReferencePicker = ({
  open,
  onOpenChange,
  ofAssetMimeTypes,
  onPick,
}: AssetReferencePickerProps): ReactElement => {
  const { t } = useLingui();

  return (
    <AssetPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t`Reference an Asset`}
      description={<Trans>The Asset is inserted at the cursor position.</Trans>}
      ofAssetMimeTypes={ofAssetMimeTypes}
      chosenIds={[]}
      max={1}
      onChoose={(assets) => {
        const asset = assets[0];
        if (asset !== undefined) {
          onPick(asset);
        }
      }}
    />
  );
};
