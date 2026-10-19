import { app, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import Path from 'path';

import { cloudTokenSchema, type default as ElekIoCore } from '@elek-io/core';

import type { CloudAccountHandlers } from '../shared/cloudAccount.js';

/**
 * Asks Chromium for the Secret Service on Linux desktops it does not know.
 *
 * Chromium picks a keyring by `XDG_CURRENT_DESKTOP`. On a desktop it does not
 * know, such as niri, sway or Hyprland, it falls back to `basic_text` even
 * when gnome-keyring or KeePassXC runs, and Desktop counts `basic_text` as no
 * encryption. KDE keeps KWallet, and a `--password-store` passed at launch
 * wins. Must run before the app is ready.
 *
 * See contributing/cloud-account.md.
 */
export function preferSecretServiceOnLinux(): void {
  if (process.platform !== 'linux') {
    return;
  }
  if (app.commandLine.hasSwitch('password-store')) {
    return;
  }
  const desktops = (process.env['XDG_CURRENT_DESKTOP'] ?? '')
    .split(':')
    .map((desktop) => desktop.toUpperCase());
  if (desktops.includes('KDE')) {
    return;
  }
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}

/** What reading the stored token came to */
export interface StoredToken {
  token: string | null;
  /** Why a stored token could not be used, for the log */
  problem?: unknown;
}

/**
 * Keeps the token of the elek.io Cloud session across restarts.
 *
 * The token is encrypted with Electron's safeStorage and written under
 * Electron's userData, never into Core's data directory, which sits in
 * people's backups. Without encryption nothing is written, so the session
 * lasts until Desktop quits. On Linux `basic_text` counts as no encryption,
 * since its key is the same on every machine.
 *
 * See contributing/cloud-account.md.
 */
export class CloudTokenStore {
  private readonly path: string;

  constructor(userDataPath: string) {
    this.path = Path.join(userDataPath, 'cloud-session');
  }

  /** Whether a token can be stored encrypted on this system right now */
  get canEncrypt(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Reads the stored token back. A token that cannot be decrypted, or does not
   * read as one Core accepts, is deleted, because Core would refuse to start
   * with it. One stored while a keyring was there is kept when the keyring is
   * missing now, so a keyring that comes back still finds it.
   */
  async load(): Promise<StoredToken> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.path);
    } catch (error) {
      if (isMissingFile(error)) {
        return { token: null };
      }
      return { token: null, problem: error };
    }

    if (this.canEncrypt === false) {
      return {
        token: null,
        problem: new Error(
          'A stored elek.io Cloud session exists, but no keyring can decrypt it now'
        ),
      };
    }

    try {
      const token = cloudTokenSchema.parse(
        safeStorage.decryptString(encrypted)
      );
      return { token };
    } catch (error) {
      await this.clear();
      return { token: null, problem: error };
    }
  }

  /**
   * Stores `token` encrypted, or deletes a stored one and answers `memory`
   * when this system cannot encrypt. Core keeps the token in memory either way.
   */
  async save(token: string): Promise<'stored' | 'memory'> {
    if (this.canEncrypt === false) {
      await this.clear();
      return 'memory';
    }
    await writeFile(this.path, safeStorage.encryptString(token), {
      mode: 0o600,
    });
    return 'stored';
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * The account calls the renderer reaches over IPC. The password crosses IPC
 * once, into these, and the token never goes back: the calls that answer a
 * session hand the renderer the account only.
 */
export function cloudAccountHandlers(core: ElekIoCore): CloudAccountHandlers {
  const account = core.cloud.account;

  return {
    signUp: async (props) => {
      const result = await account.signUp(props);
      return result.outcome === 'session'
        ? { outcome: 'session', account: result.account }
        : { outcome: 'verification' };
    },
    signIn: async (props) => {
      const session = await account.signIn(props);
      return { account: session.account };
    },
    signOut: async () => account.signOut(),
    read: async () => account.read(),
    hasToken: () => account.hasToken,
  };
}
