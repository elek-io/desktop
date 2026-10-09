// Build time variables of the main process. electron-vite exposes every
// MAIN_VITE_ prefixed variable of the build environment on import.meta.env.
interface ImportMetaEnv {
  /**
   * `true` only in a release build, set by CD.
   * See contributing/build-and-packaging.md.
   */
  readonly MAIN_VITE_IS_RELEASE?: string;
}
