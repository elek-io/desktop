import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { SignInAgainPage } from '@renderer/components/cloud-account-forms';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/sign-in-again')({
  component: RouteComponent,
});

function RouteComponent(): ReactElement | null {
  useBreadcrumb(Route, 'Sign in');

  return <SignInAgainPage />;
}
