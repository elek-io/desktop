import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Moon, Sun, ChevronDown, ExternalLinkIcon } from 'lucide-react';
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
import { queryOptions } from '@renderer/queries';

import type { User } from '@elek-io/core';

export function UserDropdown({ user }: { user: User }): React.JSX.Element {
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
      Conflict: () =>
        toast.error(`Port ${user.localApi.port} is already in use`, {
          description:
            'Choose a different port on your profile to start the local API.',
        }),
    },
  });
  const { mutateAsync: stopApi, isPending: isStoppingApi } = useMutation(
    queryOptions.api.stop
  );
  const { theme, setTheme } = useTheme();
  const localApiSwitchId = useId();
  const localApiUrl = `http://localhost:${user.localApi.port}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          />
        }
      >
        <UserAvatar className="rounded-lg" name={user.name} />
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs">{user.email}</span>
        </div>
        <ChevronDown className="ml-auto size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <UserAvatar className="rounded-lg" name={user.name} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem
          onClick={async () => router.navigate({ to: '/user/profile' })}
        >
          Profile
          <DropdownMenuAddOn>⇧⌘P</DropdownMenuAddOn>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/* A row of the menu rather than its group label, because a group
          label is hidden from assistive technology, which would take the
          switch with it. */}
          <div className="flex place-content-between px-2 py-1.5">
            <Label htmlFor={localApiSwitchId} isRequired>
              Local API
            </Label>
            <Switch
              id={localApiSwitchId}
              checked={isLocalApiRunning ?? false}
              onCheckedChange={async (checked) => {
                if (checked === false) {
                  await stopApi();
                  return;
                }
                try {
                  await startApi(user.localApi.port);
                } catch (error) {
                  handleStartApiError(error);
                }
              }}
            />
          </div>
          <DropdownMenuItem
            onClick={() => window.open(localApiUrl, '_blank')}
            disabled={
              isLocalApiRunning === false || isStartingApi || isStoppingApi
            }
          >
            Open
            <DropdownMenuAddOn>
              <ExternalLinkIcon />
            </DropdownMenuAddOn>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(theme) => setTheme(theme as Theme)}
                >
                  <DropdownMenuRadioItem value="system">
                    System
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserDropdownSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-left text-sm">
      <UserAvatarSkeleton className="rounded-lg" />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          <Skeleton className="h-4 w-12 rounded" />
        </span>
        <span className="truncate text-xs">
          <Skeleton className="h-3 w-24 rounded" />
        </span>
      </div>
      <ChevronDown className="ml-auto size-4" />
    </div>
  );
}
