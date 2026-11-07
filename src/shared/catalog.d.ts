/**
 * A `.po` catalog imported as a module.
 *
 * `@lingui/vite-plugin` compiles each catalog on the fly, in the main and the
 * renderer build alike, so a `.po` file is imported like any other module. See
 * contributing/renderer/internationalization.md.
 */
declare module '*.po' {
  import type { Messages } from '@lingui/core';

  export const messages: Messages;
}
