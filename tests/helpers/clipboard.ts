import { type ElectronApplication } from '@playwright/test';

/**
 * What the system clipboard holds, read in the main process.
 *
 * The renderer writes it with `navigator.clipboard`, and a spec cannot read it
 * back from there: reading needs a permission Playwright grants through a
 * browser context, and an Electron app has none. Electron's own clipboard
 * module reads the same clipboard from the main process, which is what a
 * person would paste from.
 */
export async function clipboardText(
  electronApp: ElectronApplication
): Promise<string> {
  return electronApp.evaluate(async ({ clipboard }) => clipboard.readText());
}

/**
 * The same text with every line break as a single `\n`.
 *
 * Windows keeps text on the clipboard with CRLF line breaks, so
 * `clipboard.readText()` answers CRLF there for a text the app wrote with LF.
 * That is the platform's own convention for the clipboard rather than anything
 * the app did, so a spec that compares what is on the clipboard with what is
 * on screen reads both through this.
 */
export function withOneLineBreak(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Empties the clipboard, so what a spec reads back afterwards is what the app
 * put there rather than what something else left on it.
 */
export async function clearClipboard(
  electronApp: ElectronApplication
): Promise<void> {
  await electronApp.evaluate(({ clipboard }) => clipboard.clear());
}
