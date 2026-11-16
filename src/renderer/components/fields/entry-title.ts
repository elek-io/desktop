import { fieldModule } from '@renderer/components/fields';

import type { Entry, FieldDefinition, SupportedLanguage } from '@elek-io/core';

/**
 * The one way Desktop names an Entry.
 *
 * An Entry has no title of its own yet, so it is named by the first of its
 * Collection's fields that holds text, in the language the screen shows and
 * otherwise in any language that holds something. Which of a type's Values can
 * name an Entry is the type's own answer, so each is asked for it. Where
 * nothing does, the start of the Entry's id stands in, so a row, a picker and a
 * breadcrumb always say something.
 *
 * Every place that names an Entry calls this: the list of Entries, the Entry
 * and Asset pickers, the markdown editor's reference picker and the breadcrumb.
 *
 * @todo Let an editor pick which field titles an Entry.
 */
export function entryTitle({
  entry,
  fieldDefinitions,
  language,
}: {
  entry: Entry;
  /** The Collection's flattened field definitions, in their own order. */
  fieldDefinitions: FieldDefinition[];
  /** The language the screen shows, preferred over every other. */
  language: SupportedLanguage;
}): string {
  for (const fieldDefinition of fieldDefinitions) {
    const value = entry.values[fieldDefinition.slug];
    if (value === undefined) {
      continue;
    }
    const title = fieldModule(fieldDefinition).titleText({
      content: value.content,
      language,
    });
    if (title !== null && title !== '') {
      return title;
    }
  }
  return entry.id.slice(0, 8);
}
