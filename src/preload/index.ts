// // See the Electron documentation for details on how to use preload scripts:
// // https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { electronAPI } from '@electron-toolkit/preload';
import {
  type BaseWindow,
  contextBridge,
  ipcRenderer,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';

const ipc: ContextBridgeApi = {
  electron: {
    process: electronAPI.process,
    dialog: {
      showOpenDialog: async (
        windowOrOptions: BaseWindow | OpenDialogOptions,
        options?: OpenDialogOptions
      ) =>
        ipcRenderer.invoke(
          'electron:dialog:showOpenDialog',
          windowOrOptions,
          options
        ),
      showSaveDialog: async (
        windowOrOptions: BaseWindow | SaveDialogOptions,
        options?: SaveDialogOptions
      ) =>
        ipcRenderer.invoke(
          'electron:dialog:showSaveDialog',
          windowOrOptions,
          options
        ),
    },
  },
  core: {
    api: {
      start: async (...args) => ipcRenderer.invoke('core:api:start', ...args),
      isRunning: async (...args) =>
        ipcRenderer.invoke('core:api:isRunning', ...args),
      stop: async (...args) => ipcRenderer.invoke('core:api:stop', ...args),
    },
    logger: {
      debug: async (...args) =>
        ipcRenderer.invoke('core:logger:debug', ...args),
      info: async (...args) => ipcRenderer.invoke('core:logger:info', ...args),
      warn: async (...args) => ipcRenderer.invoke('core:logger:warn', ...args),
      error: async (...args) =>
        ipcRenderer.invoke('core:logger:error', ...args),
    },
    user: {
      get: async (...args) => ipcRenderer.invoke('core:user:get', ...args),
      set: async (...args) => ipcRenderer.invoke('core:user:set', ...args),
    },
    cloud: {
      reports: {
        create: async (...args) =>
          ipcRenderer.invoke('core:cloud:reports:create', ...args),
      },
    },
    projects: {
      count: async (...args) =>
        ipcRenderer.invoke('core:projects:count', ...args),
      create: async (...args) =>
        ipcRenderer.invoke('core:projects:create', ...args),
      list: async (...args) =>
        ipcRenderer.invoke('core:projects:list', ...args),
      read: async (...args) =>
        ipcRenderer.invoke('core:projects:read', ...args),
      history: async (...args) =>
        ipcRenderer.invoke('core:projects:history', ...args),
      update: async (...args) =>
        ipcRenderer.invoke('core:projects:update', ...args),
      getChanges: async (...args) =>
        ipcRenderer.invoke('core:projects:getChanges', ...args),
      synchronize: async (...args) =>
        ipcRenderer.invoke('core:projects:synchronize', ...args),
      clone: async (...args) =>
        ipcRenderer.invoke('core:projects:clone', ...args),
      setRemoteOriginUrl: async (...args) =>
        ipcRenderer.invoke('core:projects:setRemoteOriginUrl', ...args),
      delete: async (...args) =>
        ipcRenderer.invoke('core:projects:delete', ...args),
    },
    assets: {
      list: async (...args) => ipcRenderer.invoke('core:assets:list', ...args),
      create: async (...args) =>
        ipcRenderer.invoke('core:assets:create', ...args),
      read: async (...args) => ipcRenderer.invoke('core:assets:read', ...args),
      update: async (...args) =>
        ipcRenderer.invoke('core:assets:update', ...args),
      delete: async (...args) =>
        ipcRenderer.invoke('core:assets:delete', ...args),
      save: async (...args) => ipcRenderer.invoke('core:assets:save', ...args),
    },
    collections: {
      list: async (...args) =>
        ipcRenderer.invoke('core:collections:list', ...args),
      create: async (...args) =>
        ipcRenderer.invoke('core:collections:create', ...args),
      read: async (...args) =>
        ipcRenderer.invoke('core:collections:read', ...args),
      update: async (...args) =>
        ipcRenderer.invoke('core:collections:update', ...args),
      delete: async (...args) =>
        ipcRenderer.invoke('core:collections:delete', ...args),
    },
    entries: {
      list: async (...args) => ipcRenderer.invoke('core:entries:list', ...args),
      create: async (...args) =>
        ipcRenderer.invoke('core:entries:create', ...args),
      read: async (...args) => ipcRenderer.invoke('core:entries:read', ...args),
      update: async (...args) =>
        ipcRenderer.invoke('core:entries:update', ...args),
      delete: async (...args) =>
        ipcRenderer.invoke('core:entries:delete', ...args),
    },
  },
};

contextBridge.exposeInMainWorld('ipc', ipc);
