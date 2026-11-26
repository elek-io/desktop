import type { QueryClient } from '@tanstack/react-query';

import {
  translateContent,
  type TranslateContentProps,
} from '@renderer/lib/translateContent';

import { projectOptions } from './options/projectOptions';
import { userOptions } from './options/userOptions';

/**
 * Reads user defined content in one language from outside the React tree.
 *
 * A screen hands `translateContent` the two languages it needs from
 * `useProject()`. A mutation's toast is built outside the tree, so it takes
 * both out of the query cache, under the same keys the providers read them
 * from. A query that has not answered leaves its language out of the chain,
 * exactly as a pending query does on a screen.
 *
 * This is how a toast names a Collection or a Component: by the same words
 * every screen names it by, rather than through a second chain of its own. See
 * contributing/renderer/internationalization.md.
 */
export function translateContentFromCache(
  client: QueryClient,
  projectId: string,
  props: TranslateContentProps
): string {
  const user = client.getQueryData(userOptions.get().queryKey);
  const project = client.getQueryData(
    projectOptions.read({ id: projectId }).queryKey
  );

  return translateContent({
    ...props,
    userLanguage: user?.language,
    projectDefaultLanguage: project?.settings.language.default,
  });
}
