import { i18n, type Messages } from '@lingui/core';

import { messages as en } from '../locales/en.po';

/**
 * Every locale elek.io Desktop carries a catalog for.
 *
 * `lingui.config.ts` lists the same codes, and `pnpm i18n:check` fails when a
 * catalog is missing or out of date. Adding a language means adding its code
 * there, extracting, translating the new `.po` file and adding it to `catalogs`
 * below. No component changes.
 */
export const appLocales = ['en'] as const;

export type AppLocale = (typeof appLocales)[number];

/**
 * The locale the source is written in, and the one every other locale falls
 * back to. `lingui compile` fills a locale's missing messages from this
 * catalog, so a missing translation shows English rather than a message id.
 */
export const sourceLocale = 'en';

const catalogs: Record<AppLocale, Messages> = { en };

/**
 * Which catalog answers for a requested language.
 *
 * The request is a language code from Core (`SupportedLanguage`, such as `de`)
 * or a system locale (such as `de-AT`), so only the primary subtag is matched,
 * case insensitively. A language Desktop carries no catalog for resolves to the
 * source locale, which is how the app stays readable in every one of Core's
 * languages while only some are translated.
 */
export function resolveAppLocale(
  requested: string | null | undefined
): AppLocale {
  if (requested === null || requested === undefined) {
    return sourceLocale;
  }

  const primarySubtag = requested.split('-')[0]?.toLowerCase();

  return appLocales.find((locale) => locale === primarySubtag) ?? sourceLocale;
}

/**
 * Loads and activates the catalog that answers for a requested language, and
 * returns the locale it resolved to.
 *
 * Synchronous on purpose. `@lingui/react`'s `I18nProvider` renders nothing
 * until a catalog is active, so the app activates the source locale before its
 * first render and re-activates once the User's language is known.
 */
export function activateAppLocale(
  requested: string | null | undefined
): AppLocale {
  const locale = resolveAppLocale(requested);

  i18n.loadAndActivate({ locale, messages: catalogs[locale] });

  return locale;
}
