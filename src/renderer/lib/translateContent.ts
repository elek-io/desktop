import type { SupportedLanguage } from '@elek-io/core';

export interface TranslateContentProps {
  key: string;
  // This mirrors the shape of Core's partialTranslatableStringSchema and also accepts the nullable per-language
  // content of Value types (string | null), which is treated as missing below.
  record: Partial<Record<SupportedLanguage, string | null>>;
}

/** The languages a record is read in, ahead of English. */
export interface ContentLanguages {
  /** The language on the current User's profile, while one is known. */
  userLanguage: SupportedLanguage | undefined;
  /** The default language of the Project the content belongs to, while it is known. */
  projectDefaultLanguage: SupportedLanguage | undefined;
}

/**
 * Reads user defined content, stored per language, in one language.
 *
 * The fallback chain is the User's language, the Project's default language,
 * `en`, then the `key` itself as a visible placeholder. A language that is not
 * known yet, because the query behind it has not answered, is skipped rather
 * than ending the chain.
 *
 * This is the one place that order lives, so everything that names the same
 * object names it the same way: a screen through `ProjectProvider`'s
 * `translateContent`, and a mutation's toast through
 * `queries/translateContentFromCache.ts`. See
 * contributing/renderer/internationalization.md.
 */
export function translateContent({
  key,
  record,
  userLanguage,
  projectDefaultLanguage,
}: TranslateContentProps & ContentLanguages): string {
  for (const language of [
    userLanguage,
    projectDefaultLanguage,
    'en' as const,
  ]) {
    if (language === undefined) {
      continue;
    }

    const content = record[language];
    if (content !== undefined && content !== null) {
      return content;
    }
  }

  return key;
}
