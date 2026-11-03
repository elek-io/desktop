'use client';

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { initials } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import type { Project } from '@elek-io/core';

/**
 * The head of the Project card: the Project this window is in, and the way
 * into another one.
 *
 * It is the whole first row of the card, so its own 10 px of padding put the
 * initials on the one column the sidebar's rows, its search and its labels
 * stand on. The row carries the Project's name alone, because the card's state
 * lines below it already say what state the Project is in and which Release it
 * last published.
 */
export function ProjectSwitcher({
  project,
}: {
  project: Project;
}): React.JSX.Element {
  const { data: projects, isPending: isListingProjects } = useQueryNoError(
    queryOptions.projects.list({ limit: 5 })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-t-lg px-2.5 py-1.5 text-left hover:bg-muted aria-expanded:bg-muted">
        <ProjectInitials name={project.name} />
        <span className="truncate text-label">{project.name}</span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        align="start"
        side="right"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-small text-muted-foreground">
            <Trans>Projects</Trans>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {isListingProjects
          ? [1, 2, 3].map((key) => (
              <div className="flex items-center gap-2 p-2" key={key}>
                <Skeleton className="flex size-6 items-center justify-center rounded-md border" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            ))
          : projects.list.map((listed) => (
              <DropdownMenuItem
                key={listed.id}
                className="gap-2 p-2"
                render={
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: listed.id }}
                  />
                }
              >
                <span className="flex size-6 items-center justify-center rounded-md border text-tag">
                  {initials(listed.name)}
                </span>
                {listed.name}
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
            <Trans>View all Projects</Trans>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Project's initials, 28 px as ci draws them, on the inverted surface.
 *
 * Foreground on background rather than the brand color, which stays on the
 * primary button and the focus ring, and which no label sits on.
 */
function ProjectInitials({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-tag font-semibold text-sidebar-primary-foreground"
    >
      {initials(name)}
    </span>
  );
}

/**
 * The same head while the Project is still being read.
 */
export function ProjectSwitcherSkeleton(): React.JSX.Element {
  return (
    <div className="flex w-full items-center gap-2.5 px-2.5 py-1.5">
      <Skeleton className="size-7 shrink-0 rounded-md" />
      <Skeleton className="h-4 w-32 rounded" />
      <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
