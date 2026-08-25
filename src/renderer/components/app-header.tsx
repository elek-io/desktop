import { version as desktopVersion, dependencies } from '@root/package.json';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuAddOn,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { cn } from '@renderer/lib/utils';

export function AppHeader(): React.JSX.Element {
  const [isElekInfoOpen, setIsElekInfoOpen] = useState(false);

  return (
    <header className="window-draggable-area w-full border-b bg-sidebar p-1 text-center text-sm">
      <DropdownMenu open={isElekInfoOpen} onOpenChange={setIsElekInfoOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-0">
            <h1>
              elek.<span className="text-primary">io</span>
              <strong className="ml-2 text-xs">Desktop</strong>
            </h1>
            <ChevronDown
              className={cn(
                'ml-2 h-4 w-4 transition',
                isElekInfoOpen && 'rotate-180'
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="window-not-draggable-area mt-4 mr-2 w-56">
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
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
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
    </header>
  );
}
