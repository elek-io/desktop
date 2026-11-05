import { Trans, useLingui } from '@lingui/react/macro';
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
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Fragment } from 'react/jsx-runtime';

import { ReportDialog } from '@renderer/components/report-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@renderer/components/ui/breadcrumb';
import { Button } from '@renderer/components/ui/button';
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
 * One version row of Help: what it names, and the version itself.
 *
 * ci draws these in its small role on 24 px rows, with the version in Geist
 * Mono and without a `v` in front of it, since the number says what it is.
 */
function VersionRow({
  name,
  version,
}: {
  name: string;
  version: string | undefined;
}): ReactElement {
  return (
    <DropdownMenuItem className="h-6 py-0 text-small text-muted-foreground">
      {name}
      <DropdownMenuAddOn className="font-mono text-small tracking-normal">
        {version ?? ''}
      </DropdownMenuAddOn>
    </DropdownMenuItem>
  );
}

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
  const { t } = useLingui();
  return (
    <header className="grid flex-none grid-cols-[248px_minmax(0,1fr)_auto] grid-rows-[32px_48px]">
      <div
        className="window-draggable-area col-span-3 row-start-1"
        aria-hidden="true"
      />

      <Link
        to="/projects"
        aria-label={t`elek.io Desktop, Projects`}
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
          render={<Button variant="ghost" size="icon" Icon={CircleHelp} />}
        >
          <span className="sr-only">
            <Trans>Help</Trans>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="window-not-draggable-area w-60"
          align="end"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => window.open(DOCS_URL, '_blank')}>
              <BookOpen />
              <Trans>Docs</Trans>
              <DropdownMenuAddOn>
                <ExternalLinkIcon />
              </DropdownMenuAddOn>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)}>
              <Bug />
              <Trans>Report an issue</Trans>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {/* Each row names a product or a runtime, and neither elek.io's own
              names nor a third party's are ever translated, see ci's naming
              rules. */}
          <DropdownMenuGroup>
            <VersionRow name="elek.io Desktop" version={desktopVersion} />
            <VersionRow
              name="elek.io Core"
              version={dependencies['@elek-io/core']}
            />
            <VersionRow
              name="Electron"
              version={window.ipc.electron.process.versions['electron']}
            />
            <VersionRow
              name="Chromium"
              version={window.ipc.electron.process.versions['chrome']}
            />
            <VersionRow
              name="Node"
              version={window.ipc.electron.process.versions['node']}
            />
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
      <div className="flex flex-none">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.history.back()}
          Icon={ArrowLeft}
        >
          <span className="sr-only">
            <Trans>Go back</Trans>
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.history.forward()}
          Icon={ArrowRight}
        >
          <span className="sr-only">
            <Trans>Go forward</Trans>
          </span>
        </Button>
      </div>

      <Breadcrumb className="ml-2 min-w-0">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index, array) => {
            const isPage = array.length === index + 1;

            return (
              <Fragment key={crumb.path}>
                {/* The last crumb is the page itself, and the only one that
                gives way: ci cuts it with an ellipsis before the trail
                wraps, which it never does. */}
                <BreadcrumbItem className={isPage ? 'shrink' : undefined}>
                  {isPage ? (
                    <PageCrumb label={crumb.label} />
                  ) : (
                    <BreadcrumbLink render={<Link to={crumb.path} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {isPage ? null : <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}

/**
 * The trail's last crumb: the current page, in the text color.
 *
 * It is the one crumb that gives way, so a long title is cut with an ellipsis
 * instead of the trail wrapping into the bar below it. The text in the element
 * stays whole, so a screen reader reads the full name, and while the crumb is
 * cut it carries that name on hover too and takes the keyboard, the way a
 * blocked Save does, so somebody who tabs to it hears all of it.
 *
 * Only attributes change with the measurement, never the element, so the
 * observer below is never handed a crumb that is no longer on screen, which
 * reports no size and would say the name is not cut.
 */
function PageCrumb({ label }: { label: string }): ReactElement {
  const [isCut, setIsCut] = useState(false);
  const crumbRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = crumbRef.current;
    if (element === null) {
      return;
    }

    const measure = (): void => {
      setIsCut(element.scrollWidth > element.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [label]);

  return (
    <BreadcrumbPage
      ref={crumbRef}
      className="block truncate"
      tabIndex={isCut ? 0 : undefined}
      title={isCut ? label : undefined}
    >
      {label}
    </BreadcrumbPage>
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
