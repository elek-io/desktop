import { z } from 'zod';

/**
 * Whether the window still holds something nobody saved.
 *
 * Only the renderer knows it, since a form lives there, so it tells the main
 * process whenever that changes. The main process holds a close while this is
 * true, so the question is asked inside the window rather than in a native box,
 * which could neither name the page nor draw ci's own buttons.
 *
 * It is one boolean and nothing else, for the same reason the title bar theme
 * is one theme name: the renderer runs content somebody else wrote, so it never
 * hands the main process a window option.
 */
export const unsavedChangesSchema = z.boolean();

/**
 * What the renderer answers once somebody answered the question.
 *
 * `discard` lets go of what was typed, and the main process closes the window
 * or quits. `keep` leaves both the window and the changes alone.
 */
export const windowCloseAnswerSchema = z.enum(['discard', 'keep']);

export type WindowCloseAnswer = z.infer<typeof windowCloseAnswerSchema>;
