import { z } from 'zod';

import { supportedLanguageSchema, type SupportedLanguage } from '@elek-io/core';

// The language an Entry is edited in, which lives in the route's search params
// rather than in the screen's state, so coming back to an Entry opens the
// language that was left open and a link can name one.
//
// See contributing/renderer/internationalization.md#one-language-at-a-time.

/**
 * What the Entry routes accept in their address.
 *
 * A code Core does not support falls back to nothing rather than failing the
 * route, so a hand-written address only ever opens the default language
 * instead of taking the screen to the error screen.
 */
export const entryLanguageSearchSchema = z.object({
  language: supportedLanguageSchema.optional().catch(undefined),
});

export type EntryLanguageSearch = z.infer<typeof entryLanguageSearchSchema>;

/**
 * The language to edit in: the one in the address while the Project supports
 * it, and the Project's default otherwise.
 *
 * A Project that has dropped a language leaves an address naming it, which is
 * why the address is checked against the Project rather than trusted.
 */
export function entryLanguage({
  search,
  supportedLanguages,
  defaultLanguage,
}: {
  search: EntryLanguageSearch;
  supportedLanguages: SupportedLanguage[];
  /** The Project's default language, or `undefined` while it is being read. */
  defaultLanguage: SupportedLanguage | undefined;
}): SupportedLanguage {
  const { language } = search;

  if (language !== undefined && supportedLanguages.includes(language)) {
    return language;
  }

  // Every Project holds at least one language, which Core refuses to save
  // without, so the fallback only stands while the Project is being read.
  return defaultLanguage ?? supportedLanguages[0] ?? 'en';
}
