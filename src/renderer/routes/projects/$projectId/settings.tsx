import { Trans, useLingui } from '@lingui/react/macro';
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
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Settings`);
  const settingsNavigation: {
    label: string;
    to: ToPathOption;
    icon: LucideIcon;
  }[] = [
    {
      label: t`General`,
      to: '/projects/$projectId/settings/general',
      icon: Settings,
    },
    {
      label: t`Version Control`,
      to: '/projects/$projectId/settings/version-control',
      icon: GitBranch,
    },
  ];

  return (
    <Panes>
      <Pane width="list" name={t`the Settings of this Project`}>
        <ScrollArea>
          <SidebarHeader />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>
                <Trans>Settings</Trans>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {settingsNavigation.map((item) => (
                    <SidebarMenuItem key={item.to}>
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
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </ScrollArea>
      </Pane>
      <Pane name={t`these Settings`}>
        <Outlet />
      </Pane>
    </Panes>
  );
}
