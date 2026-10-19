import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CreateAccountPage } from '@renderer/components/cloud-account-forms';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/welcome/create-account')({
  component: RouteComponent,
});

function RouteComponent(): ReactElement | null {
  useBreadcrumb(Route, 'Create account');

  return <CreateAccountPage origin="welcome" />;
}
