import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Pane, Panel } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/user')({
  component: UserLayout,
});

/**
 * Everything about the person using the app, which the user menu leads to.
 *
 * It opens no page of its own, since `/user` settles on the Profile, so the
 * crumb it names is the Projects step ci's trail starts on: the Profile sits
 * outside the Projects route, so no match of its own carries that step.
 */
function UserLayout(): ReactElement {
  const { t } = useLingui();

  // The route the crumb leads to, which is no word anybody reads.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  useBreadcrumb(Route, t`Projects`, '/projects');

  return (
    <Panel>
      <Pane name={t`your Profile`}>
        <Outlet />
      </Pane>
    </Panel>
  );
}
