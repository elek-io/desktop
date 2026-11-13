// What an Asset's file is called: the name somebody gave it and the extension
// Core derived from the file's type when it stored it. The two are separate
// fields of an Asset, so the file name is what they make together, and every
// place that shows one asks here.
//
// The save dialog's own name goes through `assetCopyFileName`, because a
// dialog takes a path where the app means a file name. How that one is checked
// on each platform is in contributing/testing.md.

/** An Asset, of what little a file name is made of. */
export interface AssetFileParts {
  name: string;
  /** The extension Core stored, without its dot, such as `jpg`. */
  extension: string;
}

/**
 * Every character Windows or a POSIX file system refuses inside a file name,
 * and the control characters neither of them takes.
 *
 * A control character in the class is what `no-control-regex` warns about, and
 * here it is the point: a name carrying one cannot be written to disk.
 */
// eslint-disable-next-line no-control-regex
const refusedInAFileName = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * What the app calls an Asset: its name with the extension of its file.
 *
 * A name that already ends in that extension keeps it once, so an Asset named
 * after the file it came from is never shown as `logo.png.png`. The comparison
 * ignores case, since `logo.PNG` carries the extension as much as `logo.png`
 * does.
 */
export function assetFileName({ name, extension }: AssetFileParts): string {
  const suffix = `.${extension}`;

  return name.toLowerCase().endsWith(suffix.toLowerCase())
    ? name
    : `${name}${suffix}`;
}

/**
 * The name a save dialog is offered for a copy of an Asset.
 *
 * Electron reads `defaultPath` as a path, so a name holding a slash would
 * reach the dialog as a folder with the name cut short behind it. Every
 * character a file system refuses becomes a dash instead, which keeps the
 * name's length and loses none of it. The extension comes from
 * `assetFileName`, so it is there exactly once.
 */
export function assetCopyFileName(asset: AssetFileParts): string {
  return assetFileName(asset).replace(refusedInAFileName, '-');
}

/**
 * The name an Asset is offered when it is added from a file: the file's own
 * name without its extension, since Core derives the extension from the file
 * itself.
 *
 * Both separators are cut, because the path comes from the system's file dialog
 * and a Windows one is written with backslashes. A name that is nothing but an
 * extension, such as `.gitignore`, keeps it, since dropping it would leave
 * nothing to offer.
 */
export function assetNameFromFilePath(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? '';
  const extensionAt = fileName.lastIndexOf('.');

  return extensionAt > 0 ? fileName.slice(0, extensionAt) : fileName;
}
