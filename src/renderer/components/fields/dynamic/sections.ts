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

/** One step of the way to a Component item: a section of one field. */
export interface SectionStep {
  /** The Component the section is built from. */
  componentId: string;
  /** Which section of that field it is, counted from one. */
  position: number;
  /** How many sections the field holds. */
  total: number;
  /** The field that holds it, by its slug. */
  fieldSlug: string;
}

/**
 * The way to one Component item inside an Entry, innermost step first: the item
 * itself, then each section it sits inside, up to the field of the Collection.
 *
 * Core names a Component item by its id, and ci gives an item no name of its
 * own, so a row that says which item it is about says it by this way through
 * the Entry, each step naming what stands on that section's own head. A
 * position alone would not say it: the count is per field, so an item of a
 * nested section and a top-level one can both be the first of their field.
 *
 * `null` where these Values hold no item of that id, which is an Entry that
 * changed since it was read.
 */
export function sectionPathOf(
  values: Record<string, unknown>,
  componentItemId: string
): [SectionStep, ...SectionStep[]] | null {
  for (const [fieldSlug, value] of Object.entries(values)) {
    if (isSectionsValue(value) === false) {
      continue;
    }
    const total = value.content.length;
    const index = value.content.findIndex(
      (item) => item.id === componentItemId
    );
    const found = value.content[index];
    if (found !== undefined) {
      return [
        {
          componentId: found.componentId,
          position: index + 1,
          total,
          fieldSlug,
        },
      ];
    }
    for (const [itemIndex, item] of value.content.entries()) {
      const nested = sectionPathOf(item.values, componentItemId);
      if (nested !== null) {
        return [
          ...nested,
          {
            componentId: item.componentId,
            position: itemIndex + 1,
            total,
            fieldSlug,
          },
        ];
      }
    }
  }

  return null;
}
