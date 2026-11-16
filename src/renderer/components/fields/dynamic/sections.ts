// What a stored dynamic field Value looks like, and how to find a section built
// from a given Component inside one. It reads a Value's own `valueType`, which
// is this type's knowledge and stays in this folder.

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
export function holdsSectionOf(
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
