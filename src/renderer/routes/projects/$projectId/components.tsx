import { useLingui } from '@lingui/react/macro';
import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/components')({
  component: ProjectComponentsLayout,
});

function ProjectComponentsLayout(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, t`Components`);

  return <Outlet />;
}
