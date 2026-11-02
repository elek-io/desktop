import React from 'react';

import { ProjectContext } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useUser } from '@renderer/hooks/useUser';
import queryOptions from '@renderer/queries/options';

import type { SupportedLanguage } from '@elek-io/core';

export interface TranslateContentProps {
  key: string;
  // This mirrors the shape of Core's partialTranslatableStringSchema and also accepts the nullable per-language
  // content of Value types (string | null), which is treated as missing below.
  record: Partial<Record<SupportedLanguage, string | null>>;
}

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
   * If the current users translation is not available,
   * it shows it in the default language of the project.
   * If this is not available either, show the 'en' value.
   * If this is also not available, show the key instead along with a note,
   * that a translation should be added.
   */
  const translateContent = React.useCallback(
    ({ key, record }: TranslateContentProps) => {
      if (userQuery.isPending === false && userQuery.data !== null) {
        const toUserLanguage = record[userQuery.data.language];
        if (toUserLanguage !== undefined && toUserLanguage !== null) {
          return toUserLanguage;
        }
      }

      if (projectQuery.isPending === false) {
        const toProjectsDefaultLanguage =
          record[projectQuery.data.settings.language.default];
        if (
          toProjectsDefaultLanguage !== undefined &&
          toProjectsDefaultLanguage !== null
        ) {
          return toProjectsDefaultLanguage;
        }
      }

      const toEnglish = record['en'];
      if (toEnglish !== undefined && toEnglish !== null) {
        return toEnglish;
      }

      return key;
    },
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
