import { expect, type Page } from '@playwright/test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';

import { test } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

// These callbacks run in the renderer (`Image`, `location`, `open`) or in the
// main process (`__openExternalCalls`). The test tsconfig has no DOM lib on
// purpose (it also type-checks the Node processes), so declare just the slivers
// used here, module-scoped, instead of pulling all of lib.dom into the check.
declare const Image: new () => {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  src: string;
};
declare const location: { assign(url: string): void };
declare const open: (url: string, target?: string) => unknown;
declare global {
  // Records the URLs the main-process shell.openExternal stub was handed.
  var __openExternalCalls: string[] | undefined;
}

/**
 * Build a custom-protocol URL from a native path, mirroring AssetDisplay's
 * `toLocalFileSrc`: forward slashes with a leading slash for the empty
 * authority, so a Windows drive path parses as a path and not a host, then
 * percent-encode each segment so a URL-significant character in the path (`#`,
 * `?`, `%`) survives the round-trip instead of truncating it.
 */
function toLocalFileUrl(nativePath: string): string {
  const forwardSlashed = nativePath.replace(/\\/g, '/');
  const withLeadingSlash = forwardSlashed.startsWith('/')
    ? forwardSlashed
    : `/${forwardSlashed}`;
  const encodedPath = withLeadingSlash
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `elek-io-local-file://${encodedPath}`;
}

/**
 * Load a URL as an image inside the renderer and report whether it served.
 *
 * `fetch()` cannot reach a custom scheme that is not registered with
 * `supportFetchAPI`, but `<img>` can (the app CSP lists `elek-io-local-file:`
 * under `img-src`), and that is the exact surface the preview uses. A served
 * image decodes to a non-zero `naturalWidth`, a handler rejection (403) fires
 * `onerror`. So the target of every "forbidden" case is a real PNG: if the
 * guard leaks, the image decodes and the assertion catches it.
 */
async function protocolServes(page: Page, url: string): Promise<boolean> {
  return page.evaluate(async (target) => {
    return new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = target;
    });
  }, url);
}

