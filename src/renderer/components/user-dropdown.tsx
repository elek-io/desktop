import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Moon, Sun, ChevronDown, ExternalLinkIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarSkeleton } from '@renderer/components/ui/avatar';
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
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
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
  const localApiUrl = `http://localhost:${user.localApi.port}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg" name={user.name} />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
          <ChevronDown className="ml-auto size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg" name={user.name} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={async () => router.navigate({ to: '/user/profile' })}
        >
          Profile
          <DropdownMenuAddOn>⇧⌘P</DropdownMenuAddOn>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex place-content-between">
              <div className="">Local API</div>
              <div className="">
                <Switch
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
            </div>
          </DropdownMenuLabel>
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
      <AvatarSkeleton className="h-8 w-8 rounded-lg" />
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
