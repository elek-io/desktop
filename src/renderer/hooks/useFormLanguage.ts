import { createContext, useContext } from 'react';

import type { SupportedLanguage } from '@elek-io/core';

// The one language a form edits, which the switch above its fields sets for
// every field at once. It is a hook module of its own rather than part of a
// component file, so a component file exports components only.
//
// See contributing/renderer/internationalization.md#one-language-at-a-time.

export interface FormLanguageValue {
  /** The language every translatable field of the form is bound to. */
  language: SupportedLanguage;
  /**
   * The Project's default language, which a Value missing in the language on
   * screen is read from, so somebody has what they are translating in front of
   * them.
   */
  defaultLanguage: SupportedLanguage;
}

export const FormLanguageContext = createContext<FormLanguageValue | null>(
  null
);

/**
 * The language the enclosing form edits.
 *
 * A generated field reads it rather than taking it as a prop, so one switch
 * takes a whole page into another language and no field opens a dialog of its
 * own. Every form that draws generated fields provides it, which is why a field
 * outside one is a programming error rather than a case with a default.
 */
export function useFormLanguage(): FormLanguageValue {
  const value = useContext(FormLanguageContext);

  if (value === null) {
    throw new Error(
      'A generated field needs the language of the form around it. Render it inside EntryForm, which provides it.'
    );
  }

  return value;
}
