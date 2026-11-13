import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';

import { fieldModule } from '@renderer/components/fields';
import { holdsSectionOf } from '@renderer/components/fields/dynamic/sections';
import { PageSection } from '@renderer/components/page-section';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  type Collection,
  type Component,
  type Entry,
  type FieldDefinition,
} from '@elek-io/core';

/**
 * Every Component a flat field definition list allows as a section.
 *
 * Which definitions embed a Component at all, and which Components one allows,
 * is each field type's own answer, so this asks their folders rather than
 * reading a field type.
 */
function allowedComponentIdsOf(
  fieldDefinitions: FieldDefinition[],
  allComponentIds: string[]
): string[] {
  return fieldDefinitions.flatMap(
    (fieldDefinition) =>
      fieldModule(fieldDefinition).allowedComponentIds?.(
        fieldDefinition,
        allComponentIds
      ) ?? []
  );
}

/**
 * Every Component that reaches `componentId`, itself included.
 *
 * Core follows a Component reference transitively when it cascades a change, so
 * a Collection that embeds a Component which embeds this one is reached too.
 * Built by walking the graph backwards until nothing new is added, which also
 * terminates on a cycle a Project written outside Desktop could hold.
 */
function componentsReaching(
  componentId: string,
  components: Component[]
): Set<string> {
  const allComponentIds = components.map((component) => component.id);
  const reaching = new Set([componentId]);
  let grew = true;

  while (grew) {
    grew = false;
    for (const component of components) {
      if (reaching.has(component.id)) {
        continue;
      }
      const allows = allowedComponentIdsOf(
        component.fieldDefinitions,
        allComponentIds
      );
      if (allows.some((id) => reaching.has(id))) {
        reaching.add(component.id);
        grew = true;
      }
    }
  }

  return reaching;
}

/** The Entries of one Collection that hold a section built from `componentIds`. */
function entriesHoldingSection(
  entries: Entry[],
  componentIds: Set<string>
): number {
  return entries.filter((entry) => holdsSectionOf(entry.values, componentIds))
    .length;
}

/**
 * What a save of this Component reaches beyond the Component itself, shown
 * before the save rather than after it.
 *
 * Core propagates a field definition change into every Entry whose Collection
 * holds a dynamic field pointing at the Component, and writes the Component
 * file and every rewritten Entry in one commit. The Collections named are the
 * ones whose model reaches the Component, and the Entries counted are the ones
 * that actually hold a section built from it, which are the ones Core rewrites.
 * A Collection that reaches the Component but holds no such Entry yet is still
 * named, with none counted, because its model changes with the Component.
 */
export function ComponentImpact({
  componentId,
}: {
  componentId: string;
}): ReactElement {
  const { t } = useLingui();
  const { projectId, translateContent } = useProject();
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  const components = isReadingComponents ? [] : componentList.list;
  const collections = isReadingCollections ? [] : collectionList.list;
  const allComponentIds = components.map((component) => component.id);
  const reaching = componentsReaching(componentId, components);

  const affectedCollections: Collection[] = collections.filter((collection) =>
    allowedComponentIdsOf(
      flattenFieldDefinitions(collection.fieldDefinitions),
      allComponentIds
    ).some((id) => reaching.has(id))
  );

  const entryQueries = useQueriesNoError(
    affectedCollections.map((collection) =>
      queryOptions.entries.list({
        projectId,
        collectionId: collection.id,
        limit: 0,
      })
    )
  );
  const isReadingEntries = entryQueries.some((query) => query.isPending);

  if (isReadingComponents || isReadingCollections || isReadingEntries) {
    return (
      <PageSection title={t`What saving changes`}>
        <Skeleton className="h-5 w-2/3 rounded" />
      </PageSection>
    );
  }

  // `total` counts the Entry files of the Collection rather than the ones this
  // save rewrites, so the Entries are counted from the Values the same read
  // already returned.
  const entryCounts = entryQueries.map((query) =>
    query.isPending ? 0 : entriesHoldingSection(query.data.list, reaching)
  );
  const entryTotal = entryCounts.reduce((total, count) => total + count, 0);
  const collectionCount = affectedCollections.length;

  if (collectionCount === 0) {
    return (
      <PageSection title={t`What saving changes`}>
        <p className="text-sm">
          <Trans>
            No Collection uses this Component yet, so saving changes nothing but
            the Component itself.
          </Trans>
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection title={t`What saving changes`}>
      <p className="text-sm">
        {t`Saving reaches ${plural(collectionCount, {
          one: '# Collection',
          other: '# Collections',
        })} and ${plural(entryTotal, {
          one: '# Entry',
          other: '# Entries',
        })}. Every Entry that holds a section built from this Component is rewritten in the same change.`}
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
        {affectedCollections.map((collection, index) => {
          const total = entryCounts[index] ?? 0;
          const name = translateContent({
            key: 'collection.name.plural',
            record: collection.name.plural,
          });
          return (
            <li key={collection.id}>
              {t`${name}, ${plural(total, {
                one: '# Entry',
                other: '# Entries',
              })}`}
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
