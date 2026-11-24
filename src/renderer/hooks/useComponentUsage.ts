import { fieldModule } from '@renderer/components/fields';
import { holdsSectionOf } from '@renderer/components/fields/dynamic/sections';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { flattenFieldDefinitions, type FieldDefinition } from '@elek-io/core';

/**
 * Whether a flat field definition list embeds any Component as a section.
 *
 * Which definitions embed a Component at all, and which Components one allows,
 * is each field type's own answer, so this asks their folders rather than
 * reading a field type.
 */
function embedsAnyComponent(
  fieldDefinitions: FieldDefinition[],
  allComponentIds: string[]
): boolean {
  return fieldDefinitions.some(
    (fieldDefinition) =>
      (
        fieldModule(fieldDefinition).allowedComponentIds?.(
          fieldDefinition,
          allComponentIds
        ) ?? []
      ).length > 0
  );
}

export interface ComponentUsage {
  /**
   * How many Entries hold a section built from the Component, by the
   * Component's id. Empty while the reads behind it are still running.
   */
  entriesByComponent: Map<string, number>;
  /** Whether any of those reads is still running. */
  isPending: boolean;
}

/**
 * How many Entries use each Component of the Project, which is what the list
 * of Components says about every row.
 *
 * An Entry uses a Component when it holds a section built from it, at any
 * depth: a section built from one Component can hold a section built from
 * another, and that Entry holds both. Only a Collection whose fields embed a
 * Component at all can hold such a section, so the Entries of the others are
 * never read for this.
 */
export function useComponentUsage(projectId: string): ComponentUsage {
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  const components = isReadingComponents ? [] : componentList.list;
  const collections = isReadingCollections ? [] : collectionList.list;
  const allComponentIds = components.map((component) => component.id);
  const holders = collections.filter((collection) =>
    embedsAnyComponent(
      flattenFieldDefinitions(collection.fieldDefinitions),
      allComponentIds
    )
  );

  const entryQueries = useQueriesNoError(
    holders.map((collection) =>
      queryOptions.entries.list({
        projectId,
        collectionId: collection.id,
        limit: 0,
      })
    )
  );
  const isPending =
    isReadingComponents ||
    isReadingCollections ||
    entryQueries.some((query) => query.isPending);

  // The Values of every Entry that could hold a section. `list` carries them,
  // so nothing is read twice for the count, as the list beside it is the query
  // the Collection's own screens fill from.
  const entries = entryQueries.flatMap((query) =>
    query.isPending ? [] : query.data.list
  );

  return {
    entriesByComponent: new Map(
      isPending
        ? []
        : components.map((component) => {
            const of = new Set([component.id]);

            return [
              component.id,
              entries.filter((entry) => holdsSectionOf(entry.values, of))
                .length,
            ];
          })
    ),
    isPending,
  };
}
