'use client';

import { Link, type LinkProps } from '@tanstack/react-router';
import {
  CircleFadingArrowUp,
  CircleQuestionMarkIcon,
  FileQuestion,
  PartyPopper,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Rocket,
} from 'lucide-react';

import { Skeleton } from '@renderer/components/ui/skeleton';
import { useUser } from '@renderer/hooks/useUser';

import { type GitCommit } from '@elek-io/core';

export interface CommitProps extends LinkProps {
  commit: GitCommit;
}

export function Commit({ commit, ...props }: CommitProps): React.JSX.Element {
  const { formatDatetime } = useUser();
  let iconComponent: React.JSX.Element;

  switch (commit.message.method) {
    case 'create':
      iconComponent =
        commit.message.reference.objectType === 'project' ? (
          <PartyPopper className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        );
      break;
    case 'update':
      iconComponent = <Pencil className="h-4 w-4" />;
      break;
    case 'delete':
      iconComponent = <Trash2 className="h-4 w-4" />;
      break;
    case 'upgrade':
      iconComponent = <CircleFadingArrowUp className="h-4 w-4" />;
      break;
    case 'release':
      iconComponent = <Rocket className="h-4 w-4" />;
      break;
    default:
      iconComponent = <FileQuestion className="h-4 w-4" />;
      break;
  }

  return (
    <Link activeProps={{ 'data-active': true }} {...props}>
      <div className="relative z-10 rounded-full border border-primary bg-sidebar p-2 text-sidebar-foreground">
        {commit.tag ? (
          <Tag className="absolute -right-2 -bottom-1 h-4 w-4" />
        ) : null}
        {iconComponent}
      </div>
      <div>
        <div className="flex items-center text-sm text-sidebar-foreground">
          {commit.message.method} {commit.message.reference.objectType}
        </div>
        <div className="text-xs font-medium text-sidebar-foreground/70">
          {commit.author.name} -{' '}
          {formatDatetime({ datetime: commit.datetime }).relative}
        </div>
      </div>
    </Link>
  );
}

export function CommitSkeleton(): React.JSX.Element {
  return (
    <div className="relative flex items-center space-x-4 rounded-md px-3 py-1">
      <div className="relative z-10 rounded-full border border-primary bg-card p-2">
        <CircleQuestionMarkIcon className="size-4" />
      </div>
      <div>
        <Skeleton className="mb-2 h-4 w-24 rounded" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
    </div>
  );
}
