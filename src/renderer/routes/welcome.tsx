import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

/**
 * The First start and the account pages opened from it, before any User
 * exists. The root sends a start without a User here, see
 * contributing/renderer/routing.md.
 */
export const Route = createFileRoute('/welcome')({
  component: WelcomeLayout,
});

function WelcomeLayout(): ReactElement {
  useBreadcrumb(Route, 'Welcome');

  return <Outlet />;
}
