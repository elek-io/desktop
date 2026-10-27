import { type ReactElement } from 'react';

import { PageSection } from '@renderer/components/page-section';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  resolveOfComponents,
  type Collection,
  type Component,
  type DynamicFieldDefinition,
  type Entry,
  type FieldDefinition,
} from '@elek-io/core';

/** The dynamic fields of one flat field definition list. */
function dynamicFieldsOf(
  fieldDefinitions: FieldDefinition[]
): DynamicFieldDefinition[] {
  return fieldDefinitions.filter(
    (fieldDefinition): fieldDefinition is DynamicFieldDefinition =>
      fieldDefinition.fieldType === 'dynamic'
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
      const allows = dynamicFieldsOf(component.fieldDefinitions).flatMap(
        (fieldDefinition) =>
          resolveOfComponents(fieldDefinition, allComponentIds)
      );
      if (allows.some((id) => reaching.has(id))) {
        reaching.add(component.id);
        grew = true;
      }
    }
  }

  return reaching;
}

/**
 * The part of a Value the walk below reads: a dynamic field's items, each
 * naming the Component it is built from and holding that Component's own
 * Values.
 *
 * Declared here rather than taken from Core's `ComponentValue`, because Core's
 * item schema is recursive and types a nested item's Values one level loose, so
 * a walk cannot follow `Value` all the way down. What is read is checked at
 * runtime instead, as the sections editor does with its own draft shape.
 */
interface SectionsValue {
  content: { componentId: string; values: Record<string, unknown> }[];
}

function isSectionItem(
  item: unknown
): item is SectionsValue['content'][number] {
  return (
    typeof item === 'object' &&
    item !== null &&
    'componentId' in item &&
    typeof item.componentId === 'string' &&
    'values' in item &&
    typeof item.values === 'object' &&
    item.values !== null
  );
}

function isSectionsValue(value: unknown): value is SectionsValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'valueType' in value &&
    value.valueType === 'component' &&
    'content' in value &&
    Array.isArray(value.content) &&
    value.content.every(isSectionItem)
  );
}

/**
 * Whether these Values hold a section built from one of `componentIds`, at any
 * depth.
 *
 * A Component item's own Values can hold a dynamic field again, so a section
 * built from the changed Component can sit inside another one, and Core follows
 * it there too.
 */
function holdsSectionOf(
  values: Record<string, unknown>,
  componentIds: Set<string>
): boolean {
  return Object.values(values).some(
    (value) =>
      isSectionsValue(value) &&
      value.content.some(
        (item) =>
          componentIds.has(item.componentId) ||
          holdsSectionOf(item.values, componentIds)
      )
  );
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
    dynamicFieldsOf(flattenFieldDefinitions(collection.fieldDefinitions)).some(
      (fieldDefinition) =>
        resolveOfComponents(fieldDefinition, allComponentIds).some((id) =>
          reaching.has(id)
        )
    )
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
      <PageSection title="What saving changes">
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
      <PageSection title="What saving changes">
        <p className="text-sm">
          No Collection uses this Component yet, so saving changes nothing but
          the Component itself.
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection title="What saving changes">
      <p className="text-sm">
        Saving reaches {collectionCount}{' '}
        {collectionCount === 1 ? 'Collection' : 'Collections'} and {entryTotal}{' '}
        {entryTotal === 1 ? 'Entry' : 'Entries'}. Every Entry that holds a
        section built from this Component is rewritten in the same change.
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
        {affectedCollections.map((collection, index) => {
          const total = entryCounts[index] ?? 0;
          return (
            <li key={collection.id}>
              {translateContent({
                key: 'collection.name.plural',
                record: collection.name.plural,
              })}
              , {total} {total === 1 ? 'Entry' : 'Entries'}
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
