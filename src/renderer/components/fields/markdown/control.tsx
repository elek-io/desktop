import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { MarkdownEditor } from '@renderer/components/markdown/markdown-editor';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';

import type { MarkdownFieldDefinition, MdAstRoot } from '@elek-io/core';

export interface FormMarkdownFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: MarkdownFieldDefinition;
  disabled: boolean;
}

function isMdAstRoot(value: unknown): value is MdAstRoot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'root'
  );
}

/**
 * Thin adapter that binds the Milkdown based MarkdownEditor to a form field.
 * The Value is Core's mdast tree or null when empty.
 *
 * The control-association props land on the wrapper, not the editor, which is a
 * Milkdown contenteditable this must not reach into.
 */
export function MarkdownControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormMarkdownFieldProps<TFieldValues>): React.ReactElement {
  return (
    <div {...controlProps} ref={field.ref} onBlur={field.onBlur}>
      <MarkdownEditor
        value={isMdAstRoot(field.value) ? field.value : null}
        onChange={field.onChange}
        fieldDefinition={fieldDefinition}
        disabled={disabled}
        className={className}
      />
    </div>
  );
}
