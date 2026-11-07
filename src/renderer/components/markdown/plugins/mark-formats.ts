import type { Ctx } from '@milkdown/kit/ctx';
import {
  emphasisSchema,
  inlineCodeSchema,
  strongSchema,
} from '@milkdown/kit/preset/commonmark';
import { strikethroughSchema } from '@milkdown/kit/preset/gfm';
import type { MarkType } from '@milkdown/kit/prose/model';
import { Plugin, type EditorState } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

import type { MarkdownFeatures } from '@elek-io/core';

// Which inline formats the cursor or the selection is inside, so the toolbar
// can show a button as pressed while its format is on.
//
// See contributing/renderer/markdown-editor.md.

/** The inline formats a toolbar button turns on and off. */
export interface ActiveMarkFormats {
  strong: boolean;
  emphasis: boolean;
  inlineCode: boolean;
  strikethrough: boolean;
}

/** None of them, which is what an editor that is still loading shows. */
export const noActiveMarkFormats: ActiveMarkFormats = {
  strong: false,
  emphasis: false,
  inlineCode: false,
  strikethrough: false,
};

// Each format's own schema, which is where its mark type comes from, so no
// mark name is written out a second time here. A format the field's features
// leave off registers no schema at all, so its type is never asked for.
const schemaOfFormat = {
  strong: strongSchema,
  emphasis: emphasisSchema,
  inlineCode: inlineCodeSchema,
  strikethrough: strikethroughSchema,
} as const;

/** Whether a mark covers the selection, or sits on the cursor. */
function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;

  if (empty) {
    return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
  }
  return state.doc.rangeHasMark(from, to, type);
}

/**
 * Reports which inline formats are on whenever that answer changes, through
 * ProseMirror's own view update rather than a poll.
 *
 * It is handed the field's features, because a format the field does not allow
 * has no mark type to ask about.
 */
export function markFormatsPlugin(
  features: MarkdownFeatures,
  onChange: (formats: ActiveMarkFormats) => void
): ReturnType<typeof $prose> {
  return $prose((ctx: Ctx) => {
    const types = Object.entries(schemaOfFormat)
      .filter(([format]) => features[format as keyof ActiveMarkFormats])
      .map(([format, schema]) => ({
        format: format as keyof ActiveMarkFormats,
        type: schema.type(ctx),
      }));
    const read = (state: EditorState): ActiveMarkFormats =>
      types.reduce<ActiveMarkFormats>(
        (formats, { format, type }) => ({
          ...formats,
          [format]: isMarkActive(state, type),
        }),
        noActiveMarkFormats
      );
    const isSame = (a: ActiveMarkFormats, b: ActiveMarkFormats): boolean =>
      types.every(({ format }) => a[format] === b[format]);

    return new Plugin({
      view: (view) => {
        let reported = read(view.state);
        onChange(reported);
        return {
          update: (updatedView) => {
            // The reading itself is what a report is skipped on, rather than
            // the document and the selection: turning a format on at a
            // collapsed cursor changes neither of those, only the marks the
            // next typed text takes, and the toolbar has to follow that.
            const formats = read(updatedView.state);
            if (isSame(formats, reported)) {
              return;
            }
            reported = formats;
            onChange(formats);
          },
        };
      },
    });
  });
}
