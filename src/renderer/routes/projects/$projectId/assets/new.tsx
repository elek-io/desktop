import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { NewAssetPane } from '@renderer/components/asset-pane';
import { Pane } from '@renderer/components/pane';
import { useAssetsScreen } from '@renderer/hooks/useAssetsScreen';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/assets/new')({
  component: ProjectAssetNewPage,
});

/**
 * The pane that adds an Asset: the file is picked, and this is where Core's
 * name and description are asked for.
 *
 * Without a picked file there is nothing to add, which is what a window
 * reloaded on this address is, so it goes back to the grid.
 */
function ProjectAssetNewPage(): ReactElement {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  const { pickedFilePath } = useAssetsScreen();
  useBreadcrumb(Route, t`Add Asset`);

  if (pickedFilePath === null) {
    return (
      <Navigate
        to="/projects/$projectId/assets"
        params={{ projectId: projectId }}
        replace
      />
    );
  }

  return (
    <Pane width="list" name={t`the Asset being added`}>
      <NewAssetPane key={pickedFilePath} filePath={pickedFilePath} />
    </Pane>
  );
}
