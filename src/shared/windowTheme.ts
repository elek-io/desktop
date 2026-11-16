import { z } from 'zod';

/**
 * The only thing the renderer may say about the window's title bar.
 *
 * The window controls are drawn by the system, inside the overlay the main
 * process owns, so they do not follow the `.dark` class the renderer toggles.
 * The renderer therefore tells the main process which theme it resolved to, and
 * the main process looks up the two colors itself.
 *
 * It is a theme name and nothing else on purpose. A channel that took a color,
 * a height or any other `BrowserWindowConstructorOptions` would let the
 * renderer restyle or resize the window, and the renderer is the process that
 * runs content somebody else wrote.
 */
export const windowThemeSchema = z.enum(['light', 'dark']);

export type WindowTheme = z.infer<typeof windowThemeSchema>;
