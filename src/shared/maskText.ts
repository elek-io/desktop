import { z } from 'zod';

/**
 * The one thing the renderer may hand the main process to be masked: a text.
 *
 * Core's masking rules read the home directory of the process they run in, so
 * the call lives where Core runs, which is the main process (see Core's usage
 * docs). The renderer composes the text it wants to show, sends it over, and
 * shows what comes back.
 *
 * It is one string and nothing else, for the same reason the title bar theme is
 * one theme name: the renderer runs content somebody else wrote, so it hands
 * the main process no shape it would have to walk.
 */
export const maskableTextSchema = z.string();
