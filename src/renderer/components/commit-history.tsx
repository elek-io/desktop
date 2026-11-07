'use client';

import { type HTMLAttributes } from 'react';

import { Commit, CommitSkeleton } from '@renderer/components/commit';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { cn } from '@renderer/lib/utils';

import { type GitCommit } from '@elek-io/core';

export interface CommitHistoryProps extends HTMLAttributes<HTMLDivElement> {
  commits: GitCommit[];
  projectId: string;
  disabled?: boolean;
}

export function CommitHistory({
  className,
  commits,
  projectId,
  disabled,
  ...props
}: CommitHistoryProps): React.JSX.Element {
  return (
    <SidebarMenu>
      <div className={cn('relative', className)} {...props}>
        <div className="before:absolute before:ml-6 before:h-full before:border-l-2 before:border-primary" />
        <div className="grid gap-2 py-2">
          {commits.map((commit) => (
            <SidebarMenuItem key={commit.hash}>
              <SidebarMenuButton
                className="no-underline"
                size="lg"
                render={
                  <Commit
                    commit={commit}
                    disabled={disabled === true}
                    to="/projects/$projectId/history/$commitHash"
                    params={{ projectId, commitHash: commit.hash }}
                  />
                }
              />
            </SidebarMenuItem>
          ))}
        </div>
      </div>
    </SidebarMenu>
  );
}

export function CommitHistorySkeleton(): React.JSX.Element {
  return (
    <div className="relative">
      <div className="before:absolute before:ml-7 before:h-full before:border-l-2 before:border-primary" />
      <div className="grid gap-2 py-2">
        {[1, 2, 3].map((index) => (
          <CommitSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
