import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

/**
 * Where the message catalogs live and which locales they cover.
 *
 * `sourceLocale` is what the code is written in, so an English message needs no
 * translation of its own: `lingui compile` fills a locale's missing messages
 * from the source catalog, which is why a missing translation shows English
 * rather than a message id.
 *
 * Adding a language means adding its code here, running `pnpm i18n:extract` and
 * translating the new `.po` file. No component changes, see
 * contributing/renderer/internationalization.md.
 */
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}',
      include: ['<rootDir>/src'],
    },
  ],
  // Line numbers would churn the catalog on every edit above a message, so the
  // reference comments name the file alone.
  format: formatter({ lineNumbers: false }),
});
