import { useCallback, useEffect, useState } from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

import {
  missingRequiredValues,
  missingResolutionValues,
  type NeededValue,
} from '@renderer/components/fields/missing-values';

import type {
  FieldDefinition,
  Project,
  SupportedLanguage,
} from '@elek-io/core';

// How many required Values each language of a form is still missing, while
// somebody is editing it. One answer for the line below Save and for the switch
// above the fields, beside the mark each field puts on itself.
//
// See contributing/renderer/forms.md#saves-block.

/** How many required Values one language is missing, per language. */
type MissingCounts = Map<SupportedLanguage, number>;

export interface MissingValuesOfFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** The path the Entry's Values sit at, keyed by their field's slug. */
  name: FieldPath<TFieldValues>;
  /** The Collection's flattened field definitions. */
  fieldDefinitions: FieldDefinition[];
  /**
   * The Project's languages, or `undefined` while the form is still filling
   * from its reads, when there is nothing to count yet.
   */
  languages: Project['settings']['language'] | undefined;
  /**
   * The field definitions of the Component a section is built from, so the
   * Values inside a dynamic field's sections are counted too. Left out while
   * the Project's Components are still being read.
   */
  componentFieldDefinitions?: (componentId: string) => FieldDefinition[];
}

/** Whether two answers say the same thing, so the screen keeps the one it has. */
function sameCounts(one: MissingCounts, other: MissingCounts): boolean {
  if (one.size !== other.size) {
    return false;
  }
  for (const [language, count] of one) {
    if (other.get(language) !== count) {
      return false;
    }
  }
  return true;
}

/**
 * How many required Values each language of the Project is still missing, out
 * of the Values the form holds right now.
 *
 * It is `missingRequiredValues`, kept as state through `useCountWhileEditing`,
 * which is where the cost of answering it on every keystroke is explained.
 */
export function useMissingValues<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  fieldDefinitions,
  languages,
  componentFieldDefinitions,
}: MissingValuesOfFormProps<TFieldValues, TTransformedValues>): MissingCounts {
  const take = useCallback((): MissingCounts => {
    if (languages === undefined) {
      return new Map<SupportedLanguage, number>();
    }

    return missingRequiredValues({
      values: form.getValues(name),
      fieldDefinitions,
      supportedLanguages: languages.supported,
      defaultLanguage: languages.default,
      ...(componentFieldDefinitions === undefined
        ? {}
        : { componentFieldDefinitions }),
    });
  }, [form, name, fieldDefinitions, languages, componentFieldDefinitions]);

  return useCountWhileEditing(form, name, take);
}

export interface MissingResolutionsProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** The path the Values sit at, keyed by Entry and then by the field's slug. */
  name: FieldPath<TFieldValues>;
  /** The Values the refused change needs, each with the field it is written under. */
  needed: NeededValue[];
  /** The Project's languages, or `undefined` while there is nothing to count. */
  languages: Project['settings']['language'] | undefined;
}

/**
 * How many of the Values a refused field definition change needs are still
 * missing, per language of the Project, out of what its dialog holds right now.
 *
 * The same as above for the dialog of a refused change, whose Values sit per
 * Entry rather than per field, see `missingResolutionValues`.
 */
export function useMissingResolutions<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  needed,
  languages,
}: MissingResolutionsProps<TFieldValues, TTransformedValues>): MissingCounts {
  const take = useCallback((): MissingCounts => {
    if (languages === undefined) {
      return new Map<SupportedLanguage, number>();
    }

    return missingResolutionValues({
      values: form.getValues(name),
      needed,
      supportedLanguages: languages.supported,
      defaultLanguage: languages.default,
    });
  }, [form, name, needed, languages]);

  return useCountWhileEditing(form, name, take);
}

/**
 * The count as state, taken again on every change below `name` and whenever
 * what it is counted against changes.
 *
 * It is set again only where a number changed, so a page of hundreds of fields
 * draws itself again when something a person can see changes rather than on
 * every keystroke. Reading the Values with `useWatch` instead hands the page
 * every edit, which drew every field of an Entry again per keystroke.
 *
 * The second half is why it subscribes rather than using `useWatch`'s
 * `compute`, which recomputes only when a Value changes, never when the field
 * definitions and the Components a section is built from land from reads of
 * their own, which no edit follows.
 */
function useCountWhileEditing<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>(
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>,
  name: FieldPath<TFieldValues>,
  take: () => MissingCounts
): MissingCounts {
  // Counted for the first screen as well, rather than from the effect alone, so
  // the line under Save and the marks on the switch stand in the same frame the
  // fields do.
  const [missing, setMissing] = useState<MissingCounts>(take);

  useEffect(() => {
    const keep = (): void => {
      const next = take();
      setMissing((previous) => (sameCounts(previous, next) ? previous : next));
    };

    // Taken here as well as on every change, because what the Values are
    // counted against lands from a read of its own, which no change follows.
    keep();
    return form.subscribe({
      name,
      formState: { values: true },
      callback: keep,
    });
  }, [form, name, take]);

  return missing;
}
