import {
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { listenerCtx } from '@milkdown/kit/plugin/listener';
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css';
import type { Node } from '@milkdown/kit/prose/model';
import '@milkdown/kit/prose/tables/style/tables.css';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { cn } from '@renderer/lib/utils';

import { z, type MarkdownFieldDefinition, type MdAstRoot } from '@elek-io/core';

import './markdown-editor.css';
import { MarkdownToolbar } from './markdown-toolbar';
import { docToMdast, mdastToDoc } from './mdast-bridge';
import { buildEditorPlugins } from './plugin-assembly';

// Zod errors stringify their whole issue list as the message, show only the
// first issue's human readable part instead
function bridgeErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export interface MarkdownEditorProps {
  value: MdAstRoot | null;
  onChange: (value: MdAstRoot | null) => void;
  fieldDefinition: MarkdownFieldDefinition;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * WYSIWYG editor for markdown Values. Holds Core's mdast tree, never a
 * markdown string: content enters and leaves through the mdast bridge.
 *
 * It synchronizes instead of being fully controlled - edits flow out through
 * the (debounced) listener plus a blur flush, and an external value change
 * (like the update route's async form reset) is detected by comparing against
 * the last tree this editor emitted itself.
 */
export const MarkdownEditor = (props: MarkdownEditorProps): ReactElement => {
  return (
    <MilkdownProvider>
      <MarkdownEditorInner {...props} />
    </MilkdownProvider>
  );
};

const MarkdownEditorInner = ({
  value,
  onChange,
  fieldDefinition,
  disabled = false,
  className,
}: MarkdownEditorProps): ReactElement => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef<string | null>(null);
  const isHydratedRef = useRef(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const emit = (ctx: Ctx, doc: Node): void => {
    try {
      const root = docToMdast(ctx, doc);
      const key = JSON.stringify(root);
      if (key === lastEmittedRef.current) {
        return;
      }
      lastEmittedRef.current = key;
      setBridgeError(null);
      onChangeRef.current(root);
    } catch (error) {
      setBridgeError(bridgeErrorMessage(error));
    }
  };
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const { get, loading } = useEditor(
    (root) => {
      // A rebuild (disabled toggled) starts from an empty document again
      isHydratedRef.current = false;
      return Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(editorViewOptionsCtx, { editable: () => !disabled });
          ctx
            .get(listenerCtx)
            .updated((listenerCtx_, doc) => {
              emitRef.current(listenerCtx_, doc);
            })
            // The updated listener is debounced, flushing on blur guarantees
            // the form holds the final tree before a submit click lands
            .blur((blurCtx) => {
              emitRef.current(blurCtx, blurCtx.get(editorViewCtx).state.doc);
            });
        })
        .use(buildEditorPlugins(fieldDefinition.features));
    },
    // Rebuilding on disabled changes is fine, content re-hydrates from value
    [disabled]
  );

  // Hydrate the editor once created, and again whenever the value changes
  // from outside (anything but the tree this editor emitted last)
  useEffect(() => {
    if (loading) {
      return;
    }
    const editor = get();
    if (editor === undefined) {
      return;
    }
    const key = JSON.stringify(value);
    if (isHydratedRef.current && key === lastEmittedRef.current) {
      return;
    }
    editor.action((ctx) => {
      try {
        const view = ctx.get(editorViewCtx);
        const transaction =
          value === null
            ? view.state.tr.delete(0, view.state.doc.content.size)
            : view.state.tr.replaceWith(
                0,
                view.state.doc.content.size,
                mdastToDoc(ctx, value).content
              );
        // addToHistory false also keeps the listener from echoing this back
        view.dispatch(transaction.setMeta('addToHistory', false));
        isHydratedRef.current = true;
        lastEmittedRef.current = key;
        setBridgeError(null);
      } catch (error) {
        setBridgeError(bridgeErrorMessage(error));
      }
    });
  }, [loading, get, value]);

  return (
    <div
      className={cn(
        'markdown-editor w-full rounded-md border border-border shadow-xs',
        { 'pointer-events-none opacity-50': disabled },
        className
      )}
    >
      <MarkdownToolbar
        fieldDefinition={fieldDefinition}
        disabled={disabled || loading}
      />
      <Milkdown />
      {bridgeError !== null ? (
        <p className="border-t border-border p-2 text-sm text-error">
          The content could not be read from the editor: {bridgeError}
        </p>
      ) : null}
    </div>
  );
};
