import { Link } from '@tanstack/react-router';
import { PlusIcon, LayersIcon } from 'lucide-react';
import React from 'react';

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';

import type { Collection, PaginatedList } from '@elek-io/core';

export function CollectionsSidebar({
  projectId,
  collections,
}: {
  projectId: string;
  collections: PaginatedList<Collection>;
}): React.JSX.Element {
  const { translateContent } = useProject();

  return (
    <aside className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <Link
                    to="/projects/$projectId/collections/create"
                    params={{ projectId }}
                    activeProps={{ 'data-active': true }}
                  />
                }
              >
                <PlusIcon />
                <span>Create Collection</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {collections.list.map((collection) => (
                <SidebarMenuItem key={collection.id}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to="/projects/$projectId/collections/$collectionId"
                        params={{ projectId, collectionId: collection.id }}
                        activeProps={{ 'data-active': true }}
                      />
                    }
                  >
                    <LayersIcon />
                    <span>
                      {translateContent({
                        key: 'collection.name.plural',
                        record: collection.name.plural,
                      })}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {collections.total === 0 && (
                <p className="px-3 text-sm">No Collections found</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </aside>
  );
}

export function CollectionsSidebarSkeleton({
  projectId,
}: {
  projectId: string;
}): React.JSX.Element {
  return (
    <aside className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <Link
                    to="/projects/$projectId/collections/create"
                    params={{ projectId }}
                    activeProps={{ 'data-active': true }}
                  />
                }
              >
                <PlusIcon />
                <span>Create Collection</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[1, 2, 3, 4, 5].map((index) => (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton render={<div />}>
                    <LayersIcon />
                    <Skeleton className="h-4 w-2/3" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </aside>
  );
}
