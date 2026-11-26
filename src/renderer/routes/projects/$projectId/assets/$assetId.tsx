import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { AssetPane, AssetPaneSkeleton } from '@renderer/components/asset-pane';
import { Pane } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { assetFileName } from '@renderer/lib/assetFile';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute('/projects/$projectId/assets/$assetId')({
  component: ProjectAssetPage,
});

/** The open Asset, in the pane of 296 px beside the grid. */
function ProjectAssetPage(): ReactElement {
  const { t } = useLingui();

  const { projectId, assetId } = Route.useParams();
  const { data: asset, isPending: isReadingAsset } = useQueryNoError(
    queryOptions.assets.read({ projectId: projectId, id: assetId })
  );
  useBreadcrumb(Route, isReadingAsset ? undefined : assetFileName(asset));

  return (
    <Pane width="list" name={t`this Asset`}>
      {isReadingAsset ? <AssetPaneSkeleton /> : <AssetPane asset={asset} />}
    </Pane>
  );
}
