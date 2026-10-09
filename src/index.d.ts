import type { ElectronAPI } from '@electron-toolkit/preload';
import type { Dialog } from 'electron';

import type ElekIoCore from '@elek-io/core';

/**
 * Utility type that transforms all methods in an object to return Promises.
 * This reflects the async nature of IPC communication - even if the underlying
 * method is synchronous, calling it through ipcRenderer.invoke is always async.
 *
 * @template T - The object type to transform
 */
type AsyncifyMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K] extends object
      ? AsyncifyMethods<T[K]>
      : T[K];
};

declare global {
  interface ContextBridgeApi {
    electron: {
      process: ElectronAPI['process'];
      dialog: {
        showOpenDialog: Dialog['showOpenDialog'];
        showSaveDialog: Dialog['showSaveDialog'];
      };
    };
    core: AsyncifyMethods<{
      api: {
        start: ElekIoCore['api']['start'];
        isRunning: ElekIoCore['api']['isRunning'];
        stop: ElekIoCore['api']['stop'];
      };
      logger: {
        debug: ElekIoCore['logger']['debug'];
        info: ElekIoCore['logger']['info'];
        warn: ElekIoCore['logger']['warn'];
        error: ElekIoCore['logger']['error'];
      };
      user: {
        get: ElekIoCore['user']['get'];
        set: ElekIoCore['user']['set'];
      };
      cloud: {
        reports: {
          create: ElekIoCore['cloud']['reports']['create'];
        };
      };
      projects: {
        create: ElekIoCore['projects']['create'];
        count: ElekIoCore['projects']['count'];
        list: ElekIoCore['projects']['list'];
        read: ElekIoCore['projects']['read'];
        history: ElekIoCore['projects']['history'];
        update: ElekIoCore['projects']['update'];
        getChanges: ElekIoCore['projects']['getChanges'];
        synchronize: ElekIoCore['projects']['synchronize'];
        clone: ElekIoCore['projects']['clone'];
        setRemoteOriginUrl: ElekIoCore['projects']['setRemoteOriginUrl'];
        delete: ElekIoCore['projects']['delete'];
      };
      assets: {
        list: ElekIoCore['assets']['list'];
        create: ElekIoCore['assets']['create'];
        read: ElekIoCore['assets']['read'];
        update: ElekIoCore['assets']['update'];
        delete: ElekIoCore['assets']['delete'];
        save: ElekIoCore['assets']['save'];
      };
      collections: {
        list: ElekIoCore['collections']['list'];
        create: ElekIoCore['collections']['create'];
        read: ElekIoCore['collections']['read'];
        update: ElekIoCore['collections']['update'];
        delete: ElekIoCore['collections']['delete'];
      };
      entries: {
        list: ElekIoCore['entries']['list'];
        create: ElekIoCore['entries']['create'];
        read: ElekIoCore['entries']['read'];
        update: ElekIoCore['entries']['update'];
        delete: ElekIoCore['entries']['delete'];
      };
    }>;
  }
  interface Window {
    ipc: ContextBridgeApi;
  }
}
