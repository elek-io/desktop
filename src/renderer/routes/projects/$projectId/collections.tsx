import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

export const Route = createFileRoute('/projects/$projectId/collections')({
  component: ProjectCollectionsLayout,
});

/**
 * Everything under Collections, which the Project's sidebar leads to.
 *
 * The layout holds no list of its own: every Collection of the Project is a row
 * of that one sidebar, so what opens here takes the whole panel. It names no
 * crumb either, because it opens no page of its own, and ci's trail holds only
 * what opens.
 */
function ProjectCollectionsLayout(): ReactElement {
  return <Outlet />;
}
