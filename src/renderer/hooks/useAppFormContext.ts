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
   * Whether the form's own save is running, which holds every field it draws
   * read-only until it is through. See
   * contributing/renderer/forms.md#a-form-is-read-only-while-it-saves.
   */
  isSaving: boolean;
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
  /**
   * Whether an error at `path` is rendered by an error target mounted below
   * `name`. A field reads it to leave a message to the field inside it, see
   * `lib/formErrors.ts`.
   */
  hasDeeperErrorTarget: (path: string, name: string) => boolean;
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
 * Whether the enclosing AppForm's own save is running, and `false` outside one.
 *
 * A field reads it to hold itself read-only, so an edit typed while the save is
 * on its way cannot be dropped by the state the save brings back.
 */
export function useAppFormIsSaving(): boolean {
  return useContext(AppFormContext)?.isSaving ?? false;
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

/** Stable, so a field outside an AppForm does not re-render on every parent. */
const NOTHING_DEEPER = (): boolean => false;

/**
 * Whether an error at a path is rendered by something mounted below a field, so
 * that field leaves the message to it. Outside an AppForm nothing is claimed,
 * so a field shows what it holds.
 */
export function useDeeperErrorTarget(): (
  path: string,
  name: string
) => boolean {
  return useContext(AppFormContext)?.hasDeeperErrorTarget ?? NOTHING_DEEPER;
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
