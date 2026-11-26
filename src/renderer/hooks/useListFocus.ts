import * as React from 'react';

// Where the focus goes once a row of a list is removed: the row that takes the
// removed one's place, else the one before it, else the control that adds one
// where that could take the focus, else the list itself.
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

/**
 * The element, where it is still on screen. A removal is placed a render after
 * it is said, so anything remembered from before is asked again.
 */
function stillThere(element: HTMLElement | null): HTMLElement | null {
  return element !== null && element.isConnected ? element : null;
}

/** One removal, as the list stood when the row went. */
interface Removal {
  /** Where that row stood among the rows the list drew. */
  at: number;
  /** How many rows the list drew then, which is what the place waits on. */
  before: number;
  /**
   * The control that adds a row, as it stood then rather than after. The
   * removal is what frees that control where a list was at its maximum, and a
   * control nobody could press is not where the focus belongs.
   */
  adds: HTMLElement | null;
  /** Whether the menu or dialog it was pressed in has had its say. */
  whenClosed: boolean;
}

export interface ListFocus {
  /**
   * Registers one row, by whatever stands for it:
   *
   * - The row itself, where an editor works inside it, as a dynamic field's
   *   sections and a select's options do.
   * - The row's own Remove, where the row is that one control, as the lists of
   *   what a field allows, a reference field's picked Assets and Entries and a
   *   Project's languages are.
   * - The row's own control over what it shows, as a Collection's and a
   *   Component's fields are, whose row opens the field's settings.
   *
   * One ref serves every row, and the rows are read in the order they stand in
   * the document, so no list says what it keys a row by.
   */
  rowRef: React.RefCallback<HTMLElement>;
  /** Registers the control that adds a row, where the list has one. */
  addRef: (element: HTMLElement | null) => void;
  /** Registers the list itself, which takes the focus when nothing else can. */
  listRef: (element: HTMLElement | null) => void;
  /**
   * Says that the row at `at` was removed, from the handler that removes it.
   *
   * The focus is placed once the list draws fewer rows than it did, so what it
   * lands on is a row the list holds however many rows the removal took: a
   * markdown field's Blocks takes Task lists out with Lists, because Core
   * refuses the one without the other.
   */
  afterRemoval: (at: number) => void;
  /**
   * The same for a removal pressed inside a menu or a dialog, which returns the
   * focus itself once it has closed. Such a popup takes `finalFocus` below, and
   * the place is held until it has.
   */
  afterRemovalOnceClosed: (at: number) => void;
  /**
   * What a menu's or a dialog's `finalFocus` takes: it answers that nothing is
   * to be focused by the popup, and places the focus itself once the list is
   * drawn without the row.
   *
   * A popup hands the focus to the first tabbable element inside what it is
   * given, which would reach past a row or a list that is focusable only to be
   * focused, and it returns the focus while React is still drawing the shorter
   * list, which is why the place is not handed over. With no removal behind it
   * the popup keeps its own way, which is the control it was opened from.
   */
  finalFocus: () => boolean;
}

export function useListFocus(): ListFocus {
  const rows = React.useRef(new Set<HTMLElement>());
  const add = React.useRef<HTMLElement | null>(null);
  const list = React.useRef<HTMLElement | null>(null);
  const removal = React.useRef<Removal | null>(null);

  const { api, settle } = React.useMemo(() => {
    /** The rows the list holds right now, in the order they stand in. */
    const mounted = (): HTMLElement[] =>
      [...rows.current]
        .filter((element) => element.isConnected)
        .sort((one, other) =>
          (one.compareDocumentPosition(other) &
            Node.DOCUMENT_POSITION_FOLLOWING) ===
          0
            ? 1
            : -1
        );

    const place = (what: Removal): void => {
      const left = mounted();

      (
        left[what.at] ??
        left[what.at - 1] ??
        stillThere(what.adds) ??
        stillThere(list.current)
      )?.focus();
    };

    /**
     * Whether the list has been drawn without the row. The row that was
     * pressed may keep its element, since a list whose rows carry no id of
     * their own, as a select's options do, is drawn by place, so what is
     * waited on is one row fewer rather than that element going.
     */
    const isShorter = (what: Removal): boolean =>
      mounted().length < what.before;

    const plan = (at: number, whenClosed: boolean): void => {
      removal.current = {
        at,
        before: mounted().length,
        adds: takesFocus(add.current) ? add.current : null,
        whenClosed,
      };
    };

    const api: ListFocus = {
      rowRef: (element) => {
        // React 19 calls the cleanup below instead of calling this with null,
        // so a row leaves the set with its own element rather than by a key.
        if (element === null) {
          return;
        }
        rows.current.add(element);

        return () => {
          rows.current.delete(element);
        };
      },
      addRef: (element) => {
        add.current = element;
      },
      listRef: (element) => {
        list.current = element;
      },
      afterRemoval: (at) => {
        plan(at, false);
      },
      afterRemovalOnceClosed: (at) => {
        plan(at, true);
      },
      finalFocus: () => {
        const what = removal.current;

        if (what === null) {
          return true;
        }
        if (isShorter(what)) {
          removal.current = null;
          place(what);
        } else {
          // A dialog closes after the list was drawn again, a menu inside a
          // pane that goes with the row closes while it still is, so the place
          // is left to the render that drops the row.
          removal.current = { ...what, whenClosed: false };
        }

        return false;
      },
    };

    /** Places a removal, once the list has been drawn without its row. */
    const settle = (): void => {
      const what = removal.current;

      if (what === null || what.whenClosed || isShorter(what) === false) {
        return;
      }
      removal.current = null;
      place(what);
    };

    return { api, settle };
  }, []);

  // After every render of the list, because the render that drops the row is
  // what makes the place the focus goes to a place that is there. Before the
  // browser paints, so nothing is drawn with the focus still on its way.
  React.useLayoutEffect(() => {
    settle();
  });

  return api;
}
