import { createContext, useContext, useEffect } from 'react';

// What a guarded AppForm shares with the one place that asks before changes
// nobody saved are lost. It is a hook module of its own rather than part of
// app-form.tsx, which exports components only.
//
// See contributing/renderer/forms.md.

/** The question to put on screen, and what each answer does. */
export interface DiscardQuestion {
  /** The page the changes belong to, as its own title names it. */
  title: string;
  /** Keeps the page and what was typed on it. */
  onKeepEditing: () => void;
  /** Lets go of what was typed and carries on with what was interrupted. */
  onDiscard: () => void;
}

export interface UnsavedChangesContextValue {
  /**
   * Declares that a form holds changes nobody saved, and returns the matching
   * withdrawal. A form registers only while it is dirty, so what is registered
   * is what would be lost.
   */
  register: (id: string, title: string) => () => void;
  /** Puts the question on screen. */
  ask: (question: DiscardQuestion) => void;
}

export const UnsavedChangesContext =
  createContext<UnsavedChangesContextValue | null>(null);

/**
 * The one place that asks before changes nobody saved are lost, or null outside
 * its provider, which the error screen and the not-found screen are.
 */
export function useUnsavedChanges(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext);
}

/**
 * Declares that this form holds changes nobody saved, for as long as it does.
 *
 * `title` is `undefined` for a form that asks nothing, which is every form but
 * a page form that opts in, and `isDirty` is what makes the declaration true.
 * Outside the provider it does nothing.
 */
export function useUnsavedChangesClaim(
  id: string,
  title: string | undefined,
  isDirty: boolean
): void {
  const register = useUnsavedChanges()?.register;

  useEffect(() => {
    if (register === undefined || title === undefined || isDirty === false) {
      return;
    }
    return register(id, title);
  }, [register, id, title, isDirty]);
}
