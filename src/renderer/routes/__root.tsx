import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import {
  ArrowLeft,
  Bug,
  CircleAlert,
  FileQuestionMark,
  RotateCw,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import {
  AppHeader,
  HeaderTrail,
  HeaderUser,
} from '@renderer/components/app-header';
import { ErrorDetails } from '@renderer/components/error-details';
import { ErrorScreen } from '@renderer/components/error-screen';
import { Pane, Panel } from '@renderer/components/pane';
import { ReportDialog } from '@renderer/components/report-dialog';
import { Button } from '@renderer/components/ui/button';
import {
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { Toaster } from '@renderer/components/ui/sonner';
import { BreadcrumbProvider } from '@renderer/providers/BreadcrumbProvider';
import { UnsavedChangesProvider } from '@renderer/providers/UnsavedChangesProvider';
import { UserProvider } from '@renderer/providers/UserProvider';
import { queryClient, queryOptions } from '@renderer/queries';

export interface RouterContext {}

/** The route the first start is on, which is the one screen without a User. */
// A route's own address, which no language has a form of its own for.
// eslint-disable-next-line lingui/no-unlocalized-strings
const FIRST_START = '/welcome';

// Use the routerContext to create your root route
export const Route = createRootRouteWithContext<RouterContext>()({
  /**
   * The gate in front of every screen: nothing can be written before a User
   * exists, because Core stamps the name and the email address on every change
   * it commits. So while there is none, every address settles on the first
   * start, and once there is one, that address settles on the Projects page.
   *
   * It runs here rather than in a component, so no screen is drawn for a moment
   * before it gives way. The User comes from the same query the whole app reads
   * it through, so the gate costs one read at the start and nothing after it.
   */
  beforeLoad: async ({ location }) => {
    const user = await queryClient.query(queryOptions.user.get());
    const isFirstStart = location.pathname === FIRST_START;

    if (user === null && isFirstStart === false) {
      throw redirect({ to: FIRST_START });
    }
    if (user !== null && isFirstStart) {
      throw redirect({ to: '/projects' });
    }
  },
  component: RootComponent,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
  // The title lives here instead of index.html,
  // since routes can then override it via their own head option
  head: () => ({
    meta: [
      {
        // The product's name, which is never translated, see ci's naming rules.
        // eslint-disable-next-line lingui/no-unlocalized-strings
        title: 'elek.io Desktop',
      },
    ],
  }),
});

function ErrorComponent({ error }: ErrorComponentProps): ReactElement {
  const { t } = useLingui();
  const router = useRouter();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  // A CoreError that crossed IPC arrives with its type, message and Core's origin
  // stack encoded into the message. Decode it so what is logged is clean copy,
  // never the raw sentinel JSON. What the screen shows is the same error read
  // through `ErrorDetails`, masked where Core runs.
  const { message } = parseIpcError(error);

  // In an effect, not the render body. This component holds state now (the
  // report dialog), so logging inline would rewrite the same entry on every
  // open and close, inflating exactly the log tail a bug report attaches.
  useEffect(() => {
    void window.ipc.core.logger.error({
      source: 'desktop',
      message: `Uncaught route error: ${message}`,
      meta: errorLogAttributes(error),
    });
  }, [message, error]);

  return (
    <>
      {/*
        This screen replaces `RootComponent`, so without this the window's
        title would go with it and the document would have none at all.
      */}
      <HeadContent />
      <AppHeader />
      <AppGround>
        <Panel>
          {/* Nothing in here is read, so the name is never shown. */}
          <Pane name={t`what this screen shows`}>
            <ErrorScreen>
              <EmptyMedia className="text-error">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>An unexpected error stopped this screen</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  Nothing about it was sent to us, so a report is how we find
                  out.
                </Trans>
              </EmptyDescription>
              {/*
                Report an issue is the one primary button, because a report is
                how this error reaches us at all. Reload and Back to Projects
                are the two ways on from here, see ci's docs/desktop.md.
              */}
              <EmptyActions>
                <Button Icon={Bug} onClick={() => setIsReportDialogOpen(true)}>
                  <Trans>Report an issue</Trans>
                </Button>
                <Button
                  variant="outline"
                  Icon={RotateCw}
                  onClick={() => location.reload()}
                >
                  <Trans>Reload</Trans>
                </Button>
                <Button
                  variant="ghost"
                  Icon={ArrowLeft}
                  onClick={async () => router.navigate({ to: '/projects' })}
                >
                  <Trans>Back to Projects</Trans>
                </Button>
              </EmptyActions>
              <ErrorDetails error={error} />
            </ErrorScreen>
          </Pane>
        </Panel>
      </AppGround>

      {/*
        The crash is the moment a report is worth most and the moment the user
        is least likely to go looking for the header button, so the boundary
        opens the same dialog itself. Logs default to on here: the effect above
        already wrote this error and its stack into them, so they carry the
        technical detail and the message is left to the user. Copying the error
        into the message would send it even with the logs switched off.
      */}
      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        defaultMode="bug"
        defaultHasLogConsent
      />

      {/*
        This screen replaces RootComponent outright, so it does not inherit its
        Toaster. Without one here a sent report closes its dialog and leaves no
        evidence it worked, and the user sends it again.
      */}
      <Toaster />
    </>
  );
}

function NotFoundComponent(): ReactElement {
  const { t } = useLingui();
  const router = useRouter();
  const { href } = location;

  return (
    <>
      {/* The same as on the error screen: this one replaces `RootComponent` too. */}
      <HeadContent />
      <AppHeader />
      <AppGround>
        <Panel>
          <Pane name={t`what this screen shows`}>
            {/*
              The same screen as an error, without Details: there is no error
              here, only an address the app has no screen for.
            */}
            <ErrorScreen>
              <EmptyMedia>
                <FileQuestionMark />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>This screen does not exist</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>elek.io Desktop has no screen at {href}.</Trans>
              </EmptyDescription>
              <EmptyActions>
                <Button
                  Icon={ArrowLeft}
                  onClick={async () => router.navigate({ to: '/projects' })}
                >
                  <Trans>Back to Projects</Trans>
                </Button>
                <Button
                  variant="outline"
                  Icon={RotateCw}
                  onClick={() => location.reload()}
                >
                  <Trans>Reload</Trans>
                </Button>
              </EmptyActions>
            </ErrorScreen>
          </Pane>
        </Panel>
      </AppGround>
    </>
  );
}

/**
 * The ground the header sits on, below it, which holds the Project's sidebar
 * and the main panel side by side. The window itself is the ground, so this
 * only gives the row its height, see contributing/renderer/theming-and-styling.md.
 */
function AppGround({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex min-h-0 flex-1">{children}</div>;
}

function RootComponent(): ReactElement {
  return (
    <>
      <HeadContent />
      <UserProvider>
        <BreadcrumbProvider>
          {/* Above the route, so leaving a page and closing the window ask the
          same question in the same dialog, and so the main process is told
          about every form on screen at once. */}
          <UnsavedChangesProvider>
            <AppHeader trail={<HeaderTrail />} user={<HeaderUser />} />
            <AppGround>
              <Outlet />
            </AppGround>
          </UnsavedChangesProvider>
          <Toaster />
          <TanStackRouterDevtools
            position="bottom-right"
            initialIsOpen={false}
          />
          <ReactQueryDevtools position="bottom" initialIsOpen={false} />
        </BreadcrumbProvider>
      </UserProvider>
    </>
  );
}
