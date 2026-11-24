// What a stored dynamic field Value looks like, how to find a section built
// from a given Component inside one, and where one section sits. It reads a
// Value's own `valueType`, which is this type's knowledge and stays in this
// folder.

/**
 * The part of a Value the walks below read: a dynamic field's items, each with
 * its own id, naming the Component it is built from and holding that
 * Component's own Values.
 *
 * Declared here rather than taken from Core's `ComponentValue`, because Core's
 * item schema is recursive and types a nested item's Values one level loose, so
 * a walk cannot follow `Value` all the way down. What is read is checked at
 * runtime instead, as the sections editor does with its own draft shape.
 */
interface SectionsValue {
  content: {
    id: string;
    componentId: string;
    values: Record<string, unknown>;
  }[];
}

function isSectionItem(
  item: unknown
): item is SectionsValue['content'][number] {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    typeof item.id === 'string' &&
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

/**
 * Where one Component item sits inside an Entry: which section it is of the
 * field that holds it, and which Component it is built from.
 *
 * Core names a Component item by its id, and ci gives an item no name of its
 * own, so a row that says which item it is about says it by its place, the way
 * the section's own head does. An item of a section inside another section is
 * found there too, counted among the items of the field it sits in.
 *
 * `null` where these Values hold no item of that id, which is an Entry that
 * changed since it was read.
 */
export function sectionPlaceOf(
  values: Record<string, unknown>,
  componentItemId: string
): { componentId: string; position: number; total: number } | null {
  for (const value of Object.values(values)) {
    if (isSectionsValue(value) === false) {
      continue;
    }
    const index = value.content.findIndex(
      (item) => item.id === componentItemId
    );
    const found = value.content[index];
    if (found !== undefined) {
      return {
        componentId: found.componentId,
        position: index + 1,
        total: value.content.length,
      };
    }
    for (const item of value.content) {
      const nested = sectionPlaceOf(item.values, componentItemId);
      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}
