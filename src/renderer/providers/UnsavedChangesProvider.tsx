import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { DiscardChangesDialog } from '@renderer/components/discard-changes-dialog';
import {
  UnsavedChangesContext,
  type DiscardQuestion,
  type UnsavedChangesContextValue,
} from '@renderer/hooks/useUnsavedChanges';

/**
 * The one place that asks before changes nobody saved are lost.
 *
 * Every guarded form registers here while it is dirty, which answers the two
 * questions nothing else can answer alone:
 *
 * - Whether the window holds anything unsaved, which the main process needs to
 *   know before it closes the window. It is told here rather than by a form, so
 *   two forms on screen cannot overwrite each other's answer.
 * - Which page a close is about, so the question names it the same way leaving
 *   that page does.
 *
 * The dialog is rendered once here, so leaving a page and closing the window
 * ask in the same words with the same buttons. A form's leave guard asks
 * through `ask`, see `AppForm`.
 *
 * It sits above the route rather than inside it, so it is mounted for as long
 * as the app shows a route. The error screen and the not-found screen replace
 * the route component, so a form unmounts with them, which withdraws its claim
 * and leaves the main process holding nothing.
 */
export function UnsavedChangesProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  // The dirty forms by their own id, each with the title of the page it is on.
  // Registration carries the dirtiness: a form registers only while it holds
  // something unsaved, so what is in here is what would be lost.
  const [guardedPages, setGuardedPages] = useState<ReadonlyMap<string, string>>(
    new Map()
  );
  const [question, setQuestion] = useState<DiscardQuestion | null>(null);
  // Read when the main process asks, which is not a render, so the listener
  // below is registered once instead of on every change.
  const guardedPagesRef = useRef(guardedPages);

  useEffect(() => {
    guardedPagesRef.current = guardedPages;
  }, [guardedPages]);

  const register = useCallback((id: string, title: string): (() => void) => {
    setGuardedPages((pages) => new Map(pages).set(id, title));
    return () => {
      setGuardedPages((pages) => {
        const next = new Map(pages);
        next.delete(id);
        return next;
      });
    };
  }, []);

  const ask = useCallback((asked: DiscardQuestion) => {
    setQuestion(asked);
  }, []);

  const hasUnsavedChanges = guardedPages.size > 0;

  // What the main process needs to decide whether to hold a close. Said again
  // whenever it changes, so a form that was saved or left stops holding the
  // window.
  useEffect(() => {
    void window.ipc.electron.window.setUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // Nothing is unsaved once this is gone, which is what the error screen
  // replacing the route looks like from the main process. Without it a close
  // would be held with nothing left to ask.
  useEffect(
    () => () => {
      void window.ipc.electron.window.setUnsavedChanges(false);
    },
    []
  );

  // The main process holds a close while a form is dirty and asks here for the
  // question. Either answer goes back to it, so it never waits: Discard closes
  // the window, Keep editing leaves it and what was typed alone.
  useEffect(
    () =>
      window.ipc.electron.window.onAskedToClose(() => {
        const answer = (close: boolean): void => {
          void window.ipc.electron.window.answerClose(
            close ? 'discard' : 'keep'
          );
        };
        // The claim this close was held for, which a form can have withdrawn in
        // the meantime by being saved or left. Then there is nothing to ask
        // about and the window closes.
        const title = [...guardedPagesRef.current.values()][0];

        if (title === undefined) {
          answer(true);
          return;
        }

        setQuestion({
          title,
          onKeepEditing: () => answer(false),
          onDiscard: () => answer(true),
        });
      }),
    []
  );

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ register, ask }),
    [register, ask]
  );

  return (
    <UnsavedChangesContext value={value}>
      {children}
      {/* One dialog for both questions, so neither can drift from the other.
      Either answer takes the question off screen, which is what closes it,
      since the answers themselves navigate or close the window. */}
      <DiscardChangesDialog
        open={question !== null}
        title={question?.title ?? ''}
        onKeepEditing={() => {
          setQuestion(null);
          question?.onKeepEditing();
        }}
        onDiscard={() => {
          setQuestion(null);
          question?.onDiscard();
        }}
      />
    </UnsavedChangesContext>
  );
}
