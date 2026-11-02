import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { EllipsisIcon } from 'lucide-react';

import { RemoteOriginBadge } from '@renderer/components/remote-origin-badge';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
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

import type { Project } from '@elek-io/core';

function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const { coreVersion } = project;

  return (
    <Card className="hover:border-accent-foreground">
      <CardHeader>
        <Link
          to="/projects/$projectId/dashboard"
          params={{ projectId: project.id }}
          className="no-underline"
        >
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.description}</CardDescription>
        </Link>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" />}
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <Trans>My Account</Trans>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Trans>Profile</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Trans>Billing</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Trans>Team</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Trans>Subscription</Trans>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <RemoteOriginBadge
          variant="outline"
          remoteOriginUrl={project.remoteOriginUrl}
        />
        <Badge variant="outline">
          <Trans>Core version: {coreVersion}</Trans>
        </Badge>
      </CardContent>
    </Card>
  );
}

function ProjectCardSkeleton(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-6 w-3/4 rounded" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-full rounded" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-1/2 rounded" />
      </CardContent>
    </Card>
  );
}

export { ProjectCard, ProjectCardSkeleton };
