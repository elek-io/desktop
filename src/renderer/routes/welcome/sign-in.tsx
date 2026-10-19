import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { SignInPage } from '@renderer/components/cloud-account-forms';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/welcome/sign-in')({
  component: RouteComponent,
});

function RouteComponent(): ReactElement | null {
  useBreadcrumb(Route, 'Sign in');

  return <SignInPage origin="welcome" />;
}
