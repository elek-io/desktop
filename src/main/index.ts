import { t } from '@lingui/core/macro';
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import { realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Path from 'path';
import { type ZodType } from 'zod';

import { colors } from '@elek-io/branding';
import ElekIoCore, { CoreError } from '@elek-io/core';

import icon from '../../resources/icon.png?asset';
import { activateAppLocale } from '../shared/i18n.js';
import { serializeCoreError } from '../shared/ipcError.js';
import { errorLogAttributes } from '../shared/logError.js';
import {
  unsavedChangesSchema,
  windowCloseAnswerSchema,
} from '../shared/windowClose.js';
import { windowThemeSchema, type WindowTheme } from '../shared/windowTheme.js';

// import { updateElectronApp } from 'update-electron-app';

/**
 * The smallest window elek.io Desktop supports, in CSS pixels at 100% zoom.
 * Below it a screen starts to collide or clip.
 */
const minimumWindowSize = { width: 1168, height: 560 } as const;

/**
 * The height of the bar the window controls get to themselves, the first of the
 * header's two bars. The same on every system, so the header does not change
 * with it.
 */
const windowControlsBarHeight = 32;

/**
 * Where macOS puts the traffic lights. They are drawn by the system rather than
 * by the renderer, so their place is set here: 16 px from the left edge, and
 * 10 px down, which centers the 12 px buttons in the 32 px bar.
 */
const trafficLightPosition = { x: 16, y: 10 } as const;

/** Where somebody reports a start that failed, since the in-app report needs a running app. */
const issuesUrl = 'https://github.com/elek-io/desktop/issues';

class Main {
  public readonly customFileProtocol: string = 'elek-io-local-file';
  private readonly rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  private allowedHostnamesToLoadInternal: string[] = [];
  private allowedHostnamesToLoadExternal: string[] = [
    this.customFileProtocol,
    'localhost',
    'elek.io',
    'api.elek.io',
    'github.com',
  ];
  // Only a release build, which CD marks with MAIN_VITE_IS_RELEASE, talks to
  // the production elek.io Cloud. Every other build, dev and CI included, uses
  // the dev API. See contributing/build-and-packaging.md.
  private readonly cloudUrl =
    import.meta.env.MAIN_VITE_IS_RELEASE === 'true'
      ? 'https://api.elek.io'
      : 'https://api.dev.elek.io';
  private core: ElekIoCore | null = null;
  /**
   * Whether the window holds something nobody saved, as the renderer last said
   * over `electron:window:setUnsavedChanges`.
   *
   * One field for one window, which is all the app opens. A close is held only
   * while this is true, so the renderer that says it is the renderer that
   * answers the question, and a renderer with nothing unsaved holds nothing.
   */
  private hasUnsavedChanges = false;
  /**
   * Whether what is closing the window is a quit, so Discard ends the app
   * rather than leaving it running without a window on macOS.
   *
   * Electron aborts a quit when a window refuses to close and emits nothing to
   * say so, so this is cleared again when the question is answered with Keep
   * editing.
   */
  private isQuitting = false;

  constructor() {
    // Allow the vite dev server to do HMR in development
    if (app.isPackaged === false && this.rendererUrl !== undefined) {
      this.allowedHostnamesToLoadInternal.push(this.rendererUrl);
    }

    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    // if (require('electron-squirrel-startup')) {
    //   app.quit();
    // }

    // Register app events
    app.on('ready', () => {
      void this.onAppReady().catch(async (error: unknown) =>
        this.onAppReadyFailed(error)
      );
    });
    app.on('activate', () => {
      void this.onAppActivate();
    });
    app.on('before-quit', () => {
      this.isQuitting = true;
    });
    app.on('window-all-closed', () => this.onAppAllWindowsClosed());
    app.on('web-contents-created', (event, webContents) =>
      this.onAppWebContentsCreated(event, webContents)
    );

    // Enable auto-updates
    // @see https://github.com/electron/update-electron-app
    // updateElectronApp();
  }

  /**
   * Initializes Core, registers custom file protocol,
   * creates the first window and registers IPC handlers
   *
   * Needs to be called once Electron has finished initializing
   */
  private async onAppReady(): Promise<void> {
    this.core = new ElekIoCore({
      log: {
        level: app.isPackaged ? 'info' : 'debug',
        // Stamps `service.version` on every record we log, so a log file sent
        // without a report around it still says which build wrote it. Core
        // stamps its own version on its own records and cannot read ours.
        hostVersion: app.getVersion(),
      },
      cloud: {
        // Core ranks its option above ELEK_IO_CLOUD_URL, so check it here to
        // let one set at launch still win. The E2E fixture relies on that.
        url: process.env['ELEK_IO_CLOUD_URL'] ?? this.cloudUrl,
      },
    });
    this.logIdentity(this.core);
    const user = await this.core.user.get();

    if (user && user.localApi.isEnabled) {
      // Awaited, because start() settles once the port is bound or rejects, and
      // an unawaited rejection here would reach onAppReady's catch and exit the
      // app. A port already in use must not stop the app from launching, so the
      // failure is logged and the local API stays off. The User sees it off on
      // their profile page, which reads core.api.isRunning, and can start it
      // again there on a free port. Telling them why at launch needs a channel
      // from the main process to the renderer, which does not exist yet.
      try {
        await this.core.api.start(user.localApi.port);
      } catch (error) {
        this.core.logger.error({
          source: 'desktop',
          message:
            error instanceof CoreError && error.type === 'Conflict'
              ? `Could not start the local API because port ${user.localApi.port} is already in use`
              : 'Could not start the local API',
          meta: errorLogAttributes(error),
        });
      }
    }

    this.registerCustomFileProtocol();

    // Register the IPC handlers before loading the renderer. The renderer issues
    // IPC calls as soon as it mounts, so registering after the load would leave
    // a startup gap where a call arrives before its handler exists and rejects
    // with "No handler registered", which throwOnError turns into the root error
    // boundary on launch. The handlers only touch the window when invoked, so it
    // just needs to exist here, not be loaded yet.
    const window = this.createWindow();
    this.registerIpcMain(window, this.core);
    await this.loadWindow(window);
  }

  /**
   * Ends a start that failed, instead of leaving a running app without a window.
   *
   * A packaged app has no console anyone sees, so the error is shown in a native
   * box too. When Core got far enough to exist, the error also goes to its log
   * file, and disposing Core flushes that record before the process exits. Core
   * may be what failed, so the console and the box never depend on it.
   *
   * The box takes the system's language rather than the User's. Nothing read a
   * User at this point, and Core may be what failed, so the system is the only
   * language on hand. `app.getLocale()` answers once Electron is ready, which
   * it is here, since this only runs from the `ready` handler.
   */
  private async onAppReadyFailed(error: unknown): Promise<void> {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize the app', error);

    activateAppLocale(app.getLocale());

    if (this.core !== null) {
      try {
        this.core.logger.error({
          source: 'desktop',
          message: 'Failed to initialize the app',
          meta: errorLogAttributes(error),
        });
        await this.core.dispose();
      } catch {
        // The console line above and the box below still report it
      }
    }

    // Composed outside the call, so the box's arguments stay a catalog message
    // and a value rather than a literal, which is what the lint rule asks for.
    const reason = error instanceof Error ? error.message : String(error);
    const advice = t`If this keeps happening, please open an issue at ${issuesUrl}`;
    const detail = `${reason}\n\n${advice}`;

    dialog.showErrorBox(t`elek.io Desktop could not start`, detail);
    app.exit(1);
  }

  /**
   * Writes which runtime is running, once per app start.
   *
   * Which build wrote a record is answered by `log.hostVersion` above, which
   * puts our version on the Resource of every record we log. What that cannot
   * carry is the runtime underneath, and a rendering bug is often specific to
   * one Chromium. Those three versions do not change while the app runs, so
   * once per start is enough and repeating them per record would be waste.
   *
   * A tail reaches back 24 hours, so an app left running for days drops this
   * record out of the window. That is survivable now: the version is on every
   * record either way, and only the runtime detail goes with it.
   */
  private logIdentity(core: ElekIoCore): void {
    const { electron, chrome, node } = process.versions;

    core.logger.info({
      source: 'desktop',
      message: `Desktop ${app.getVersion()} starting (electron ${electron}, chrome ${chrome}, node ${node})`,
      meta: {
        'elek.desktop.runtime.electron': electron,
        'elek.desktop.runtime.chrome': chrome,
        'elek.desktop.runtime.node': node,
      },
    });
  }

  /**
   * Creates a new window when the app is activated
   *
   * Triggered when launching the application for the first time,
   * attempting to re-launch the application when it's already running,
   * or clicking on the application's dock or taskbar icon.
   */
  private async onAppActivate(): Promise<void> {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      await this.loadWindow(this.createWindow());
    }
  }

  private onAppAllWindowsClosed(): void {
    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  private onAppWebContentsCreated(
    _event: {
      preventDefault: () => void;
      readonly defaultPrevented: boolean;
    },
    webContents: Electron.WebContents
  ): void {
    // Disable the creation of new windows e.g. by using target="_blank"
    // Instead, let the operating system handle this event's url if it's in the whitelist
    // and open external links inside the default browser
    // @see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
    // @todo in the future we can also allow mailto: URL's etc.
    webContents.setWindowOpenHandler(({ url }) => {
      const parsedUrl = new URL(url);

      if (
        this.allowedHostnamesToLoadExternal.includes(parsedUrl.hostname) ===
        false
      ) {
        const errorMessage = `Prevented navigation to untrusted, external URL "${parsedUrl.toString()}" from "${webContents.getURL()}"`;
        this.core?.logger.error({
          source: 'desktop',
          message: errorMessage,
        });

        return { action: 'deny' };
      }

      setImmediate(() => {
        void shell.openExternal(url);
      });
      return { action: 'deny' };
    });
  }

  /**
   * Creates a new window with security in mind and loads the frontend
   */
  private createWindow(): BrowserWindow {
    const initialWindowSize = this.getInitialWindowSize();

    const options: BrowserWindowConstructorOptions = {
      width: initialWindowSize.width,
      height: initialWindowSize.height,
      // Electron enforces the smallest window the app supports, so no screen
      // can be dragged into collapsing. The zoom levels the app offers have to
      // stay above it too, since the minimum is in CSS pixels.
      minWidth: minimumWindowSize.width,
      minHeight: minimumWindowSize.height,
    };

    // Overwrite webPreferences to always load the correct preload script
    // and explicitly enable security features - although Electron > v28 should set these by default
    options.webPreferences = {
      preload: Path.join(__dirname, '../preload/index.cjs'),
      disableBlinkFeatures: 'Auxclick', // @see https://github.com/doyensec/electronegativity/wiki/AUXCLICK_JS_CHECK
      nodeIntegration: false,
      contextIsolation: true, // @see https://github.com/doyensec/electronegativity/wiki/CONTEXT_ISOLATION_JS_CHECK
      sandbox: true, // @see https://github.com/doyensec/electronegativity/wiki/SANDBOX_JS_CHECK
    };
    if (process.platform === 'linux') {
      options.icon = icon;
    }
    options.frame = false;
    options.titleBarStyle = 'hidden';
    // The window controls keep the header's first bar to themselves, as high as
    // that bar on every system. Which theme the renderer resolved to is only
    // known once it mounts and calls `electron:window:setTheme`, so the overlay
    // starts on the system's preference.
    options.titleBarOverlay = this.titleBarOverlayFor(
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    );
    if (process.platform === 'darwin') {
      options.trafficLightPosition = trafficLightPosition;
    }

    const window = new BrowserWindow(options);

    window.webContents.on('will-navigate', (event, urlToLoad) =>
      this.onWindowWebContentsWillNavigate(window, event, urlToLoad)
    );
    window.on('close', (event) => this.onWindowClose(window, event));
    // A fresh document has saved nothing yet and has not said anything about
    // itself, so a reload leaves no claim of the document before it behind.
    window.webContents.on('did-finish-load', () => {
      this.hasUnsavedChanges = false;
    });

    return window;
  }

  /**
   * Holds the window open while the renderer still has something nobody saved,
   * and asks the renderer to put the question on screen.
   *
   * The question is ci's own discard dialog in the window, named by the page,
   * rather than a native box, which could draw neither a red Discard nor a
   * ghost Keep editing and would not know what page is open. So this process
   * only stops the close and hands the question over, and closes once the
   * renderer answers with Discard over `electron:window:answerClose`.
   *
   * A close is held only while the renderer said there is something unsaved,
   * which is a claim only a living renderer makes. A crashed one can show no
   * question, so nothing of it is held either and the window closes.
   *
   * `close` is emitted before the document's own unload events, which is why
   * the leave guard in the renderer keeps TanStack Router's `beforeunload` off:
   * a `beforeunload` that cancels would stop the close again after this handler
   * let it through, and without a `will-prevent-unload` handler nobody would be
   * told.
   */
  private onWindowClose(window: BrowserWindow, event: Electron.Event): void {
    if (this.hasUnsavedChanges === false || window.webContents.isCrashed()) {
      return;
    }

    event.preventDefault();
    window.webContents.send('electron:window:askBeforeClose');
  }

  /**
   * Loads the renderer into an already created window.
   *
   * Kept separate from createWindow so the caller can register the IPC handlers
   * on the window before the renderer starts running. That ordering closes the
   * startup race where a renderer IPC call could arrive before its handler is
   * registered.
   */
  private async loadWindow(window: BrowserWindow): Promise<void> {
    try {
      if (app.isPackaged) {
        // Desktop is in production
        // Load the static index.html directly
        await window.loadFile(Path.join(__dirname, `../renderer/index.html`));
        // Uncomment to debug a production build
        // window.webContents.openDevTools();
      } else {
        // Desktop is in development
        if (this.rendererUrl === undefined) {
          throw new Error(`"process.env['ELECTRON_RENDERER_URL']" is empty`);
        }
        this.core?.logger.info({
          source: 'desktop',
          message: `Loading frontend in development by URL: ${this.rendererUrl}`,
        });
        await window.loadURL(this.rendererUrl);
        window.webContents.openDevTools();
      }
    } catch (error) {
      // Electron rejects a pending load with ERR_ABORTED as soon as another
      // main frame navigation starts, even one the navigation guard blocks. Our
      // document is already showing by then, since only it can start one, so
      // the window keeps working. Any other failure means it could not load.
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_ABORTED'
      ) {
        this.core?.logger.warn({
          source: 'desktop',
          message: 'Loading the window was interrupted by another navigation',
          meta: errorLogAttributes(error),
        });
        return;
      }
      throw error;
    }
  }

  /**
   * The style of the window controls overlay for one theme.
   *
   * Both colors come from the brand package, the ground the header sits on and
   * the text color on it, so the overlay carries no color of its own. Electron
   * ignores them on macOS, where the traffic lights are drawn in the system's
   * colors, and takes the height everywhere.
   */
  private titleBarOverlayFor(theme: WindowTheme): {
    color: string;
    symbolColor: string;
    height: number;
  } {
    return {
      color: colors[theme].sidebar.hex,
      symbolColor: colors[theme].foreground.hex,
      height: windowControlsBarHeight,
    };
  }

  /**
   * Returns the initial window size based on the primary display
   */
  private getInitialWindowSize(): {
    width: number;
    height: number;
  } {
    const display = screen.getPrimaryDisplay();
    const displaySize = display.workAreaSize;
    const aspectRatioFactor = 16 / 9;

    const windowProps = {
      width: 0,
      height: 0,
    };

    if (displaySize.width >= displaySize.height) {
      // Use 80% of possible height and set width to match 16/9
      windowProps.height = Math.round(displaySize.height * 0.8);
      windowProps.width = Math.round(windowProps.height * aspectRatioFactor);
    } else {
      // Use 80% of possible width and set height to match 16/9
      windowProps.width = Math.round(displaySize.width * 0.8);
      windowProps.height = Math.round(windowProps.width * aspectRatioFactor);
    }

    // The window opens at least at the smallest size the app supports and at
    // most at the size of the screen, so a small display gets its whole work
    // area instead of a window hanging off it.
    return {
      width: Math.min(
        Math.max(windowProps.width, minimumWindowSize.width),
        displaySize.width
      ),
      height: Math.min(
        Math.max(windowProps.height, minimumWindowSize.height),
        displaySize.height
      ),
    };
  }

  /**
   * Prevents loading untrusted origins internally / inside elek.io Desktop
   *
   * @see https://github.com/doyensec/electronegativity/wiki/AUXCLICK_JS_CHECK
   */
  private onWindowWebContentsWillNavigate(
    window: BrowserWindow,
    event: Electron.Event<Electron.WebContentsWillNavigateEventParams>,
    urlToLoad: string
  ): void {
    const parsedUrl = new URL(urlToLoad);

    if (
      this.allowedHostnamesToLoadInternal.includes(parsedUrl.origin) === false
    ) {
      event.preventDefault();
      const errorMessage = `Prevented navigation to untrusted, internal URL "${parsedUrl.toString()}" from "${window.webContents.getURL()}"`;
      this.core?.logger.error({
        source: 'desktop',
        message: errorMessage,
      });
    }
  }

  /**
   * Registers a custom file protocol to load files from the local file system
   */
  private registerCustomFileProtocol(): void {
    protocol.handle(this.customFileProtocol, async (request) => {
      if (!this.core) {
        // Not using Core's logger here, since Core is what is missing
        // eslint-disable-next-line no-console
        console.error(
          'Trying to handle custom file protocol but Core is not initialized.'
        );
        return new Response('Internal Server Error', { status: 500 });
      }

      const forbidden = new Response(
        'Forbidden: Tried to load a file from outside of elek.io Projects directory',
        { status: 403 }
      );

      // Resolve the request to a normalized, absolute native path before the
      // containment check. The renderer builds a file-style URL (empty
      // authority, forward slashes), so swap the custom scheme for `file:` and
      // let Node turn it back into a native path. fileURLToPath decodes
      // percent-encoding (so a "%2e%2e" cannot smuggle a "..") and rebuilds a
      // Windows drive path (`/D:/dir` becomes `D:\dir`), then Path.resolve
      // collapses any "."/".." segments. So the path we check is the path we
      // would actually read. A URL we cannot parse fails closed.
      let absoluteFilePath: string;
      try {
        absoluteFilePath = Path.resolve(
          fileURLToPath(
            request.url.replace(`${this.customFileProtocol}://`, 'file://')
          )
        );
      } catch (error) {
        this.core.logger.error({
          source: 'desktop',
          message: `Could not resolve requested file URL "${request.url}".`,
          meta: errorLogAttributes(error),
        });
        return forbidden;
      }

      // Only serve files inside the Projects or tmp directories. Match "<dir>"
      // and "<dir><sep>" so a sibling like "projects-evil" cannot slip through
      // as a bare string prefix of "projects".
      const isWithin = (candidate: string, directory: string): boolean =>
        candidate === directory || candidate.startsWith(directory + Path.sep);

      if (
        isWithin(absoluteFilePath, this.core.util.pathTo.projects) === false &&
        isWithin(absoluteFilePath, this.core.util.pathTo.tmp) === false
      ) {
        this.core.logger.error({
          source: 'desktop',
          message: `Tried to load file "${absoluteFilePath}" outside of the Projects or tmp directory.`,
        });
        return forbidden;
      }

      // Lexical containment is not enough: `net.fetch` follows symlinks. Core is
      // git-backed and Projects move between machines, so a Project imported
      // from an untrusted source can carry an asset that is a symlink whose own
      // path sits inside `projects` but points outside it (lfs/x.png ->
      // /etc/passwd). Resolve symlinks on both the request and the base
      // directories, then re-check, so only bytes that physically live inside
      // the Projects or tmp directory are served, and fetch the resolved path so
      // no further link is followed. A missing file or broken link fails closed.
      let resolvedFilePath: string;
      let resolvedProjects: string;
      let resolvedTmp: string;
      try {
        [resolvedFilePath, resolvedProjects, resolvedTmp] = await Promise.all([
          realpath(absoluteFilePath),
          realpath(this.core.util.pathTo.projects),
          realpath(this.core.util.pathTo.tmp),
        ]);
      } catch (error) {
        this.core.logger.error({
          source: 'desktop',
          message: `Could not resolve the real path of "${absoluteFilePath}".`,
          meta: errorLogAttributes(error),
        });
        return forbidden;
      }

      if (
        isWithin(resolvedFilePath, resolvedProjects) === false &&
        isWithin(resolvedFilePath, resolvedTmp) === false
      ) {
        this.core.logger.error({
          source: 'desktop',
          message: `Tried to load file "${absoluteFilePath}" resolving through a link to "${resolvedFilePath}" outside of the Projects or tmp directory.`,
        });
        return forbidden;
      }

      return await net.fetch(pathToFileURL(resolvedFilePath).href);
    });
  }

  /**
   * What the renderer sent on one of the channels that drive the window, or a
   * rejected call.
   *
   * The renderer is the process that runs content somebody else wrote, so
   * nothing it sends over one of those channels is taken as it arrives. A value
   * the schema does not accept rejects the call and is logged like the other
   * refusals in this process, and the rejection's message says which value was
   * refused, which is what the caller sees.
   */
  private fromRenderer<T>(
    core: ElekIoCore,
    schema: ZodType<T>,
    value: unknown,
    refusal: string
  ): T {
    const parsed = schema.safeParse(value);

    if (parsed.success === false) {
      const errorMessage = `${refusal}: ${JSON.stringify(value)}`;
      core.logger.error({
        source: 'desktop',
        message: errorMessage,
      });
      throw new Error(errorMessage);
    }

    return parsed.data;
  }

  /**
   * Registers IPC handlers for the main process
   */
  private registerIpcMain(
    window: Electron.BrowserWindow,
    core: ElekIoCore
  ): void {
    // The three things the renderer may say about its window, and the only
    // channels outside the map below, because they drive the window rather than
    // Core. Each takes one named value, which is parsed here, so neither a
    // color nor any other window option crosses from the renderer.
    ipcMain.handle('electron:window:setTheme', (_event, theme: unknown) => {
      const parsed = this.fromRenderer(
        core,
        windowThemeSchema,
        theme,
        'Refused to set a title bar theme that is neither "light" nor "dark"'
      );

      // Only Windows and Linux draw a Window Controls Overlay this can restyle.
      // macOS draws its traffic lights in the system's own colors and has no
      // `setTitleBarOverlay`.
      if (process.platform === 'darwin') {
        return;
      }

      window.setTitleBarOverlay(this.titleBarOverlayFor(parsed));
    });

    // Whether the window holds something nobody saved, which decides whether a
    // close is held for the question. See `onWindowClose`.
    ipcMain.handle(
      'electron:window:setUnsavedChanges',
      (_event, hasUnsavedChanges: unknown) => {
        this.hasUnsavedChanges = this.fromRenderer(
          core,
          unsavedChangesSchema,
          hasUnsavedChanges,
          'Refused to set whether the window holds unsaved changes to something that is neither true nor false'
        );
      }
    );

    // The answer to the question the renderer put on screen for a close this
    // process held.
    ipcMain.handle('electron:window:answerClose', (_event, answer: unknown) => {
      const parsed = this.fromRenderer(
        core,
        windowCloseAnswerSchema,
        answer,
        'Refused an answer to the question before closing that is neither "discard" nor "keep"'
      );

      if (parsed === 'keep') {
        // The window stays and so does what was typed. A quit this close
        // belonged to was aborted with it, so the next close is just a close.
        this.isQuitting = false;
        return;
      }

      // What was typed is let go of, so the close this process held goes
      // through. The window is closed from here rather than from the renderer,
      // which cannot close its own window.
      this.hasUnsavedChanges = false;

      if (this.isQuitting) {
        app.quit();
        return;
      }

      window.close();
    });

    const channelToHandlerMap = {
      'electron:dialog:showOpenDialog': dialog.showOpenDialog,
      'electron:dialog:showSaveDialog': dialog.showSaveDialog,
      'core:api:start': core.api.start.bind(core.api),
      'core:api:isRunning': core.api.isRunning.bind(core.api),
      'core:api:stop': core.api.stop.bind(core.api),
      'core:logger:debug': core.logger.debug.bind(core.logger),
      'core:logger:info': core.logger.info.bind(core.logger),
      'core:logger:warn': core.logger.warn.bind(core.logger),
      'core:logger:error': core.logger.error.bind(core.logger),
      'core:user:get': core.user.get.bind(core.user),
      'core:user:set': core.user.set.bind(core.user),
      'core:cloud:reports:create': core.cloud.reports.create.bind(
        core.cloud.reports
      ),
      'core:projects:count': core.projects.count.bind(core.projects),
      'core:projects:create': core.projects.create.bind(core.projects),
      'core:projects:list': core.projects.list.bind(core.projects),
      'core:projects:read': core.projects.read.bind(core.projects),
      'core:projects:history': core.projects.history.bind(core.projects),
      'core:projects:update': core.projects.update.bind(core.projects),
      'core:projects:getChanges': core.projects.getChanges.bind(core.projects),
      'core:projects:clone': core.projects.clone.bind(core.projects),
      'core:projects:synchronize': core.projects.synchronize.bind(
        core.projects
      ),
      'core:projects:setRemoteOriginUrl': core.projects.setRemoteOriginUrl.bind(
        core.projects
      ),
      'core:projects:delete': core.projects.delete.bind(core.projects),
      'core:releases:list': core.releases.list.bind(core.releases),
      'core:releases:prepare': core.releases.prepare.bind(core.releases),
      'core:releases:create': core.releases.create.bind(core.releases),
      'core:assets:list': core.assets.list.bind(core.assets),
      'core:assets:create': core.assets.create.bind(core.assets),
      'core:assets:read': core.assets.read.bind(core.assets),
      'core:assets:update': core.assets.update.bind(core.assets),
      'core:assets:delete': core.assets.delete.bind(core.assets),
      'core:assets:save': core.assets.save.bind(core.assets),
      'core:collections:list': core.collections.list.bind(core.collections),
      'core:collections:create': core.collections.create.bind(core.collections),
      'core:collections:read': core.collections.read.bind(core.collections),
      'core:collections:update': core.collections.update.bind(core.collections),
      'core:collections:delete': core.collections.delete.bind(core.collections),
      'core:components:list': core.components.list.bind(core.components),
      'core:components:count': core.components.count.bind(core.components),
      'core:components:create': core.components.create.bind(core.components),
      'core:components:read': core.components.read.bind(core.components),
      'core:components:readBySlug': core.components.readBySlug.bind(
        core.components
      ),
      'core:components:history': core.components.history.bind(core.components),
      'core:components:resolveComponentId':
        core.components.resolveComponentId.bind(core.components),
      'core:components:update': core.components.update.bind(core.components),
      'core:components:delete': core.components.delete.bind(core.components),
      'core:entries:list': core.entries.list.bind(core.entries),
      'core:entries:create': core.entries.create.bind(core.entries),
      'core:entries:read': core.entries.read.bind(core.entries),
      'core:entries:update': core.entries.update.bind(core.entries),
      'core:entries:delete': core.entries.delete.bind(core.entries),
    } as const;

    type Channel = keyof typeof channelToHandlerMap;

    (Object.keys(channelToHandlerMap) as Channel[]).forEach((channel) => {
      const handler = channelToHandlerMap[channel] as (
        ...args: unknown[]
      ) => unknown;

      ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        try {
          // Prepend window argument for dialog calls
          if (
            channel === 'electron:dialog:showOpenDialog' ||
            channel === 'electron:dialog:showSaveDialog'
          ) {
            return await handler(window, ...args);
          }

          return await handler(...args);
        } catch (error) {
          // Electron serializes a thrown error to the plain Error shape, which
          // drops the CoreError subclass, its `type`, its stack and its cause
          // (the renderer receives a frameless error). Encode all four into the
          // message so the renderer can recover them with parseIpcError.
          // `serializeCoreError` decides which causes may cross.
          // Everything else propagates unchanged.
          if (error instanceof CoreError) {
            throw new Error(
              serializeCoreError(
                error.type,
                error.message,
                error.stack,
                error.cause
              ),
              // The encoded message is what the renderer reads. The cause is
              // attached so the original stays reachable in this process.
              { cause: error }
            );
          }
          throw error;
        }
      });
    });
  }
}

export default new Main();

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
