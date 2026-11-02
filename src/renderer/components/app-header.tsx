import { version as desktopVersion, dependencies } from '@root/package.json';
import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  CircleHelp,
  ExternalLinkIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';

import { ReportDialog } from '@renderer/components/report-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@renderer/components/ui/breadcrumb';
import { Button } from '@renderer/components/ui/button';
import { ButtonGroup } from '@renderer/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuAddOn,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  UserDropdown,
  UserDropdownSkeleton,
} from '@renderer/components/user-dropdown';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useUser } from '@renderer/hooks/useUser';

import lockupDark from '@elek-io/branding/logo/lockup-desktop-16-dark.svg';
import lockupLight from '@elek-io/branding/logo/lockup-desktop-16-light.svg';

/**
 * Where Help opens the documentation.
 *
 * It has to stay inside the hostnames the main process allows a window to
 * open, see `allowedHostnamesToLoadExternal` in `src/main/index.ts`. The
 * language is in the path until the app's own language picks it.
 */
const DOCS_URL = 'https://elek.io/en/documentation';

/**
 * The window's header, in two bars on the ground.
 *
 * The first bar is 32 px and holds only what the system draws there: the
 * traffic lights at the top left on macOS and the window controls at the top
 * right on Windows and Linux, both inside the title bar overlay the main
 * process sets up. The whole bar moves the window, and nothing of the app goes
 * into it, so the header below it looks the same on every system and a window
 * menu has room later.
 *
 * The second bar is 48 px: the header lockup 23 px in, which leads to the
 * Projects page, then what the main panel navigates with, and Help and the user
 * on the right.
 *
 * `trail` and `user` are slots rather than parts of this component, because the
 * root error screen renders the header outside `UserProvider` and
 * `BreadcrumbProvider` and so can pass neither.
 */
export function AppHeader({
  trail,
  user,
}: {
  trail?: ReactNode;
  user?: ReactNode;
}): ReactElement {
  return (
    <header className="grid flex-none grid-cols-[248px_minmax(0,1fr)_auto] grid-rows-[32px_48px]">
      <div
        className="window-draggable-area col-span-3 row-start-1"
        aria-hidden="true"
      />

      <Link
        to="/projects"
        aria-label="elek.io Desktop, Projects"
        className="col-start-1 row-start-2 ml-[23px] self-center justify-self-start no-underline"
      >
        {/*
          The header lockup, whose ring of 16 px starts 23 px in, the column
          ci draws the sidebar's icons on. Each file is drawn for exactly 24 px,
          so neither is scaled, and the theme decides which of the two is
          shown.
        */}
        <img src={lockupLight} alt="" className="h-6 w-auto dark:hidden" />
        <img src={lockupDark} alt="" className="hidden h-6 w-auto dark:block" />
      </Link>

      <div className="col-start-2 row-start-2 flex min-w-0 items-center pl-2">
        {trail}
      </div>

      {/* The user menu ends 12 px from the window's edge, and the bar above
          this one reaches the edge, so the window controls have all of it. */}
      <div className="col-start-3 row-start-2 flex items-center gap-1 pr-3">
        <HelpMenu />
        {user}
      </div>
    </header>
  );
}

/**
 * Help: the documentation, Report an issue, and the versions of Desktop, Core
 * and the runtime underneath, which the app bar held before.
 *
 * The documentation opens in the browser, through the main process's window
 * open handler. Report an issue opens the dialog in the app, which is the only
 * thing that sends anything to elek.io, and only because somebody wrote it and
 * pressed send, see contributing/error-handling.md.
 */
function HelpMenu(): ReactElement {
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" Icon={CircleHelp} />}
        >
          <span className="sr-only">Help</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="window-not-draggable-area w-60"
          align="end"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => window.open(DOCS_URL, '_blank')}>
              <BookOpen />
              Docs
              <DropdownMenuAddOn>
                <ExternalLinkIcon />
              </DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)}>
              <Bug />
              Report an issue
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              elek.io Desktop
              <DropdownMenuAddOn>v{desktopVersion}</DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem>
              elek.io Core
              <DropdownMenuAddOn>
                v{dependencies['@elek-io/core']}
              </DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Electron
              <DropdownMenuAddOn>
                v{window.ipc.electron.process.versions['electron']}
              </DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Chromium
              <DropdownMenuAddOn>
                v{window.ipc.electron.process.versions['chrome']}
              </DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Node
              <DropdownMenuAddOn>
                v{window.ipc.electron.process.versions['node']}
              </DropdownMenuAddOn>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
      />
    </>
  );
}

/**
 * What the main panel navigates with: back and forward, then the breadcrumb.
 *
 * It keeps the same place on every screen, also where there is no sidebar, so
 * the back icon sits on the main panel's text edge.
 */
export function HeaderTrail(): ReactElement {
  const router = useRouter();
  const { breadcrumbs } = useBreadcrumb();

  return (
    <>
      <ButtonGroup className="flex-none">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.back()}
          Icon={ArrowLeft}
        >
          <span className="sr-only">Go back</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.forward()}
          Icon={ArrowRight}
        >
          <span className="sr-only">Go forward</span>
        </Button>
      </ButtonGroup>

      <Breadcrumb className="ml-2 min-w-0">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index, array) => (
            <Fragment key={crumb.path}>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to={crumb.path} />}>
                  {crumb.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {array.length !== index + 1 && <BreadcrumbSeparator />}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}

/**
 * Who is working, on the right of the header.
 *
 * On the first start no User exists yet, so the header has no user, which is
 * why this renders nothing rather than a placeholder.
 */
export function HeaderUser(): ReactElement | null {
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();

  if (isGettingUser) {
    return <UserDropdownSkeleton />;
  }

  if (user === null) {
    return null;
  }

  return <UserDropdown user={user} />;
}
