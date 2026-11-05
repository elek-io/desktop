import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Pane, Panel } from '@renderer/components/pane';

export const Route = createFileRoute('/user')({
  component: UserLayout,
});

/**
 * Everything about the person using the app, which the user menu leads to.
 *
 * It names no crumb, because it opens no page of its own: `/user` settles on
 * the Profile, so the Profile's own crumb is the page. ci's trail holds only
 * what opens.
 */
function UserLayout(): ReactElement {
  const { t } = useLingui();

  return (
    <Panel>
      <Pane name={t`your Profile`}>
        <Outlet />
      </Pane>
    </Panel>
  );
}
