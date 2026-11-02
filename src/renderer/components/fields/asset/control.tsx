import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { CheckIcon, ImagePlusIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

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
  DialogTrigger,
} from '@renderer/components/ui/dialog';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { cn } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import type {
  Asset,
  AssetFieldDefinition,
  ValueContentReferenceToAsset,
} from '@elek-io/core';

export interface FormAssetFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: AssetFieldDefinition;
  disabled: boolean;
}

/**
 * Form field component for selecting one or multiple existing Assets.
 * Opens a dialog to browse and select assets from the project.
 * The field value is an array of ValueContentReferenceToAsset objects. The
 * control-association props land on the dialog trigger, its focusable control.
 */
export function AssetControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  ...controlProps
}: FormAssetFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();

  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  const selectedRefs: ValueContentReferenceToAsset[] = Array.isArray(
    field.value
  )
    ? field.value
    : [];

  const selectedIds = new Set(selectedRefs.map((ref) => ref.id));

  const maxReached =
    fieldDefinition.max !== null && selectedRefs.length >= fieldDefinition.max;

  // How many Assets may be picked, as one sentence per shape rather than
  // fragments joined together, and the allowed types as one placeholder.
  const assetMaximum = fieldDefinition.max;
  const assetMinimum = fieldDefinition.min;
  const assetLimitsSentence = [
    assetMaximum !== null
      ? t`Select up to ${plural(assetMaximum, {
          one: '# asset',
          other: '# assets',
        })}.`
      : t`Select one or more assets.`,
    assetMinimum !== null ? t`At least ${assetMinimum} required.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
  const allowedMimeTypes = fieldDefinition.ofAssetMimeTypes.join(', ');

  function toggleAsset(asset: Asset): void {
    if (selectedIds.has(asset.id)) {
      field.onChange(
        selectedRefs.filter((ref) => ref.id !== asset.id) as typeof field.value
      );
    } else if (!maxReached) {
      field.onChange([
        ...selectedRefs,
        { id: asset.id, objectType: 'asset' as const },
      ] as typeof field.value);
    }
  }

  function removeAsset(assetId: string): void {
    field.onChange(
      selectedRefs.filter((ref) => ref.id !== assetId) as typeof field.value
    );
  }

  // Only offer Assets the definition allows. Core enforces ofAssetMimeTypes at
  // write time (EntryService.validateValueReferences reads each Asset's real
  // mimeType), so without this the user picks a disallowed Asset and only finds
  // out when saving fails. Matches the markdown asset-reference picker.
  const selectableAssets: Asset[] = isReadingAssets
    ? []
    : fieldDefinition.ofAssetMimeTypes.length === 0
      ? assetList.list
      : assetList.list.filter((asset) =>
          fieldDefinition.ofAssetMimeTypes.includes(asset.mimeType)
        );

  // Resolve selected refs to full Asset objects for display. Resolved against the
  // full list, not the selectable one, so an Asset that predates a mime-type
  // restriction still renders instead of silently vanishing.
  const selectedAssets: Asset[] = isReadingAssets
    ? []
    : selectedRefs
        .map((ref) => assetList.list.find((a) => a.id === ref.id))
        .filter((a): a is Asset => a !== undefined);

  return (
    <div className="space-y-3">
      {selectedAssets.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {selectedAssets.map((asset) => {
            const name = asset.name;
            return (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-md border border-border"
              >
                <AssetDisplay {...asset} static className="aspect-4/3" />
                <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                  {name}
                </div>
                {disabled !== true && (
                  <Button
                    variant="destructive"
                    size="icon"
                    // Shown on hover and on keyboard focus, so reaching it with
                    // Tab does not leave an invisible control focused.
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => removeAsset(asset.id)}
                    type="button"
                    Icon={XIcon}
                  >
                    {/* The icon alone names nothing, so the Asset it removes is
                    said for a screen reader. */}
                    <span className="sr-only">{t`Remove ${name}`}</span>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog>
        <DialogTrigger
          render={
            <Button
              {...controlProps}
              ref={field.ref}
              onBlur={field.onBlur}
              variant="secondary"
              type="button"
              disabled={disabled === true || maxReached}
              Icon={ImagePlusIcon}
            />
          }
        >
          <Trans>Select Assets</Trans>
          {fieldDefinition.min !== null || fieldDefinition.max !== null ? (
            <span className="ml-1 text-muted-foreground">
              ({selectedRefs.length}
              {fieldDefinition.max !== null ? ` / ${fieldDefinition.max}` : ''})
            </span>
          ) : null}
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Select Assets</Trans>
            </DialogTitle>
            <DialogDescription>{assetLimitsSentence}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {isReadingAssets ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => {
                  const key = `skeleton-${String(i)}`;
                  return <Skeleton key={key} className="aspect-4/3" />;
                })}
              </div>
            ) : selectableAssets.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {fieldDefinition.ofAssetMimeTypes.length === 0 ? (
                  <Trans>
                    No assets available. Add assets to the project first.
                  </Trans>
                ) : (
                  t`No assets of an allowed type available. This Field accepts ${allowedMimeTypes}.`
                )}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {selectableAssets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  const isDisabledOption = !isSelected && maxReached;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      disabled={isDisabledOption}
                      onClick={() => toggleAsset(asset)}
                      className={cn(
                        'relative cursor-pointer overflow-hidden rounded-md border-2 transition-all',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-input',
                        isDisabledOption && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <AssetDisplay {...asset} static />
                      <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                        {asset.name}
                      </div>
                      {isSelected === true ? (
                        <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <CheckIcon className="h-3 w-3" />
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              <Trans>Done</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
