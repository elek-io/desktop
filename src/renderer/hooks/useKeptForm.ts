import { createContext, useContext, useEffect, useRef } from 'react';

// What a page hands over to itself across the one way out that comes back to
// it: the dialog of a refused field definition change links to an Entry that
// has to be fixed, so the settings behind it keep what nobody saved and show it
// again when the person comes back.
//
// See contributing/renderer/forms.md#leaving-unsaved-changes.

export interface KeptFormsContextValue {
  /** Holds one page's unsaved state under a key of its own. */
  keep: (key: string, values: unknown) => void;
  /** Reads it without taking it, so a render can ask. */
  peek: (key: string) => unknown;
  /** Drops it, which the page does as soon as it has it back. */
  forget: (key: string) => void;
}

export const KeptFormsContext = createContext<KeptFormsContextValue | null>(
  null
);

export interface KeptForm<TValues> {
  /**
   * What this page kept the last time it was left by a link that comes back,
   * or `undefined` for a page opened any other way. It is read once, on the
   * first render, so what is typed afterwards is never thrown away.
   */
  kept: TValues | undefined;
  /** Keeps what is unsaved right now, for the way back. */
  keep: (values: TValues) => void;
}

/**
 * The unsaved state this page kept for itself, and the way to keep it.
 *
 * What comes back is dropped from the store as soon as this page holds it, so
 * the next visit that follows no link opens on what is stored rather than on a
 * draft somebody left behind. Outside the provider nothing is kept, which is
 * what the error screen and the not-found screen are.
 *
 * It is `unknown` on the way through, because only the page knows the shape of
 * its own form, and it never crosses a process or a reload: a window that is
 * closed or reloaded has nothing kept, which is what the question before
 * closing it is for.
 */
export function useKeptForm<TValues>(key: string): KeptForm<TValues> {
  const store = useContext(KeptFormsContext);
  // Read while rendering, so the form is filled from it in the same frame it
  // first draws, and read again only when the key changes. The read takes
  // nothing out of the store, so rendering twice reads the same thing.
  const read = useRef<{ key: string; values: unknown } | null>(null);

  if (read.current === null || read.current.key !== key) {
    read.current = { key, values: store?.peek(key) };
  }

  useEffect(() => {
    store?.forget(key);
  }, [store, key]);

  return {
    // The store holds one shape per page and cannot know them, so the page
    // names the shape it kept. Nothing else writes under its key, and the
    // values never leave the window, so this is the page's own value coming
    // back rather than a payload to be trusted.
    kept: read.current.values as TValues | undefined,
    keep: (values) => store?.keep(key, values),
  };
}
