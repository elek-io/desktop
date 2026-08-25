import { parseIpcError } from '@root/src/shared/ipcError';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { AppHeader } from '@renderer/components/app-header';
import { Page } from '@renderer/components/page';
import { ReportDialog } from '@renderer/components/report-dialog';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area';
import { Toaster } from '@renderer/components/ui/sonner';
import { UserHeader } from '@renderer/components/user-header';
import { errorLogAttributes } from '@renderer/lib/logError';
import { BreadcrumbProvider } from '@renderer/providers/BreadcrumbProvider';
import { UserProvider } from '@renderer/providers/UserProvider';

export interface RouterContext {}

// Use the routerContext to create your root route
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
  // The title lives here instead of index.html,
  // since routes can then override it via their own head option
  head: () => ({
    meta: [
      {
        title: 'elek.io Desktop',
      },
    ],
  }),
});

function ErrorComponent({ error }: ErrorComponentProps): ReactElement {
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
      <>
        Something went wrong and this screen is all we can show you. Nothing
        about it was sent to us automatically, so we only find out if you tell
        us. Reporting it takes a moment and we have already filled in what we
        know.
      </>
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
          Back to Projects
        </Button>
        <Button variant="outline" onClick={() => location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload
        </Button>
        <Button variant="default" onClick={() => setIsReportDialogOpen(true)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Report this problem
        </Button>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <Page title="Error" description={<Description />} actions={<Actions />}>
        <div className="p-6">
          <p>{message}</p>
          <ScrollArea>
            <div className="flex w-max py-6 text-xs">
              <pre>{displayStack}</pre>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </Page>

      {/*
        The crash is the moment a report is worth most and the moment the user
        is least likely to go looking for the header button, so the boundary
        opens the same dialog itself, already carrying what we know. Logs
        default to on here: they are the point of a crash report, and the user
        is looking at the failure while deciding.
      */}
      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        defaultMode="bug"
        defaultIncludeLogs
        prefill={{
          message: `What I was doing when this happened:\n\n\n---\nTechnical detail, filled in automatically:\n\n${message}\n\n${displayStack ?? 'No stack available.'}`,
        }}
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
  const router = useRouter();

  function Description(): ReactElement {
    return <>You&apos;ve tried accessing a route that could not be found.</>;
  }

  function Actions(): ReactElement {
    return (
      <>
        <Button
          variant="outline"
          onClick={async () => router.navigate({ to: '/projects' })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <Button variant="default" onClick={() => location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload
        </Button>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <Page
        title="Not Found"
        description={<Description />}
        actions={<Actions />}
      >
        <p className="p-6">
          You&apos;ve tried to access &quot;{location.href}&quot; but it does
          not exist. Use the buttons above to navigate back or try to reload the
          page.
        </p>
      </Page>
    </>
  );
}

function RootComponent(): ReactElement {
  return (
    <>
      <HeadContent />
      <UserProvider>
        <BreadcrumbProvider>
          <AppHeader />
          <UserHeader />
          <Outlet />
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
