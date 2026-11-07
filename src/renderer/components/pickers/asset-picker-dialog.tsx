import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState, type ReactElement } from 'react';

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

/**
 * ci's Assets grid: four ruled columns, whatever the window does, with a
 * divider between the columns of a row and a rule between its rows.
 *
 * The rule between two rows is the lower row's own top border, so the last row
 * draws none against the footer, which is what ci's grid does. The rule above
 * the first row is the body's, and `gap-0` is the grid's, where a radio group
 * would otherwise bring the registry's gap.
 */
const ASSET_GRID = cn(
  'grid grid-cols-4 gap-0 [&>*:not(:nth-child(4n+1))]:border-l [&>*:not(:nth-child(-n+4))]:border-t'
);

/**
 * One card of that grid: its preview, then the control that chooses it beside
 * the name. A chosen card is marked by that control alone, as ci asks, so the
 * card takes no border and no surface of its own.
 */
const ASSET_CARD = cn(
  'flex flex-col items-stretch gap-2.5 border-border px-6 pt-4 pb-4.5 font-normal has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-ring'
);

export interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the dialog is called, which names the field it was opened from. */
  title: string;
  /**
   * The one line below the title, saying which Assets the field takes and how
   * many. How many are chosen is added here, since that changes while the
   * dialog is open.
   */
  description: string;
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
  // How many are chosen right now, which ci draws beside what the field takes,
  // so a card that cannot be ticked at the maximum says why. A field that
  // takes one needs none of it, since its radio buttons say that themselves.
  const chosenCount = draftIds.length;
  const chosenSentence =
    takesOne || chosenCount === 0 ? null : t`${chosenCount} chosen.`;
  const describesTheChoice = [description, chosenSentence]
    .filter((part): part is string => part !== null)
    .join(' ');

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
          ASSET_CARD,
          isChosen === false && maxReached ? 'opacity-50' : null
        )}
      >
        {/* The preview says the same as the name beside it, so it stays out
        of the card's accessible name. */}
        <span aria-hidden="true">
          <AssetDisplay
            {...asset}
            static
            fit="cover"
            className="h-28 w-full rounded-md"
          />
        </span>
        <span className="flex items-start gap-2">
          {takesOne ? (
            <RadioGroupItem className="mt-0.5" id={id} value={asset.id} />
          ) : (
            <Checkbox
              className="mt-0.5"
              id={id}
              checked={isChosen}
              disabled={isChosen === false && maxReached}
              onCheckedChange={() => toggle(asset.id, isChosen)}
            />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-label">{asset.name}</span>
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
      {/* ci's Assets grid is four columns wide whatever the window does, so
      the dialog is as wide as that grid asks and the filter stands above it
      rather than scrolling with it. */}
      <DialogContent className="grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-[856px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{describesTheChoice}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 px-5 py-3">
          <FilterInput
            className="flex-1"
            name={t`Filter Assets`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>

        <DialogBody flush className="border-t">
          {isReadingAssets ? (
            <div className={ASSET_GRID}>
              {Array.from({ length: 8 }).map((_, index) => {
                const key = `skeleton-${String(index)}`;
                return (
                  <div key={key} className={ASSET_CARD}>
                    <Skeleton className="h-28 w-full" />
                  </div>
                );
              })}
            </div>
          ) : allowedAssets.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              {ofAssetMimeTypes.length === 0 ? (
                <Trans>
                  No Assets yet. Add one on the Assets screen first.
                </Trans>
              ) : (
                // Which types it takes is the line above rather than a list of
                // MIME types, which say nothing to somebody writing content.
                <Trans>No Asset of a type this field takes yet.</Trans>
              )}
            </p>
          ) : shownAssets.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              <Trans>No Asset matches the filter.</Trans>
            </p>
          ) : takesOne ? (
            <RadioGroup
              aria-label={title}
              value={draftIds[0] ?? null}
              onValueChange={(assetId: string) => toggle(assetId, false)}
              className={ASSET_GRID}
            >
              {cards}
            </RadioGroup>
          ) : (
            <div role="group" aria-label={title} className={ASSET_GRID}>
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
