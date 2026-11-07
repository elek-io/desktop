import { Trans, useLingui } from '@lingui/react/macro';
import { appLocales, resolveAppLocale } from '@root/src/shared/locale';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import {
  Braces,
  ChevronDown,
  ExternalLinkIcon,
  Languages,
  Moon,
  Sun,
  SunMoon,
  UserRound,
} from 'lucide-react';
import { useId } from 'react';
import { toast } from 'sonner';

import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuAddOn,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Label } from '@renderer/components/ui/label';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
import {
  UserAvatar,
  UserAvatarSkeleton,
} from '@renderer/components/user-avatar';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useTheme, type Theme } from '@renderer/hooks/useTheme';
import { ownLanguageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import type { User } from '@elek-io/core';

/** What a row of the menu says it is set to, 4 px before its chevron. */
function SetTo({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="-mr-1 text-small text-muted-foreground">{children}</span>
  );
}

export function UserDropdown({ user }: { user: User }): React.JSX.Element {
  const { t } = useLingui();
  const router = useRouter();
  const { data: isLocalApiRunning } = useQueryNoError(
    queryOptions.api.isRunning()
  );
  const {
    mutateAsync: startApi,
    handleError: handleStartApiError,
    isPending: isStartingApi,
  } = useAppMutation(queryOptions.api.start, {
    handled: {
      // Something else holds the port. There is no form here to mark, so point
      // to the profile, where the port is changed.
      Conflict: () => {
        const port = user.localApi.port;
        toast.error(t`Port ${port} is already in use`, {
          description: t`Choose a different port on your profile to start the local API.`,
        });
      },
    },
  });
  const { mutateAsync: stopApi, isPending: isStoppingApi } = useMutation(
    queryOptions.api.stop
  );
  const { mutateAsync: setPreference } = useMutation(
    queryOptions.user.setPreference
  );
  const { theme, setTheme } = useTheme();
  const localApiSwitchId = useId();
  // The scheme and the host are the same in every language.
  const localApiUrl = `http://localhost:${user.localApi.port}`;
  // Which catalog answers for the User's language, since that is the language
  // the app is actually read in: a language Desktop carries no words for falls
  // back to the source locale, see shared/locale.ts.
  const locale = resolveAppLocale(user.language);
  const themeNames: Record<Theme, string> = {
    system: t`System`,
    light: t`Light`,
    dark: t`Dark`,
  };

  return (
    <DropdownMenu>
      {/* Without elek.io Cloud the trigger shows the avatar and the name, as
      ci draws it: the second line only tells elek.io Cloud apart. */}
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          />
        }
      >
        <UserAvatar size="sm" name={user.name} />
        <span className="truncate font-medium">{user.name}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      {/* 280 px with a row of 32 px each, as ci draws the menu. */}
      <DropdownMenuContent
        className="w-70 min-w-70 rounded-lg [&_[data-slot=dropdown-menu-item]]:h-8 [&_[data-slot=dropdown-menu-sub-trigger]]:h-8"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2.5 p-2 text-left text-sm">
              <UserAvatar className="rounded-lg" name={user.name} />
              <div className="grid flex-1 text-left leading-4">
                <span className="truncate text-label">{user.name}</span>
                <span className="truncate text-small text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={async () => router.navigate({ to: '/user/profile' })}
        >
          <UserRound />
          <Trans>Profile</Trans>
        </DropdownMenuItem>

        <DropdownMenuGroup>
          {/* A row of the menu rather than its group label, because a group
          label is hidden from assistive technology, which would take the
          switch with it. */}
          <div
            data-slot="dropdown-menu-row"
            className="flex h-8 items-center gap-2 px-2"
          >
            <Braces aria-hidden="true" className="size-4 shrink-0" />
            <Label htmlFor={localApiSwitchId} className="flex-1">
              <Trans>Local API</Trans>
            </Label>
            <Switch
              id={localApiSwitchId}
              checked={isLocalApiRunning ?? false}
              onCheckedChange={async (checked) => {
                if (checked === false) {
                  await stopApi();
                  await remember(false);
                  return;
                }
                try {
                  await startApi(user.localApi.port);
                } catch (error) {
                  handleStartApiError(error);
                  return;
                }
                await remember(true);
              }}
            />
          </div>
          <DropdownMenuItem
            onClick={() => window.open(localApiUrl, '_blank')}
            disabled={
              isLocalApiRunning === false || isStartingApi || isStoppingApi
            }
          >
            <Trans>Open</Trans>
            <DropdownMenuAddOn>
              <ExternalLinkIcon />
            </DropdownMenuAddOn>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          {/*
            The menu ends 12 px from the window's edge, too close for a
            submenu, so Theme and Language open theirs to the left, as their
            chevrons point, see ci's docs/desktop.md.
          */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger side="left">
              <SunMoon />
              <span className="flex-1">
                <Trans>Theme</Trans>
              </span>
              <SetTo>{themeNames[theme]}</SetTo>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent side="left">
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(theme) => setTheme(theme as Theme)}
                >
                  <DropdownMenuRadioItem value="system">
                    <Trans>System</Trans>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    <Trans>Light</Trans>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    <Trans>Dark</Trans>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/*
            The languages the app speaks, each named in its own language, so a
            person finds theirs whichever language the app is read in. It lists
            the catalogs Desktop carries rather than every language Core knows,
            since those are the languages it has words for.
          */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger side="left">
              <Languages />
              <span className="flex-1">
                <Trans>Language</Trans>
              </span>
              <SetTo>{ownLanguageName(locale)}</SetTo>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent side="left">
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={async (language) => {
                    // The radio's value is one of the catalogs Desktop
                    // carries, which `resolveAppLocale` is what narrows it to.
                    await setPreference({
                      ...user,
                      language: resolveAppLocale(language),
                    });
                  }}
                >
                  {appLocales.map((candidate) => (
                    <DropdownMenuRadioItem
                      key={candidate}
                      value={candidate}
                      lang={candidate}
                    >
                      {ownLanguageName(candidate)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /**
   * Remember whether the Local API comes back with the app.
   *
   * The switch here is the one place it is set, so it writes the preference
   * the main process reads at launch. The Profile shows the port and carries
   * this along untouched.
   */
  async function remember(isEnabled: boolean): Promise<void> {
    if (user.localApi.isEnabled === isEnabled) {
      return;
    }

    await setPreference({
      ...user,
      localApi: { ...user.localApi, isEnabled },
    });
  }
}

export function UserDropdownSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-8 items-center gap-1.5 px-2.5 text-left text-sm">
      <UserAvatarSkeleton size="sm" />
      <Skeleton className="h-4 w-20 rounded" />
      <ChevronDown className="size-3 text-muted-foreground" />
    </div>
  );
}
