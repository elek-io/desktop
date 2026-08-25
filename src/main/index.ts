import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import { realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Path from 'path';

import ElekIoCore, { CoreError } from '@elek-io/core';

import icon from '../../resources/icon.png?asset';
import { serializeCoreError } from '../shared/ipcError.js';

// import { updateElectronApp } from 'update-electron-app';

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
  private core: ElekIoCore | null = null;

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
      void this.onAppReady().catch((error: unknown) => {
        // Exit instead of leaving a running app without a window,
        // otherwise initialization failures hang silently.
        // Not using Core's logger since it may be what failed to initialize
        // eslint-disable-next-line no-console
        console.error('Failed to initialize the app', error);
        app.exit(1);
      });
    });
    app.on('activate', () => {
      void this.onAppActivate();
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
      log: { level: app.isPackaged ? 'info' : 'debug' },
    });
    const user = await this.core.user.get();

    if (user && user.localApi.isEnabled) {
      this.core.api.start(user.localApi.port);
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
    options.titleBarOverlay = true;

    const window = new BrowserWindow(options);

    window.webContents.on('will-navigate', (event, urlToLoad) =>
      this.onWindowWebContentsWillNavigate(window, event, urlToLoad)
    );

    return window;
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

    return windowProps;
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
      } catch {
        this.core.logger.error({
          source: 'desktop',
          message: `Could not resolve requested file URL "${request.url}".`,
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
      } catch {
        this.core.logger.error({
          source: 'desktop',
          message: `Could not resolve the real path of "${absoluteFilePath}".`,
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
   * Registers IPC handlers for the main process
   */
  private registerIpcMain(
    window: Electron.BrowserWindow,
    core: ElekIoCore
  ): void {
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
          // drops the CoreError subclass, its `type` and its stack (the
          // renderer receives a frameless error). Encode all three into the
          // message so the renderer can recover them with parseIpcError.
          // Everything else propagates unchanged.
          if (error instanceof CoreError) {
            throw new Error(
              serializeCoreError(error.type, error.message, error.stack)
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
