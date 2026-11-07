import { useLingui } from '@lingui/react/macro';
import { type ReactElement, type ReactNode } from 'react';

import { AssetDisplay } from '@renderer/components/asset-display';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { assetFileName } from '@renderer/lib/assetFile';
import { cn, formatBytes } from '@renderer/lib/utils';
import { assetCardVariants } from '@renderer/lib/variants';

import type { Asset } from '@elek-io/core';

// The one Assets grid and the one card in it: the Assets screen draws it with
// each card opening that Asset's pane, and the Asset picker draws the same grid
// with a radio button or a checkbox per card. So an Asset reads the same way
// wherever it is shown.
//
// See contributing/renderer/dynamic-form-field-generation.md#reference-fields-asset-and-entry.

/**
 * What a card shows of an Asset, for the element the caller makes of it: a link
 * that opens its pane, or a label that chooses it.
 *
 * `control` is the radio button or checkbox a picker puts beside the name, and
 * nothing where a card is opened rather than chosen.
 */
export function AssetCardContents({
  asset,
  control,
}: {
  asset: Asset;
  control?: ReactNode;
}): ReactElement {
  const { t } = useLingui();
  const type = asset.extension.toUpperCase();
  const size = formatBytes(asset.size);

  return (
    <>
      {/* The preview says the same as the name below it, so it stays out of
      the card's accessible name. */}
      <span aria-hidden="true">
        <AssetDisplay
          {...asset}
          static
          fit="cover"
          className="h-28 w-full rounded-md"
        />
      </span>
      <span className="flex items-start gap-2">
        {control}
        <span className="flex min-w-0 flex-col">
          <span data-slot="asset-card-name" className="truncate text-label">
            {assetFileName(asset)}
          </span>
          <span className="text-small text-muted-foreground">
            {t`${type}, ${size}`}
          </span>
        </span>
      </span>
    </>
  );
}

/**
 * One Asset as a card of its own, for a place that shows an Asset without
 * opening or choosing it, such as a change in the History.
 */
export function AssetCard({
  asset,
  className,
}: {
  asset: Asset;
  className?: string;
}): ReactElement {
  return (
    <div data-slot="asset-card" className={cn(assetCardVariants(), className)}>
      <AssetCardContents asset={asset} />
    </div>
  );
}

/** A card while the Assets are still being read. */
export function AssetCardSkeleton(): ReactElement {
  return (
    <div className={assetCardVariants()}>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
