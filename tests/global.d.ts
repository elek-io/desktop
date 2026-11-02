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
  readonly scrollHeight: number;
  readonly scrollWidth: number;
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
  querySelectorAll(selectors: string): ArrayLike<ProbedElement>;
}

/** The computed properties the branding spec measures. */
interface ProbedStyle {
  readonly animationName: string;
  readonly backgroundColor: string;
  readonly bottom: string;
  readonly display: string;
  readonly top: string;
  readonly width: string;
  readonly flexShrink: string;
  readonly overflowY: string;
  readonly borderTopColor: string;
  readonly boxShadow: string;
  readonly color: string;
  readonly fontFamily: string;
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
  getAnimations(): ArrayLike<unknown>;
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
