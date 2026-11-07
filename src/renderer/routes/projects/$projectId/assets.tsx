import { Trans, useLingui } from '@lingui/react/macro';
import {
  createFileRoute,
  Link,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { Images } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { AddAssetButton } from '@renderer/components/add-asset-button';
import {
  AssetCardContents,
  AssetCardSkeleton,
} from '@renderer/components/asset-card';
import { Page } from '@renderer/components/page';
import { Pane, Panes } from '@renderer/components/pane';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { FilterInput } from '@renderer/components/ui/filter-input';
import { AssetsScreenContext } from '@renderer/hooks/useAssetsScreen';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { assetFileName } from '@renderer/lib/assetFile';
import { cn } from '@renderer/lib/utils';
import { assetCardVariants, assetGridVariants } from '@renderer/lib/variants';
import { queryOptions } from '@renderer/queries';

import type { Asset } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/assets')({
  component: ProjectAssetsLayout,
});

/**
 * One card of the grid, which opens that Asset's pane.
 *
 * The whole card is the link, so there is one way in, and the Asset it opens is
 * in the address, which is what lets the question before losing changes catch a
 * click on the next card. The open card takes the muted surface and the bar of
 * an active row, and says it is the current one to a screen reader.
 */
function AssetGridCard({
  asset,
  projectId,
  onMounted,
}: {
  asset: Asset;
  projectId: string;
  /** Hands the card over, so the grid can take the focus back to it. */
  onMounted: (id: string, card: HTMLAnchorElement | null) => void;
}): ReactElement {
  return (
    <Link
      data-slot="asset-card"
      to="/projects/$projectId/assets/$assetId"
      params={{ projectId: projectId, assetId: asset.id }}
      activeProps={{ 'data-active': true }}
      ref={(card) => {
        onMounted(asset.id, card);
      }}
      className={cn(
        assetCardVariants(),
        'no-underline hover:bg-muted/50 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]'
      )}
    >
      <AssetCardContents asset={asset} />
    </Link>
  );
}

/**
 * The Assets of a Project as ci's ruled grid, with the open one's pane beside
 * it.
 *
 * It is a layout route, so the grid stays as it is while a card opens, closes
 * or is saved, and the pane beside it is whatever the address holds: one Asset,
 * a file that is being added, or nothing.
 */
function ProjectAssetsLayout(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Assets`);
  const { data: assets, isPending: isListingAssets } = useQueryNoError(
    queryOptions.assets.list({
      projectId: projectId,
      limit: 0,
    })
  );
  const [filter, setFilter] = useState('');
  // The file Add Asset picked, which the pane for a new Asset reads. It is kept
  // here rather than in the address, because a path is no part of an address a
  // person can come back to.
  const [pickedFilePath, setPickedFilePath] = useState<string | null>(null);
  // Which card the focus goes back to once a delete has gone through: the one
  // that takes the place of the deleted card, by the index it stood at.
  const [deleted, setDeleted] = useState<{ id: string; index: number } | null>(
    null
  );
  const cards = useRef(new Map<string, HTMLAnchorElement>());
  const addAssetRef = useRef<HTMLButtonElement>(null);

  const needle = filter.trim().toLowerCase();
  const listedAssets = isListingAssets ? null : assets.list;
  const shownAssets = useMemo(
    () =>
      listedAssets === null
        ? []
        : needle === ''
          ? listedAssets
          : listedAssets.filter((asset) =>
              // By the file name the card shows, so typing what is on screen
              // narrows the grid, the extension included.
              assetFileName(asset).toLowerCase().includes(needle)
            ),
    [listedAssets, needle]
  );

  useEffect(() => {
    if (deleted === null) {
      return;
    }

    // Waits until the grid has lost the deleted Asset, so the focus never
    // lands on the card that is about to go.
    if (shownAssets.some((asset) => asset.id === deleted.id)) {
      return;
    }

    const next = shownAssets[Math.min(deleted.index, shownAssets.length - 1)];
    const card = next === undefined ? undefined : cards.current.get(next.id);
    // With no card left there is no grid either, so Add Asset takes the focus,
    // which is the one thing the empty state offers.
    (card ?? addAssetRef.current)?.focus();
    setDeleted(null);
  }, [deleted, shownAssets]);

  function onFilePicked(filePath: string): void {
    setPickedFilePath(filePath);
    void router.navigate({
      to: '/projects/$projectId/assets/new',
      params: { projectId: projectId },
    });
  }

  return (
    <AssetsScreenContext
      value={{
        pickedFilePath: pickedFilePath,
        onAssetDeleted: (id) => {
          setDeleted({
            id: id,
            index: shownAssets.findIndex((asset) => asset.id === id),
          });
        },
      }}
    >
      <Panes>
        <Pane name={t`the Assets of this Project`}>
          {/*
            The empty state takes the whole pane, head and all, so nothing
            repeats the action it offers, see ci's rule for an empty state.
          */}
          {isListingAssets === false && assets.total === 0 ? (
            <Empty>
              <EmptyMedia>
                <Images />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>No Assets yet</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  An Asset is a file an Entry can point at, such as an image or
                  a PDF. Add the first one to use it in a Collection&apos;s
                  fields.
                </Trans>
              </EmptyDescription>
              <EmptyActions>
                <AddAssetButton
                  variant="default"
                  buttonRef={addAssetRef}
                  onFilePicked={onFilePicked}
                />
              </EmptyActions>
            </Empty>
          ) : (
            <Page
              title={t`Assets`}
              count={isListingAssets ? undefined : assets.total}
              actions={
                isListingAssets ? (
                  <></>
                ) : (
                  <>
                    <FilterInput
                      className="w-65"
                      name={t`Filter Assets`}
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                    <AddAssetButton
                      variant="default"
                      buttonRef={addAssetRef}
                      onFilePicked={onFilePicked}
                    />
                  </>
                )
              }
            >
              {/* The grid spans its pane, so a rule runs from one divider to
              the other and each card carries the text edge itself. */}
              <div
                className={cn(
                  assetGridVariants(),
                  '-mx-(--pane-edge) border-t'
                )}
              >
                {isListingAssets
                  ? [1, 2, 3, 4].map((index) => (
                      <AssetCardSkeleton key={index} />
                    ))
                  : shownAssets.map((asset) => (
                      <AssetGridCard
                        key={asset.id}
                        asset={asset}
                        projectId={projectId}
                        onMounted={(id, card) => {
                          if (card === null) {
                            cards.current.delete(id);
                            return;
                          }
                          cards.current.set(id, card);
                        }}
                      />
                    ))}
              </div>
              {isListingAssets === false && shownAssets.length === 0 ? (
                <p className="py-4 text-muted-foreground">
                  <Trans>No Asset matches the filter.</Trans>
                </p>
              ) : null}
            </Page>
          )}
        </Pane>
        <Outlet />
      </Panes>
    </AssetsScreenContext>
  );
}
