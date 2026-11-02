import { Trans } from '@lingui/react/macro';
import type { ReactElement } from 'react';

import { CommitAuthor } from '@renderer/components/commit-author';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Skeleton } from '@renderer/components/ui/skeleton';

import { type GitCommit } from '@elek-io/core';

export interface DiffContainerProps {
  type: 'create' | 'before' | 'after' | 'delete';
  commit: GitCommit;
  children: React.ReactNode;
}

export function DiffContainer({
  type,
  commit,
  children,
}: DiffContainerProps): ReactElement {
  function title(): string {
    switch (type) {
      case 'create':
        return 'Created';
      case 'before':
        return 'Before';
      case 'after':
        return 'After';
      case 'delete':
        return 'Deleted';
    }
  }

  return (
    <Card
      className={`col-span-6 ${type === 'create' || type === 'delete' ? 'col-start-3' : ''}`}
    >
      <CardHeader>
        <CardTitle>{title()}</CardTitle>
        <CardAction>
          <CommitAuthor commit={commit} />
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6 px-0">{children}</CardContent>
    </Card>
  );
}

export function DiffContainerSkeleton({
  centered = false,
}: {
  centered?: boolean;
}): React.JSX.Element {
  return (
    <Card className={`col-span-6 ${centered ? 'col-start-3' : ''}`}>
      <CardHeader>
        <CardTitle>
          <Trans>Loading...</Trans>
        </CardTitle>
        <CardDescription />
        <CardAction />
      </CardHeader>

      <CardContent className="grid gap-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </CardContent>
    </Card>
  );
}
