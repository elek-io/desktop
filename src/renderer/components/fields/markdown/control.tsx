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
  /** The field's label, which names the editable element. */
  label: string;
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
 * The control-association props go to the editor rather than onto a wrapper,
 * because the element that takes focus is the editable one inside it, and that
 * is where a screen reader reads the label, the rules, the description and the
 * error. The editor puts them there through ProseMirror's own `attributes`, so
 * nothing reaches into Milkdown's contenteditable.
 */
export function MarkdownControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  label,
  disabled,
  className,
  ...controlProps
}: FormMarkdownFieldProps<TFieldValues>): React.ReactElement {
  return (
    <div ref={field.ref} onBlur={field.onBlur}>
      <MarkdownEditor
        value={isMdAstRoot(field.value) ? field.value : null}
        onChange={field.onChange}
        fieldDefinition={fieldDefinition}
        controlProps={controlProps}
        label={label}
        disabled={disabled}
        className={className}
      />
    </div>
  );
}
