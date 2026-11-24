import * as React from 'react';

// Where the focus goes once a row of a list is removed: the row that takes the
// removed one's place, else the one before it, else the control that adds one
// where that can take the focus, else the list itself.
//
// Every list in a form uses this, so no form moves the focus its own way and a
// focus that falls to the body cannot creep back in. The Assets grid answers
// the same order for itself, since a card goes only once the delete came back.
// See contributing/renderer/forms.md#keeping-focus-after-a-row-is-removed.

/** Whether a control can take the focus, which a disabled one cannot. */
function takesFocus(element: HTMLElement | null): element is HTMLElement {
  // A CSS selector, which nobody reads as words.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  return element !== null && element.matches(':disabled') === false;
}

export interface ListFocus {
  /**
   * Registers what stands for the row the list keys by `key`: the row itself
   * where an editor works inside it, and the row's own Remove where the row is
   * that one control.
   */
  rowRef: (key: string) => (element: HTMLElement | null) => void;
  /** Registers the control that adds a row, where the list has one. */
  addRef: (element: HTMLElement | null) => void;
  /** Registers the list itself, which takes the focus when nothing else can. */
  listRef: (element: HTMLElement | null) => void;
  /**
   * Puts the focus where the removal of the row at `removed` leaves it, given
   * the keys of the rows that stay, in the order they stand in.
   */
  afterRemoval: (removed: number, staying: string[]) => void;
  /**
   * Keeps that place for the menu or dialog the removal was pressed in, which
   * returns the focus itself once it has closed. Such a popup takes
   * `finalFocus` below.
   */
  afterRemovalOnceClosed: (removed: number, staying: string[]) => void;
  /**
   * What a menu's or a dialog's `finalFocus` takes: it places the focus the
   * last removal planned and answers that nothing else is to be focused.
   *
   * A popup hands the focus to the first tabbable element inside what it is
   * given, which would reach past a row or a list that is focusable only to be
   * focused, so the place is taken here rather than handed over. With no
   * removal behind it the popup keeps its own way, which is the control it was
   * opened from.
   */
  finalFocus: () => boolean;
}

export function useListFocus(): ListFocus {
  const rows = React.useRef(new Map<string, HTMLElement>());
  const add = React.useRef<HTMLElement | null>(null);
  const list = React.useRef<HTMLElement | null>(null);
  const planned = React.useRef<HTMLElement | null>(null);

  return React.useMemo(() => {
    const target = (removed: number, staying: string[]): HTMLElement | null => {
      const row = [staying[removed], staying[removed - 1]]
        .map((key) => (key === undefined ? undefined : rows.current.get(key)))
        .find((element) => element !== undefined);
      // The control that adds a row is still disabled where the removal is
      // what frees it, since React has not drawn it again yet, and a disabled
      // control takes no focus. So the list takes it rather than the page.
      const adds = takesFocus(add.current) ? add.current : null;

      return row ?? adds ?? list.current;
    };

    return {
      rowRef: (key) => (element) => {
        if (element === null) {
          rows.current.delete(key);
          return;
        }
        rows.current.set(key, element);
      },
      addRef: (element) => {
        add.current = element;
      },
      listRef: (element) => {
        list.current = element;
      },
      afterRemoval: (removed, staying) => {
        target(removed, staying)?.focus();
      },
      afterRemovalOnceClosed: (removed, staying) => {
        planned.current = target(removed, staying);
      },
      finalFocus: () => {
        const element = planned.current;
        planned.current = null;

        if (element === null || element.isConnected === false) {
          return true;
        }
        element.focus();

        return false;
      },
    };
  }, []);
}
