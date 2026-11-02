import { i18n, type Messages } from '@lingui/core';

import { messages as en } from '../locales/en.po';
import { resolveAppLocale, type AppLocale } from './locale.js';

/**
 * The catalogs the app carries, one per locale of
 * [`locale.ts`](./locale.ts)'s `appLocales`.
 *
 * Imported statically rather than loaded on demand, so a catalog is active
 * before the first render: `@lingui/react`'s `I18nProvider` renders nothing
 * until one is.
 */
const catalogs: Record<AppLocale, Messages> = { en };

/**
 * Loads and activates the catalog that answers for a requested language, and
 * returns the locale it resolved to.
 *
 * Synchronous on purpose, for the reason above. The app activates the source
 * locale before its first render and re-activates once the User's language is
 * known, see `UserProvider`.
 */
export function activateAppLocale(
  requested: string | null | undefined
): AppLocale {
  const locale = resolveAppLocale(requested);

  i18n.loadAndActivate({ locale, messages: catalogs[locale] });

  return locale;
}
