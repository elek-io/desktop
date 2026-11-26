import { createContext, useContext } from 'react';

import type { UseQueryResultNoError } from '@renderer/hooks/useQueryNoError';
import { type FormatDatetimeProps } from '@renderer/providers/UserProvider';

import { type User } from '@elek-io/core';

export type UserContextValue = {
  userQuery: UseQueryResultNoError<User | null>;
  formatDatetime: (props: FormatDatetimeProps) => {
    relative: string;
    absolute: string;
  };
  formatInUserLocale: (date: Date, pattern: string) => string;
  formatRelativeShort: (datetime: number | string | Date) => string | null;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }

  return context;
}
