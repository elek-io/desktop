// Inside `page.evaluate` the callback runs in the renderer, where `window`, the
// `window.ipc` bridge and the document exist. Specs type-check under the Node
// tsconfig, which has no DOM lib, so what they touch is declared here. The `ipc`
// shape comes from the global Window augmentation in src/index.d.ts, and the
// geometry below is what the window-size spec measures. Only what a spec uses is
// declared, so no unused DOM API quietly becomes available.
declare const window: Window & {
  innerWidth: number;
  innerHeight: number;
  requestAnimationFrame: (callback: () => void) => number;
};

/** The one element shape the specs read, with the attributes they ask for. */
interface ProbedElement {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly parentElement: ProbedElement | null;
  readonly clientHeight: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  /**
   * How far the element is scrolled, which one spec writes to: a sidebar that
   * scrolls marks the edge it continues past, and scrolling it is how both
   * marks are driven.
   */
  scrollTop: number;
  closest(selectors: string): ProbedElement | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getBoundingClientRect(): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly right: number;
    readonly bottom: number;
  };
  matches(selectors: string): boolean;
  querySelector(selectors: string): ProbedElement | null;
  querySelectorAll(selectors: string): ArrayLike<ProbedElement>;
  /**
   * The element's own styles, which one spec writes a width into: the area a
   * field is measured against is a pane of the redesigned editor, and giving
   * this one its width is how that is driven before the editor is rebuilt.
   */
  readonly style: { width: string };
  /**
   * Where `other` sits relative to this element, as the DOM's bit mask. A spec
   * reads one bit of it, `DOCUMENT_POSITION_FOLLOWING` (4), to say that `other`
   * comes after this element in document order.
   */
  compareDocumentPosition(other: ProbedElement): number;
}

/**
 * One animation the document is running, as the loading spec reads it.
 *
 * `animationName` is what a CSS animation carries, so an animation started any
 * other way has none and counts as one the spec did not expect.
 */
interface ProbedAnimation {
  readonly animationName?: string;
}

/** The computed properties the specs measure. */
interface ProbedStyle {
  readonly transform: string;
  readonly animationName: string;
  readonly backgroundColor: string;
  readonly bottom: string;
  readonly paddingLeft: string;
  readonly paddingRight: string;
  readonly display: string;
  readonly opacity: string;
  readonly top: string;
  readonly width: string;
  readonly flexShrink: string;
  readonly overflowY: string;
  readonly borderTopColor: string;
  readonly borderTopWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly borderTopLeftRadius: string;
  readonly boxShadow: string;
  readonly color: string;
  readonly columnGap: string;
  readonly rowGap: string;
  readonly flexWrap: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly gridTemplateColumns: string;
  readonly lineHeight: string;
  readonly padding: string;
  readonly outlineColor: string;
  readonly outlineOffset: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  getPropertyValue(property: string): string;
}

declare const getComputedStyle: (
  element: ProbedElement,
  pseudoElement?: string
) => ProbedStyle;

declare const document: {
  body: { scrollWidth: number };
  getElementById(id: string): ProbedElement | null;
  readonly activeElement: ProbedElement | null;
  readonly documentElement: ProbedElement;
  getAnimations(): ArrayLike<ProbedAnimation>;
  readonly fonts: Iterable<{ family: string }> & {
    ready: Promise<unknown>;
  };
  querySelector(selectors: string): ProbedElement | null;
  querySelectorAll(selectors: string): ArrayLike<ProbedElement>;
};

/**
 * The window controls overlay, where the system draws the controls into the
 * document's own top bar. Windows and Linux report it, which is where the
 * window spec reads its height.
 */
declare const navigator: {
  readonly windowControlsOverlay?: {
    readonly visible: boolean;
    getTitlebarAreaRect(): { readonly height: number };
  };
};

declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * One record the app wrote to Core's logger, as the main process received it.
 *
 * The log helper replaces the `core:logger:*` handlers and keeps what they are
 * handed here, in the main process, where `electronApp.evaluate` can read it
 * back. See tests/helpers/log.ts.
 */
interface RecordedLog {
  level: string;
  source: string;
  message: string;
  meta: Record<string, unknown>;
}

// eslint-disable-next-line no-var
declare var recordedLogs: RecordedLog[] | undefined;

/**
 * One style the main process handed the window controls overlay.
 *
 * Electron's own option shape, whose three keys the app always fills. Kept in
 * the main process, where the window is, see tests/helpers/window.ts.
 */
interface RecordedTitleBarOverlay {
  color?: string;
  symbolColor?: string;
  height?: number;
}

// eslint-disable-next-line no-var
declare var titleBarOverlayCalls: RecordedTitleBarOverlay[] | undefined;

/**
 * Every address the app asked the system to open, kept in the main process the
 * same way. See tests/helpers/external.ts.
 */
// eslint-disable-next-line no-var
declare var openedExternally: string[] | undefined;

/**
 * Every call a recorded Core channel took, by its channel name, kept in the
 * main process the same way. See tests/helpers/ipc.ts.
 */
// eslint-disable-next-line no-var
declare var recordedCoreCalls: string[] | undefined;

/**
 * Every claim about unsaved changes the window made, in the order the main
 * process took them, kept in the main process the same way. A spec waits on it
 * before it drives a close. See tests/helpers/window.ts.
 */
// eslint-disable-next-line no-var
declare var unsavedChangesClaims: unknown[] | undefined;

/**
 * Every file the window asked for while its first load is held and answered
 * with nothing, kept in the main process the same way. A spec reads it to tell
 * a load the hold has from one that never reached it. See
 * tests/specs/app-initialization.spec.ts.
 */
// eslint-disable-next-line no-var
declare var heldFileRequests: string[] | undefined;
