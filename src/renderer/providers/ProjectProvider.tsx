import React from 'react';

import { ProjectContext } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useUser } from '@renderer/hooks/useUser';
import {
  translateContent as translateContentInLanguages,
  type TranslateContentProps,
} from '@renderer/lib/translateContent';
import queryOptions from '@renderer/queries/options';

export function ProjectProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { userQuery, formatDatetime, formatInUserLocale } = useUser();
  const projectQuery = useQueryNoError(
    queryOptions.projects.read({ id: projectId })
  );

  /**
   * Returns given TranslatableString in the language of the current user
   *
   * Used to translate user defined content of Collections and Entries.
   *
   * The fallback chain itself lives in `lib/translateContent.ts`, which the
   * query layer's toasts read too, so a toast cannot name an object
   * differently from the screen it was changed on. This binds it to the two
   * languages the providers hold, and a query that has not answered yet leaves
   * its language out.
   */
  const translateContent = React.useCallback(
    (props: TranslateContentProps) =>
      translateContentInLanguages({
        ...props,
        userLanguage:
          userQuery.isPending === false && userQuery.data !== null
            ? userQuery.data.language
            : undefined,
        projectDefaultLanguage:
          projectQuery.isPending === false
            ? projectQuery.data.settings.language.default
            : undefined,
      }),
    [userQuery, projectQuery]
  );

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        userQuery,
        projectQuery,
        formatDatetime,
        formatInUserLocale,
        translateContent,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
