// Inside `page.evaluate` the callback runs in the renderer, where `window`, the
// `window.ipc` bridge and the document exist. Specs type-check under the Node
// tsconfig, which has no DOM lib, so what they read is declared here. The `ipc`
// shape comes from the global Window augmentation in src/index.d.ts, and the
// geometry below is what the window-size spec measures. Only what is read is
// declared, so no unused DOM API quietly becomes available.
declare const window: Window & {
  innerWidth: number;
  innerHeight: number;
  requestAnimationFrame: (callback: () => void) => number;
};

/** The one element shape the specs read, with the attributes they ask for. */
interface ProbedElement {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  matches(selectors: string): boolean;
}

/** The computed properties the branding spec measures. */
interface ProbedStyle {
  readonly backgroundColor: string;
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

declare const getComputedStyle: (element: ProbedElement) => ProbedStyle;

declare const document: {
  body: { scrollWidth: number };
  readonly activeElement: ProbedElement | null;
  readonly documentElement: ProbedElement;
  readonly fonts: { ready: Promise<unknown>; check(font: string): boolean };
  querySelector(selectors: string): ProbedElement | null;
  querySelectorAll(selectors: string): ArrayLike<ProbedElement>;
};

declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
