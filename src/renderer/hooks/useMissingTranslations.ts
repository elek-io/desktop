import { useCallback, useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import {
  missingTranslations,
  type TranslatableText,
} from '@renderer/lib/missingTranslations';

import type { Project, SupportedLanguage } from '@elek-io/core';

// How many texts each language of a Collection's or a Component's settings is
// still missing, while somebody is editing it. One answer for the line below
// Save and for the switch above the page.
//
// See contributing/renderer/forms.md#saves-block.

/** How many texts one language is missing, per language. */
type MissingCounts = Map<SupportedLanguage, number>;

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
 * How many texts each language of the Project is still missing, out of what the
 * form holds right now.
 *
 * It is kept as state and set again only where a count changed, so a page of
 * many fields draws itself again when something a person can see changes
 * rather than on every keystroke, exactly as `useMissingValues` does it for an
 * Entry's Values.
 */
export function useMissingTranslations<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  textsOf,
  languages,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** The texts of this object, read off whatever the form holds. */
  textsOf: (values: unknown) => TranslatableText[];
  /**
   * The Project's languages, or `undefined` while the form is still filling
   * from its reads, when there is nothing to count yet.
   */
  languages: Project['settings']['language'] | undefined;
}): MissingCounts {
  const take = useCallback((): MissingCounts => {
    if (languages === undefined) {
      return new Map<SupportedLanguage, number>();
    }

    return missingTranslations({
      texts: textsOf(form.getValues()),
      supportedLanguages: languages.supported,
    });
  }, [form, textsOf, languages]);
  const [missing, setMissing] = useState<MissingCounts>(take);

  useEffect(() => {
    const keep = (): void => {
      const next = take();
      setMissing((previous) => (sameCounts(previous, next) ? previous : next));
    };

    // Taken here as well as on every change, because what is counted arrives
    // from a read of its own, which no change follows.
    keep();
    // `subscribe` rather than `useWatch`, because what this answers is a number
    // per language rather than the texts themselves: a page that watched them
    // would draw itself again on every keystroke.
    return form.subscribe({
      formState: { values: true },
      callback: keep,
    });
  }, [form, take]);

  return missing;
}
