import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState, type ReactElement, type ReactNode } from 'react';

import { AssetDisplay } from '@renderer/components/asset-display';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
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
import { FilterInput } from '@renderer/components/ui/filter-input';
import { Label } from '@renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@renderer/components/ui/radio-group';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { cn, formatBytes } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import type { Asset } from '@elek-io/core';

// The one dialog that chooses Assets: the Asset field's Choose and Replace open
// it, and so does the markdown editor's Reference an Asset. Each Asset is a card
// with a radio button where one may be chosen and a checkbox where several may.
//
// Add Asset, which ci draws beside the filter, belongs to the Assets screen's
// own pane and is built with it.
//
// See contributing/renderer/dynamic-form-field-generation.md.

export interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the dialog is called, which names the field it was opened from. */
  title: string;
  /** The one line below the title, saying what choosing does. */
  description: ReactNode;
  /** The MIME types the field takes, or every type where it is empty. */
  ofAssetMimeTypes: string[];
  /** The Assets already chosen, so the dialog opens on them. */
  chosenIds: string[];
  /**
   * How many Assets may be chosen at once. One draws radio buttons and more
   * draws checkboxes, and the maximum holds here rather than at the save.
   */
  max: number | null;
  /** The Assets that were chosen, in the order the list shows them. */
  onChoose: (assets: Asset[]) => void;
}

/** A dialog that chooses Assets of the Project, filtered by name. */
export function AssetPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  ofAssetMimeTypes,
  chosenIds,
  max,
  onChoose,
}: AssetPickerDialogProps): ReactElement {
  const { t } = useLingui();
  const itemId = useId();
  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  // What is chosen inside the dialog, which only reaches the field once Choose
  // is pressed, so Cancel changes nothing. Opening the dialog takes the
  // field's own choice up again, adjusted during the render rather than in an
  // effect, so the list is never drawn with the previous choice.
  const [draftIds, setDraftIds] = useState<string[]>(chosenIds);
  const [filter, setFilter] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraftIds(chosenIds);
      setFilter('');
    }
  }

  const takesOne = max === 1;
  // Core enforces `ofAssetMimeTypes` when it writes, reading each Asset's real
  // MIME type, so without this an Asset the field refuses could be chosen and
  // only the save would say so.
  const allowedAssets: Asset[] = isReadingAssets
    ? []
    : ofAssetMimeTypes.length === 0
      ? assetList.list
      : assetList.list.filter((asset) =>
          ofAssetMimeTypes.includes(asset.mimeType)
        );
  const needle = filter.trim().toLowerCase();
  const shownAssets =
    needle === ''
      ? allowedAssets
      : allowedAssets.filter((asset) =>
          asset.name.toLowerCase().includes(needle)
        );
  const maxReached = max !== null && draftIds.length >= max;
  const allowedMimeTypes = ofAssetMimeTypes.join(', ');

  function toggle(assetId: string, isChosen: boolean): void {
    if (takesOne) {
      setDraftIds([assetId]);
      return;
    }
    setDraftIds(
      isChosen
        ? draftIds.filter((id) => id !== assetId)
        : [...draftIds, assetId]
    );
  }

  function choose(): void {
    // In the order the list shows them rather than the order they were ticked,
    // so what the field holds reads like what was on screen.
    onChoose(allowedAssets.filter((asset) => draftIds.includes(asset.id)));
    onOpenChange(false);
  }

  const cards = shownAssets.map((asset) => {
    const isChosen = draftIds.includes(asset.id);
    const id = `${itemId}-${asset.id}`;
    const type = asset.extension.toUpperCase();
    const size = formatBytes(asset.size);

    return (
      <Label
        key={asset.id}
        htmlFor={id}
        className={cn(
          'flex flex-col items-stretch gap-0 overflow-hidden rounded-md border border-border font-normal',
          'has-data-checked:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
          isChosen === false && maxReached ? 'opacity-50' : null
        )}
      >
        {/* The preview says the same as the name beside it, so it stays out
        of the card's accessible name. */}
        <span aria-hidden="true">
          <AssetDisplay {...asset} static className="aspect-4/3" />
        </span>
        <span className="flex items-center gap-2 p-2">
          {takesOne ? (
            <RadioGroupItem id={id} value={asset.id} />
          ) : (
            <Checkbox
              id={id}
              checked={isChosen}
              disabled={isChosen === false && maxReached}
              onCheckedChange={() => toggle(asset.id, isChosen)}
            />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{asset.name}</span>
            <span className="text-small text-muted-foreground">
              {t`${type}, ${size}`}
            </span>
          </span>
        </span>
      </Label>
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <FilterInput
            name={t`Filter Assets`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {isReadingAssets ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => {
                const key = `skeleton-${String(index)}`;
                return <Skeleton key={key} className="aspect-4/3" />;
              })}
            </div>
          ) : allowedAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ofAssetMimeTypes.length === 0 ? (
                <Trans>
                  No Assets yet. Add one on the Assets screen first.
                </Trans>
              ) : (
                t`No Asset of a type this field takes yet. It takes ${allowedMimeTypes}.`
              )}
            </p>
          ) : shownAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>No Asset matches the filter.</Trans>
            </p>
          ) : takesOne ? (
            <RadioGroup
              aria-label={title}
              value={draftIds[0] ?? null}
              onValueChange={(assetId: string) => toggle(assetId, false)}
              className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            >
              {cards}
            </RadioGroup>
          ) : (
            <div
              role="group"
              aria-label={title}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {cards}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            <Trans>Cancel</Trans>
          </DialogClose>
          <Button type="button" onClick={choose}>
            <Trans>Choose</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
