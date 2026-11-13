'use client';

import type { ReactElement } from 'react';

import { UserAvatar } from '@renderer/components/user-avatar';
import { useProject } from '@renderer/hooks/useProject';

import { type GitCommit } from '@elek-io/core';

export interface CommitAuthorProps {
  commit: GitCommit;
}

export function CommitAuthor({ commit }: CommitAuthorProps): ReactElement {
  const { formatDatetime } = useProject();
  return (
    <div className="inline-flex items-center justify-center text-foreground">
      <UserAvatar name={commit.author.name} className="mr-2" />
      <div>
        <div className="flex items-center text-sm">
          {commit.message.method} {commit.message.reference.objectType}
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          {commit.author.name} -{' '}
          {formatDatetime({ datetime: commit.datetime }).relative}
        </div>
      </div>
    </div>
  );
}
