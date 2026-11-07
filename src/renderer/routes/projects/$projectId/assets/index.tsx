import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/projects/$projectId/assets/')({
  component: ProjectAssetsIndexPage,
});

/**
 * What stands beside the Assets grid while no Asset is open, which is nothing.
 *
 * The grid takes the whole panel then, since ci gives the pane of 296 px to an
 * Asset that was opened rather than keeping its room free.
 */
function ProjectAssetsIndexPage(): null {
  return null;
}
