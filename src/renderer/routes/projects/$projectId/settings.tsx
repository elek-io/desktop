import {
  Link,
  Outlet,
  type ToPathOption,
  createFileRoute,
} from '@tanstack/react-router';
import { GitBranch, type LucideIcon, Settings } from 'lucide-react';
import type { ReactElement } from 'react';

import { Pane, Panes } from '@renderer/components/pane';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/settings')({
  component: ProjectSettingsLayout,
});

function ProjectSettingsLayout(): ReactElement {
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Settings');
  const settingsNavigation: {
    name: string;
    to: ToPathOption;
    icon: LucideIcon;
  }[] = [
    {
      name: 'General',
      to: '/projects/$projectId/settings/general',
      icon: Settings,
    },
    {
      name: 'Version Control',
      to: '/projects/$projectId/settings/version-control',
      icon: GitBranch,
    },
  ];

  return (
    <Panes>
      <Pane width="list">
        <ScrollArea>
          <SidebarHeader />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Settings</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {settingsNavigation.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        render={
                          <Link
                            to={item.to}
                            params={{
                              projectId,
                            }}
                            activeProps={{ 'data-active': true }}
                          />
                        }
                      >
                        <item.icon />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </ScrollArea>
      </Pane>
      <Pane>
        <Outlet />
      </Pane>
    </Panes>
  );
}
