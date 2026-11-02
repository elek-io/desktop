import { CheckIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { AssetDisplay } from '@renderer/components/asset-display';
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
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import type { Asset } from '@elek-io/core';

export interface AssetReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Restricts which mime types can be picked, empty means any
  ofAssetMimeTypes: string[];
  onPick: (asset: Asset) => void;
}

/**
 * Dialog to pick a single Asset for an assetReference inside the markdown
 * editor. Single-select variant of the Asset field's picker.
 */
export const AssetReferencePicker = ({
  open,
  onOpenChange,
  ofAssetMimeTypes,
  onPick,
}: AssetReferencePickerProps): ReactElement => {
  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  const availableAssets: Asset[] = isReadingAssets
    ? []
    : ofAssetMimeTypes.length === 0
      ? assetList.list
      : assetList.list.filter((asset) =>
          ofAssetMimeTypes.includes(asset.mimeType)
        );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reference an Asset</DialogTitle>
          <DialogDescription>
            The Asset is inserted at the cursor position.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isReadingAssets ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => {
                const key = `skeleton-${String(i)}`;
                return <Skeleton key={key} className="aspect-4/3" />;
              })}
            </div>
          ) : availableAssets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No matching Assets available. Add Assets to the project first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {availableAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onPick(asset);
                  }}
                  className="relative cursor-pointer overflow-hidden rounded-md border-2 border-border transition-all hover:border-input"
                >
                  <AssetDisplay {...asset} static />
                  <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                    {asset.name}
                  </div>
                  <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity hover:opacity-100">
                    <CheckIcon className="h-3 w-3" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
