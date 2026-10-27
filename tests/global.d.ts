// Inside `page.evaluate` the callback runs in the renderer, where `window`, the
// `window.ipc` bridge and the document exist. Specs type-check under the Node
// tsconfig, which has no DOM lib, so what they read is declared here. The `ipc`
// shape comes from the global Window augmentation in src/index.d.ts, and the
// geometry below is what the window-size spec measures. Only what is read is
// declared, so no unused DOM API quietly becomes available.
declare const window: Window & {
  innerWidth: number;
  innerHeight: number;
};

declare const document: {
  body: { scrollWidth: number };
};
