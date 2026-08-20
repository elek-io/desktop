import { commandsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import {
  downgradeHeadingCommand,
  headingSchema,
  wrapInHeadingCommand,
} from '@milkdown/kit/preset/commonmark';
import { textblockTypeInputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule, $useKeymap } from '@milkdown/kit/utils';

import type { MarkdownHeadingDepth } from '@elek-io/core';

// Milkdown's stock heading input rule and keymap always accept depths 1-6.
// Core validates a markdown value against `features.headings`, so an editor
// that lets a user type `#### ` into a field configured for [2, 3] produces a
// tree Core rejects on save. These replace the stock plugins with versions
// restricted to the configured depths.
//
// See contributing/renderer/markdown-editor.md.

/**
 * Input rule for `#` + space, matching only the configured depths.
 *
 * The allowed depths need not be contiguous, so the pattern is an alternation
 * of exact hash counts (`#{3}|#{2}`) rather than a range. Both ends are
 * anchored and the alternatives are ordered longest first, so `### ` matches
 * the depth-3 branch instead of stopping at a shorter one.
 */
export function restrictedHeadingInputRule(
  allowedDepths: readonly MarkdownHeadingDepth[]
): ReturnType<typeof $inputRule> {
  const pattern = [...allowedDepths]
    .sort((a, b) => b - a)
    .map((depth) => `#{${String(depth)}}`)
    .join('|');
  const regex = new RegExp(`^(?<hashes>${pattern})\\s$`);

  return $inputRule((ctx) =>
    textblockTypeInputRule(regex, headingSchema.type(ctx), (match) => ({
      level: match.groups?.['hashes']?.length,
    }))
  );
}

/**
 * Heading keymap binding Mod-Alt-N only for the configured depths, plus the
 * stock Delete/Backspace downgrade.
 */
export function restrictedHeadingKeymap(
  allowedDepths: readonly MarkdownHeadingDepth[]
): ReturnType<typeof $useKeymap> {
  const depthShortcuts = Object.fromEntries(
    allowedDepths.map((depth) => [
      `TurnIntoH${String(depth)}`,
      {
        shortcuts: `Mod-Alt-${String(depth)}`,
        command: (ctx: Ctx) => {
          const commands = ctx.get(commandsCtx);
          return () => commands.call(wrapInHeadingCommand.key, depth);
        },
      },
    ])
  );

  return $useKeymap('headingKeymap', {
    ...depthShortcuts,
    DowngradeHeading: {
      shortcuts: ['Delete', 'Backspace'],
      command: (ctx: Ctx) => {
        const commands = ctx.get(commandsCtx);
        return () => commands.call(downgradeHeadingCommand.key);
      },
    },
  });
}
