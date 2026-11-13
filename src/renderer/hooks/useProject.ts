import { createContext, useContext } from 'react';

import type { UseQueryResultNoError } from '@renderer/hooks/useQueryNoError';
import type { UserContextValue } from '@renderer/hooks/useUser';
import { type TranslateContentProps } from '@renderer/lib/translateContent';

import type { Project } from '@elek-io/core';

export type ProjectContextValue = UserContextValue & {
  projectId: string;
  projectQuery: UseQueryResultNoError<Project>;
  translateContent: (props: TranslateContentProps) => string;
};

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);

  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }

  return context;
}
