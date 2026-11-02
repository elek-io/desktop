import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Pane, Panel } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/user')({
  component: UserLayout,
});

function UserLayout(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, 'User');

  return (
    <Panel>
      <Pane name={t`your Profile`}>
        <Outlet />
      </Pane>
    </Panel>
  );
}
