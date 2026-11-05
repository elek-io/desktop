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
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import {
  AppHeader,
  HeaderTrail,
  HeaderUser,
} from '@renderer/components/app-header';
import { Page } from '@renderer/components/page';
import { Pane, Panel } from '@renderer/components/pane';
import { ReportDialog } from '@renderer/components/report-dialog';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area';
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
  // stack encoded into the message. Decode all of it so we show and log clean
  // copy, never the raw sentinel JSON. A non-Core error (route or JS error) keeps
  // its own stack, which `parseIpcError` falls back to, so this is never empty
  // and never carries a sentinel to leak.
  const { message, stack: displayStack } = parseIpcError(error);

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

  function Description(): ReactElement {
    return (
      <Trans>
        Something went wrong and this screen is all we can show you. Nothing
        about it was sent to us automatically, so we only find out if you tell
        us. Reporting it takes a moment: tell us what you were doing, and the
        logs it sends along show us the error.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <>
        <Button
          variant="outline"
          onClick={async () => router.navigate({ to: '/projects' })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          <Trans>Back to Projects</Trans>
        </Button>
        <Button variant="outline" onClick={() => location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          <Trans>Reload</Trans>
        </Button>
        <Button variant="default" onClick={() => setIsReportDialogOpen(true)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          <Trans>Report this problem</Trans>
        </Button>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <AppGround>
        <Panel>
          {/* Nothing in here is read, so the name is never shown. */}
          <Pane name={t`what this screen shows`}>
            <Page
              title={t`Error`}
              description={<Description />}
              actions={<Actions />}
            >
              <div data-slot="error-cause">
                <p>{message}</p>
                <ScrollArea>
                  <div className="flex w-max py-6 text-xs">
                    <pre>{displayStack}</pre>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </Page>
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

  function Description(): ReactElement {
    return (
      <Trans>
        You&apos;ve tried accessing a route that could not be found.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <>
        <Button
          variant="outline"
          onClick={async () => router.navigate({ to: '/projects' })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          <Trans>Back to Projects</Trans>
        </Button>
        <Button variant="default" onClick={() => location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          <Trans>Reload</Trans>
        </Button>
      </>
    );
  }

  const { href } = location;

  return (
    <>
      <AppHeader />
      <AppGround>
        <Panel>
          <Pane name={t`what this screen shows`}>
            <Page
              title={t`Not Found`}
              description={<Description />}
              actions={<Actions />}
            >
              <p>
                <Trans>
                  You&apos;ve tried to access &quot;{href}&quot; but it does not
                  exist. Use the buttons above to navigate back or try to reload
                  the page.
                </Trans>
              </p>
            </Page>
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
