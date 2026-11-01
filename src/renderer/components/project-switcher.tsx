'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import type { Project } from '@elek-io/core';

export function ProjectSwitcher({
  project,
}: {
  project: Project;
}): React.JSX.Element {
  const { data: projects, isPending: isListingProjects } = useQueryNoError(
    queryOptions.projects.list({ limit: 5 })
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {/* <project.logo className="size-4" /> */}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{project.name}</span>
              <span className="truncate text-xs">{project.version}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side="right"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Projects
            </DropdownMenuLabel>
            {isListingProjects
              ? [1, 2, 3].map((key) => (
                  <div className="flex items-center gap-2 p-2" key={key}>
                    <Skeleton className="flex size-6 items-center justify-center rounded-md border" />
                    <Skeleton className="h-4 w-24 rounded" />
                  </div>
                ))
              : projects.list.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    className="gap-2 p-2"
                    render={
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                      />
                    }
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border">
                      {/* <project.logo className="size-3.5 shrink-0" /> */}
                    </div>
                    {project.name}
                  </DropdownMenuItem>
                ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              render={<Link to="/projects" />}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <ArrowLeftIcon className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                View all Projects
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function ProjectSwitcherSkeleton(): React.JSX.Element {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="cursor-not-allowed">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground" />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mt-1 h-3 w-16 rounded" />
          </div>
          <ChevronsUpDown className="ml-auto" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
