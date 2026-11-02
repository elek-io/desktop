import { createContext, useContext, useEffect } from 'react';

// What an AppForm shares with everything rendered inside it. It is a hook
// module of its own rather than part of app-form.tsx, which exports components
// only. See contributing/renderer/forms.md.

export interface AppFormContextValue {
  /** The form's id, which a detached SubmitButton associates with. */
  id: string;
  /**
   * 'view' renders the form read-only. The disabled fieldset covers native
   * controls, so a leaf that is not one (a contenteditable) reads this instead.
   */
  mode: 'edit' | 'view';
  /**
   * The Core schema the form checks against, which every field inside reads
   * its own rules off. `undefined` where the form passes none, as a form of
   * generated fields does.
   */
  schema?: unknown;
  /**
   * Registers a path whose validation errors are visible on screen and returns
   * the matching unregister. AppForm uses it to tell an error that has a message
   * from one that would otherwise make Save a silent no-op.
   */
  registerErrorTarget: (name: string) => () => void;
}

export const AppFormContext = createContext<AppFormContextValue | null>(null);

/** The enclosing AppForm's id, or null outside one. */
export function useAppFormId(): string | null {
  return useContext(AppFormContext)?.id ?? null;
}

/**
 * The enclosing AppForm's mode, defaulting to 'edit' outside one. A leaf the
 * view-only fieldset cannot turn off reads this and disables itself.
 */
export function useAppFormMode(): 'edit' | 'view' {
  return useContext(AppFormContext)?.mode ?? 'edit';
}

/**
 * The Core schema the enclosing AppForm checks against, or `undefined` outside
 * one and where the form passes none.
 *
 * A field reads the rules it shows off it, so Desktop never writes out a limit
 * Core already sets, see `lib/fieldRules.ts`.
 */
export function useAppFormSchema(): unknown {
  return useContext(AppFormContext)?.schema;
}

/**
 * Declares that this component renders the validation messages for `name` (and
 * everything below it) for as long as it is mounted. Outside an AppForm it does
 * nothing.
 */
export function useErrorTarget(name: string): void {
  const registerErrorTarget = useContext(AppFormContext)?.registerErrorTarget;

  useEffect(() => {
    return registerErrorTarget?.(name);
  }, [registerErrorTarget, name]);
}
