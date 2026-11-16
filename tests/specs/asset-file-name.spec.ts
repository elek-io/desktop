import { expect, test } from '@playwright/test';

import {
  assetCopyFileName,
  assetFileName,
  assetNameFromFilePath,
} from '../../src/renderer/lib/assetFile.js';

/**
 * What an Asset's file is called, shape by shape.
 *
 * The names are driven here rather than through the screen, which needs a
 * Project, a window and a file of that very type per shape, and a stored name
 * holding a character no file system takes cannot be arranged through Core at
 * all, since Core slugifies what it is given. That the offered name reaches the
 * save dialog, and that the dialog is handed one filter and no properties, is
 * what the Assets spec drives in the app. The panel itself is the hand check in
 * contributing/testing.md.
 */

/** One Asset, and what the app calls its file. */
const shown: {
  what: string;
  asset: { name: string; extension: string };
  is: string;
}[] = [
  {
    what: 'a name and the extension Core derived from the file',
    asset: { name: 'showroom', extension: 'jpg' },
    is: 'showroom.jpg',
  },
  {
    what: 'a name that already ends in that extension, which is not doubled',
    asset: { name: 'showroom.jpg', extension: 'jpg' },
    is: 'showroom.jpg',
  },
  {
    what: 'the same spelled in capitals, since a file system ignores case',
    asset: { name: 'showroom.JPG', extension: 'jpg' },
    is: 'showroom.JPG',
  },
  {
    what: 'a name ending in another extension, which keeps both',
    asset: { name: 'showroom.png', extension: 'jpg' },
    is: 'showroom.png.jpg',
  },
  {
    what: 'a name holding a dot that is no extension',
    asset: { name: 'price-list-2026.v2', extension: 'pdf' },
    is: 'price-list-2026.v2.pdf',
  },
  {
    what: 'the extension mime hands back for a QuickTime file',
    asset: { name: 'spring-campaign', extension: 'qt' },
    is: 'spring-campaign.qt',
  },
];

/**
 * A name a file system refuses, and the name the save dialog is offered for a
 * copy of it. Each refused character becomes a dash, so nothing of the name is
 * cut and the extension stays where it is.
 */
const offered: {
  what: string;
  asset: { name: string; extension: string };
  is: string;
}[] = [
  {
    what: 'a slash, which Electron would read as a folder',
    asset: { name: 'spring/summer', extension: 'jpg' },
    is: 'spring-summer.jpg',
  },
  {
    what: 'a backslash, which Windows reads as one',
    asset: { name: 'spring\\summer', extension: 'jpg' },
    is: 'spring-summer.jpg',
  },
  {
    what: 'a leading slash, which would make it an absolute path',
    asset: { name: '/etc/showroom', extension: 'png' },
    is: '-etc-showroom.png',
  },
  {
    what: 'a drive letter, which Windows reads as a path of its own',
    asset: { name: 'C:showroom', extension: 'png' },
    is: 'C-showroom.png',
  },
  {
    what: 'the other characters Windows refuses in a file name',
    asset: { name: 'a<b>c"d|e?f*g', extension: 'png' },
    is: 'a-b-c-d-e-f-g.png',
  },
  {
    what: 'a control character, which neither system writes',
    asset: { name: 'spring\u0000summer\u001f', extension: 'png' },
    is: 'spring-summer-.png',
  },
  {
    what: 'a name ending in the extension, which is still not doubled',
    asset: { name: 'spring/summer.jpg', extension: 'jpg' },
    is: 'spring-summer.jpg',
  },
  {
    what: 'an extension that is no extension, which is cleaned too',
    asset: { name: 'showroom', extension: 'a/b' },
    is: 'showroom.a-b',
  },
  {
    what: 'a name that is nothing but refused characters, which keeps a name',
    asset: { name: '///', extension: 'png' },
    is: '---.png',
  },
];

/** A file that was picked, and the name the Asset is offered for it. */
const fromFile: { what: string; path: string; is: string }[] = [
  {
    what: 'a POSIX path',
    path: '/home/mara/pictures/showroom-evening.jpg',
    is: 'showroom-evening',
  },
  {
    what: 'a Windows path',
    path: 'C:\\Users\\mara\\Pictures\\showroom-evening.jpg',
    is: 'showroom-evening',
  },
  {
    what: 'a file with no extension',
    path: '/home/mara/pictures/showroom',
    is: 'showroom',
  },
  {
    what: 'a file that is nothing but an extension, which keeps it',
    path: '/home/mara/.gitignore',
    is: '.gitignore',
  },
  {
    what: 'a name holding more than one dot, of which the last ends it',
    path: '/home/mara/price-list.2026.pdf',
    is: 'price-list.2026',
  },
];

test.describe('An Asset’s file name', () => {
  for (const shape of shown) {
    test(`shows ${shape.what}`, () => {
      expect(assetFileName(shape.asset)).toBe(shape.is);
    });
  }

  for (const shape of offered) {
    test(`offers a copy of ${shape.what}`, () => {
      expect(assetCopyFileName(shape.asset)).toBe(shape.is);

      // Nothing a dialog would read as a path is left, which is what keeps a
      // name whole on every platform.
      expect(assetCopyFileName(shape.asset)).not.toMatch(/[/\\]/);
      // And the name keeps its length, so none of it was cut short.
      expect(assetCopyFileName(shape.asset).length).toBe(
        assetFileName(shape.asset).length
      );
    });
  }

  for (const shape of fromFile) {
    test(`is offered for ${shape.what}`, () => {
      expect(assetNameFromFilePath(shape.path)).toBe(shape.is);
    });
  }
});
