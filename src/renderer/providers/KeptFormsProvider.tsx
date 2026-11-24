import { useMemo, useRef, type ReactElement, type ReactNode } from 'react';

import {
  KeptFormsContext,
  type KeptFormsContextValue,
} from '@renderer/hooks/useKeptForm';

/**
 * Holds what a page keeps for itself while the person is away on a link that
 * comes back to it.
 *
 * It sits above the route, because the page that keeps something is unmounted
 * the moment the link is followed. A ref rather than state: nothing on screen
 * reads the store, the page that comes back reads it while it renders, so a
 * write must not draw anything again.
 *
 * Nothing is persisted. A reload or a closed window has nothing kept, which is
 * what the question before closing the window is for, see
 * `UnsavedChangesProvider`.
 */
export function KeptFormsProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const kept = useRef(new Map<string, unknown>());
  const value = useMemo<KeptFormsContextValue>(
    () => ({
      keep: (key, values) => {
        kept.current.set(key, values);
      },
      peek: (key) => kept.current.get(key),
      forget: (key) => {
        kept.current.delete(key);
      },
    }),
    []
  );

  return <KeptFormsContext value={value}>{children}</KeptFormsContext>;
}
