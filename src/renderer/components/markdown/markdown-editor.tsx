import { Trans } from '@lingui/react/macro';
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
import { errorLogAttributes } from '@root/src/shared/logError';
import { CircleAlertIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { cn } from '@renderer/lib/utils';

import { z, type MarkdownFieldDefinition, type MdAstRoot } from '@elek-io/core';

import './markdown-editor.css';
import { MarkdownToolbar } from './markdown-toolbar';
import { docToMdast, mdastToDoc } from './mdast-bridge';
import { buildEditorPlugins } from './plugin-assembly';
import {
  markFormatsPlugin,
  noActiveMarkFormats,
  type ActiveMarkFormats,
} from './plugins/mark-formats';

/**
 * Which way content was crossing the bridge when it failed.
 *
 * `read` is a stored Value the editor could not turn into a document, which
 * leaves the field holding that Value untouched. `write` is a document the
 * editor could not turn into a tree Core accepts, which leaves the field
 * holding the last tree that crossed.
 */
type BridgeDirection = 'read' | 'write';

interface BridgeFailure {
  direction: BridgeDirection;
  error: unknown;
}

/**
 * What the log record says, which is the only place the thrown message goes.
 *
 * Zod stringifies its whole issue list as the message, so only the first
 * issue's own sentence is taken. Nothing of this reaches a screen, see the
 * message below the editor.
 */
function bridgeErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The attributes the field's control props become on the editable element.
 *
 * ProseMirror puts whatever `attributes` holds on the element that takes
 * focus, so the label, the rules, the description and the error all reach the
 * one place a screen reader reads them. `role="textbox"` is what makes
 * `aria-required` and `aria-invalid` allowed there, and `aria-multiline` says
 * the box holds more than one line.
 *
 * A message of the editor's own is named in front of the field's parts, since
 * it stands inside the box rather than below it. A Value the editor could not
 * read takes the read-only state with it, because the box then takes no edit,
 * and a `tabindex`, which a document ProseMirror has stopped making editable
 * would otherwise lose, so the message can still be reached and heard.
 */
function editableAttributes(
  controlProps: FieldControlProps,
  label: string,
  message: { id: string; isValueUnreadable: boolean } | null
): Record<string, string> {
  const describedBy = [message?.id, controlProps['aria-describedby']]
    .filter((part): part is string => part !== undefined)
    .join(' ');

  /* eslint-disable lingui/no-unlocalized-strings -- an ARIA role and the fixed
  values of ARIA states, which read the same in every language */
  return {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    ...(controlProps.id === undefined ? {} : { id: controlProps.id }),
    ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    // Said either way, as the shell says it on every other control: a field
    // that was valid and then is not has to change the state rather than gain
    // it.
    'aria-invalid': String(controlProps['aria-invalid'] === true),
    ...(controlProps['aria-required'] === true
      ? { 'aria-required': 'true' }
      : {}),
    ...(message?.isValueUnreadable === true
      ? { 'aria-readonly': 'true', tabindex: '0' }
      : {}),
  };
  /* eslint-enable lingui/no-unlocalized-strings */
}

export interface MarkdownEditorProps {
  value: MdAstRoot | null;
  onChange: (value: MdAstRoot | null) => void;
  fieldDefinition: MarkdownFieldDefinition;
  /**
   * The id and `aria-*` of the field, placed on the editable element, since
   * that is what takes focus.
   */
  controlProps: FieldControlProps;
  /** The field's label, which names the editable element. */
  label: string;
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
  controlProps,
  label,
  disabled = false,
  className,
}: MarkdownEditorProps): ReactElement => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef<string | null>(null);
  const isHydratedRef = useRef(false);
  // The Value the editor could not read, so it is not read again on every
  // render, and so the failure is logged once rather than once per render.
  const unreadableRef = useRef<string | null>(null);
  const [failure, setFailure] = useState<BridgeFailure | null>(null);
  const [activeFormats, setActiveFormats] =
    useState<ActiveMarkFormats>(noActiveMarkFormats);
  const isValueUnreadable = failure?.direction === 'read';
  const messageId = `${useId()}-message`;
  const message =
    failure === null ? null : { id: messageId, isValueUnreadable };
  // Read inside the plugin and the editor's config, both of which are built
  // once per editor, so the attributes below never go stale.
  const attributesRef = useRef(
    editableAttributes(controlProps, label, message)
  );
  attributesRef.current = editableAttributes(controlProps, label, message);
  // Read inside the editor's config for the same reason, so the box stops
  // taking edits the moment its Value turns out to be unreadable.
  const isValueUnreadableRef = useRef(isValueUnreadable);
  isValueUnreadableRef.current = isValueUnreadable;

  const emit = (ctx: Ctx, doc: Node): void => {
    // Nothing leaves a document that never took the stored Value in: the empty
    // box a failed read leaves behind is not an edit of that Value, and
    // emitting it would replace what is stored with nothing.
    if (isHydratedRef.current === false) {
      return;
    }
    try {
      const root = docToMdast(ctx, doc);
      const key = JSON.stringify(root);
      if (key === lastEmittedRef.current) {
        return;
      }
      lastEmittedRef.current = key;
      setFailure(null);
      onChangeRef.current(root);
    } catch (error) {
      setFailure({ direction: 'write', error });
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
          ctx.set(editorViewOptionsCtx, {
            editable: () => !disabled && !isValueUnreadableRef.current,
            // A function, so every state update puts the field's current
            // attributes on the editable element again.
            attributes: () => attributesRef.current,
          });
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
        .use(buildEditorPlugins(fieldDefinition.features))
        .use(
          markFormatsPlugin(fieldDefinition.features, (formats) => {
            setActiveFormats(formats);
          })
        );
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
    // The same Value failed before, so reading it again would only throw
    // again. It stands until something else arrives in its place.
    if (key === unreadableRef.current) {
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
        unreadableRef.current = null;
        setFailure(null);
      } catch (error) {
        // The Value stays in the form as it is. Nothing is emitted from here
        // on, so leaving the field, typing or saving cannot replace it.
        unreadableRef.current = key;
        setFailure({ direction: 'read', error });
      }
    });
  }, [loading, get, value]);

  // What the bridge threw reaches the log file with its type, message and
  // stack, the way a pane's boundary writes one, since the field itself says
  // none of it. From an effect rather than the render body, so a re-render
  // does not write the same record again.
  useEffect(() => {
    if (failure === null) {
      return;
    }
    const message = bridgeErrorMessage(failure.error);

    void window.ipc.core.logger.error({
      source: 'desktop',
      message:
        failure.direction === 'read'
          ? `Markdown editor could not read the stored Value: ${message}`
          : `Markdown editor could not store its content: ${message}`,
      meta: errorLogAttributes(failure.error),
    });
  }, [failure]);

  // The attributes are a doc decoration ProseMirror recomputes on a state
  // update, so an error that arrives while nothing is typed would otherwise
  // not reach the element. `setProps` asks for that redraw and nothing else.
  // It is also what asks `editable` again, which a Value that turns out to be
  // unreadable answers differently, and the attributes change with it.
  const attributes = JSON.stringify(attributesRef.current);
  useEffect(() => {
    if (loading) {
      return;
    }
    get()?.action((ctx) => {
      ctx.get(editorViewCtx).setProps({});
    });
  }, [loading, get, attributes]);

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
        activeFormats={activeFormats}
        disabled={disabled || loading || isValueUnreadable}
      />
      <Milkdown />
      {failure === null ? null : (
        /* What was thrown says nothing an editor asked about, so it goes to
        the log file and this says what it means for the text instead. The icon
        stands beside the words, as ci's Messages table draws one, so the color
        is not the only thing that says it. */
        <p
          data-slot="markdown-message"
          id={messageId}
          className="flex gap-1.5 border-t border-border p-2 text-sm text-error"
        >
          <CircleAlertIcon aria-hidden className="mt-1 size-3 shrink-0" />
          <span className="flex-1">
            {isValueUnreadable ? (
              <Trans>
                Desktop can&apos;t show this text. It stays saved as it is.
              </Trans>
            ) : (
              <Trans>
                Desktop can&apos;t save this text. Please report it, so we can
                fix it.
              </Trans>
            )}
          </span>
        </p>
      )}
    </div>
  );
};