test.describe('Main-process security', () => {
  test.describe('Renderer process isolation', () => {
    test('exposes only window.ipc, not node or the raw IPC bridge', async ({
      mainWindow,
    }) => {
      const exposure = await mainWindow.evaluate(() => ({
        ipc: 'ipc' in globalThis,
        require: 'require' in globalThis,
        module: 'module' in globalThis,
        ipcRenderer: 'ipcRenderer' in globalThis,
      }));

      // contextIsolation + nodeIntegration:false + sandbox keep node and the raw
      // ipcRenderer out of the renderer's main world; only the frozen
      // `window.ipc` bridge from the preload is reachable.
      expect(exposure).toEqual({
        ipc: true,
        require: false,
        module: false,
        ipcRenderer: false,
      });
    });
  });

  test.describe('In-window navigation guard', () => {
    test('blocks navigation to an untrusted external origin', async ({
      mainWindow,
    }) => {
      const appUrl = mainWindow.url();
      const appDocument = appUrl.split('#')[0];
      expect(appUrl).not.toContain('example.com');

      // A same-window navigation off the app fires will-navigate, which the
      // guard preventDefaults for any origin not on the internal allow-list
      // (empty in production).
      await mainWindow.evaluate(() => {
        location.assign('https://example.com/');
      });
      // Give any (blocked) navigation time to have happened, then assert the
      // window never left the app document.
      await mainWindow.waitForTimeout(750);

      expect(mainWindow.url().startsWith(appDocument ?? appUrl)).toBe(true);
      expect(mainWindow.url()).not.toContain('example.com');

      // A navigation started while the app is still loading makes Electron
      // reject that load, which used to end the app right after the checks
      // above. The fixture skips its own checks on a closed window and would
      // hide that, so assert here that our document still runs. Not through a
      // web-first assertion like toHaveTitle, which waits for the blocked
      // navigation to finish and never sees it do so.
      expect(await mainWindow.evaluate(() => 'ipc' in globalThis)).toBe(true);
    });
  });

  test.describe('External links and new windows', () => {
    test('denies window.open and sends only allowed hosts to the OS browser', async ({
      mainWindow,
      electronApp,
    }) => {
      // Stub shell.openExternal in main so no real browser opens and we can
      // observe which URLs the handler forwarded. setWindowOpenHandler reads
      // shell.openExternal at call time, so reassigning it here intercepts.
      await electronApp.evaluate(({ shell }) => {
        globalThis.__openExternalCalls = [];
        shell.openExternal = async (url) => {
          globalThis.__openExternalCalls?.push(url);
          return Promise.resolve();
        };
      });

      const windowCountBefore = electronApp.windows().length;

      // github.com is on the external allow-list, so it is denied as a new
      // in-app window but forwarded to the OS browser.
      await mainWindow.evaluate(() => {
        open('https://github.com/elek-io/desktop', '_blank');
      });
      // An untrusted host is denied outright and never forwarded.
      await mainWindow.evaluate(() => {
        open('https://evil.example/', '_blank');
      });

      await expect
        .poll(async () =>
          electronApp.evaluate(() => globalThis.__openExternalCalls ?? [])
        )
        .toContain('https://github.com/elek-io/desktop');

      const calls = await electronApp.evaluate(
        () => globalThis.__openExternalCalls ?? []
      );
      expect(calls.some((url) => url.includes('evil.example'))).toBe(false);

      // Neither open() spawned an in-app window: the handler denies every one.
      expect(electronApp.windows()).toHaveLength(windowCountBefore);
    });
  });

  test.describe('Custom file protocol', () => {
    // The forbidden cases below deliberately request paths the handler rejects
    // with 403, which the renderer logs as a failed <img> load. Tolerate exactly
    // that message so the fixture's strict console check still catches anything
    // else.
    test.use({
      allowedConsoleErrors: {
        patterns: [
          'Failed to load resource: the server responded with a status of 403 (Forbidden)',
        ],
      },
    });

    test('serves files inside the Project and rejects everything outside it', async ({
      mainWindow,
    }, testInfo) => {
      await setUserViaIpc(mainWindow);
      const project = await createProjectViaIpc(mainWindow);
      const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
      const asset = await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath,
      });

      // Allowed: the Asset's own file, inside the Project, serves. This is the
      // path the preview <img> loads, so gate the rest on it with a hard assert.
      expect(
        await protocolServes(mainWindow, toLocalFileUrl(asset.absolutePath))
      ).toBe(true);

      // The Project's `projects` directory, derived from the Asset path, anchors
      // the traversal and sibling cases below.
      const segments = asset.absolutePath.split(/[/\\]/);
      const projectsDir = segments
        .slice(0, segments.indexOf('projects') + 1)
        .join('/');

      // A real PNG in a sibling of `projects` (`projects-evil`), outside both
      // the Projects and tmp directories. Every forbidden case below targets it,
      // so a leak shows up as a decoded image rather than a silent non-image
      // miss.
      const siblingDir = `${projectsDir}-evil`;
      mkdirSync(siblingDir, { recursive: true });
      const siblingFile = `${siblingDir}/secret.png`;
      writeFileSync(siblingFile, pngBytes);

      // Soft asserts so every leak is reported together, not just the first.

      // Forbidden: a real image written outside the data directory.
      const outsidePath = makeTempFile(testInfo, 'outside.png', pngBytes);
      expect
        .soft(await protocolServes(mainWindow, toLocalFileUrl(outsidePath)))
        .toBe(false);

      // Forbidden: a sibling directory that shares the Projects path as a bare
      // string prefix (`projects` vs `projects-evil`) but is not inside it.
      expect
        .soft(await protocolServes(mainWindow, toLocalFileUrl(siblingFile)))
        .toBe(false);

      // Forbidden: a literal `..` traversal out of Projects into the sibling.
      // The URL layer collapses the segment before the handler sees it, but the
      // collapsed path still shares the `projects` prefix.
      expect
        .soft(
          await protocolServes(
            mainWindow,
            `${toLocalFileUrl(projectsDir)}/../projects-evil/secret.png`
          )
        )
        .toBe(false);

      // Forbidden: a percent-encoded `..` traversal into the sibling. The URL
      // layer leaves `%2e%2e` intact, so only normalizing the decoded path (not
      // a bare prefix check) catches it.
      expect
        .soft(
          await protocolServes(
            mainWindow,
            `${toLocalFileUrl(projectsDir)}/%2e%2e/projects-evil/secret.png`
          )
        )
        .toBe(false);

      // Fail closed: a URL with a host part is not a valid local file path and
      // must never resolve to a served file.
      expect
        .soft(
          await protocolServes(
            mainWindow,
            'elek-io-local-file://evil-host/secret.png'
          )
        )
        .toBe(false);
    });

    test('serves a file whose path contains URL-significant characters', async ({
      mainWindow,
    }, testInfo) => {
      await setUserViaIpc(mainWindow);
      const project = await createProjectViaIpc(mainWindow);
      const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
      const asset = await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath,
      });

      const segments = asset.absolutePath.split(/[/\\]/);
      const projectsDir = segments
        .slice(0, segments.indexOf('projects') + 1)
        .join('/');

      // A real PNG inside the Projects directory whose name carries characters
      // that are significant in a URL: `#` starts a fragment, a raw `%` starts a
      // broken escape, and a space is not URL-safe. Such a path reaches the
      // renderer when the OS profile folder the data directory sits under
      // contains one (`C:\Users\a#b`). Serving it only works if toLocalFileUrl
      // percent-encodes each segment, so the handler decodes the exact on-disk
      // name back. `?` is left out since Windows forbids it in a filename.
      const specialFile = `${projectsDir}/name #1 100% off.png`;
      writeFileSync(specialFile, pngBytes);

      expect(
        await protocolServes(mainWindow, toLocalFileUrl(specialFile))
      ).toBe(true);
    });

    test('rejects a symlinked asset whose target escapes the Project', async ({
      mainWindow,
    }, testInfo) => {
      await setUserViaIpc(mainWindow);
      const project = await createProjectViaIpc(mainWindow);
      const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
      const asset = await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath,
      });

      const segments = asset.absolutePath.split(/[/\\]/);
      const projectsDir = segments
        .slice(0, segments.indexOf('projects') + 1)
        .join('/');

      // A real PNG outside the data directory, and a symlink inside `projects`
      // pointing at it. The link's own path is lexically inside the Project, so
      // it passes a textual containment check, but its target is not. A
      // git-backed Project can arrive from an untrusted source carrying exactly
      // such a link (git stores symlinks), so the handler must resolve it and
      // reject the escape rather than follow it and serve the target.
      const target = makeTempFile(testInfo, 'symlink-target.png', pngBytes);
      const linkPath = `${projectsDir}/escaping-asset.png`;
      let linked = false;
      try {
        symlinkSync(target, linkPath);
        linked = true;
      } catch {
        // Some platforms (Windows without the symlink privilege) cannot create
        // one, so skip rather than pass vacuously.
      }
      test.skip(!linked, 'symlink creation is not permitted on this platform');

      expect(await protocolServes(mainWindow, toLocalFileUrl(linkPath))).toBe(
        false
      );
    });
  });
});
