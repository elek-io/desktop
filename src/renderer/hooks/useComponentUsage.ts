import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';

import { fieldModule } from '@renderer/components/fields';
import { holdsSectionOf } from '@renderer/components/fields/dynamic/sections';
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

/**
 * The failures already written to the log file, so one of them reaches it once
 * however often this hook renders.
 *
 * A `WeakSet`, so nothing is added to the error itself and a failure is
 * forgotten with the object that carried it, as `useProjectState` keeps its
 * own.
 */
const logged = new WeakSet<Error>();

export interface ComponentUsage {
  /**
   * How many Entries hold a section built from the Component, by the
   * Component's id. Empty while the reads behind it are still running, and
   * where one of them failed.
   */
  entriesByComponent: Map<string, number>;
  /** Whether any of those reads is still running. */
  isPending: boolean;
  /**
   * What stopped the Entries from being read, or `null` while nothing did.
   *
   * A row says that it cannot tell how many Entries use the Component, rather
   * than the list saying the Components themselves could not be read.
   */
  error: Error | null;
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
 *
 * The reads of those Entries are reads this hook answers itself rather than
 * leaving them to the boundary of the pane the list sits in, because the
 * Components are readable when they fail and the list is the only way to one.
 * So it logs such a failure the way a pane's boundary logs one and hands the
 * error back for the rows to say what they cannot tell, see
 * contributing/error-handling.md. The Components and the Collections are not
 * caught here: without them there is no list and no row to say anything in,
 * and the navigation beside the pane reads the Collections above it anyway.
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

  const entryQueries = useQueries({
    queries: holders.map((collection) => ({
      ...queryOptions.entries.list({
        projectId,
        collectionId: collection.id,
        limit: 0,
      }),
      // Opted out for this read alone rather than in the query's own options,
      // since the Collection's own screens read the same query and leave a
      // failure to their pane.
      throwOnError: false,
    })),
  });

  // One failed read is enough to make every count unknown, since a Component
  // can hold a section in any Collection that embeds it.
  const error =
    entryQueries.find((query) => query.error !== null)?.error ?? null;
  const isPending =
    error === null &&
    (isReadingComponents ||
      isReadingCollections ||
      entryQueries.some((query) => query.isPending));

  // The Values of every Entry that could hold a section. `list` carries them,
  // so nothing is read twice for the count, as the list beside it is the query
  // the Collection's own screens fill from.
  const entries = entryQueries.flatMap((query) => query.data?.list ?? []);

  // The failure reaches the log file with its type, message and stack, as a
  // pane's boundary writes one. From an effect rather than the render body, so
  // a re-render does not write the same record again.
  useEffect(() => {
    if (error === null || logged.has(error)) {
      return;
    }

    logged.add(error);

    void window.ipc.core.logger.error({
      source: 'desktop',
      message: `Component usage error: ${parseIpcError(error).message}`,
      meta: errorLogAttributes(error),
    });
  }, [error]);

  return {
    entriesByComponent: new Map(
      isPending || error !== null
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
    error,
  };
}
