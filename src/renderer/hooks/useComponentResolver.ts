import { useMemo } from 'react';

import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import type { ComponentResolver } from '@elek-io/core';

/**
 * Core's `ComponentResolver` for one Project, built from its Components.
 *
 * Generating an Entry's schema needs one as soon as the Collection holds a
 * dynamic field, because that field's Values are checked against the field
 * definitions of the Components it embeds. Core raises `Internal` when a
 * dynamic field reaches schema generation without one, so both Entry forms
 * build it here rather than each on its own.
 *
 * It answers an empty field definition list for a Component it does not hold,
 * which is only the window before the list has loaded: Core refuses to delete a
 * Component something still references. Callers gate their schema on
 * `isReadingComponents` so that window never reaches a resolved schema.
 */
export function useComponentResolver(projectId: string): {
  componentResolver: ComponentResolver;
  isReadingComponents: boolean;
} {
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));

  const componentResolver = useMemo<ComponentResolver>(() => {
    const fieldDefinitionsById = new Map(
      (componentList?.list ?? []).map((component) => [
        component.id,
        component.fieldDefinitions,
      ])
    );
    return (componentId) => fieldDefinitionsById.get(componentId) ?? [];
  }, [componentList]);

  return { componentResolver, isReadingComponents };
}
