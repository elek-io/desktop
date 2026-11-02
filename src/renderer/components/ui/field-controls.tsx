import * as React from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { Input } from '@renderer/components/ui/input';
import { Switch } from '@renderer/components/ui/switch';
import { Textarea } from '@renderer/components/ui/textarea';
import { numberFromInput, textFromInput } from '@renderer/lib/fieldValues';

// The value-typed controls more than one field type and more than one
// hand-written form share. What a single field type knows stays in its own
// folder, see components/fields/. Each control places the control-association
// props on its real focusable element, so a label, a description and an error
// always point at something a user can focus.
//
// See contributing/renderer/forms.md.

/**
 * Control-association props a control spreads onto its real input, so the
 * label's `htmlFor`, the description and the error all point at a focusable
 * element. `aria-required` rides along on the same bag, since no field emits
 * the native `required`.
 */
export interface FieldControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  className?: string;
}

export interface TextControlProps<
  TFieldValues extends FieldValues,
> extends Omit<React.ComponentProps<'input'>, 'type'> {
  field: ControllerRenderProps<TFieldValues>;
  /** The HTML input type, which a field type's own folder decides. */
  type: React.ComponentProps<'input'>['type'];
  /**
   * How the typed text becomes the Value's content. A numeric input yields a
   * number and every other one text, which is the contract an input carries
   * rather than anything a field type decides.
   */
  transform?: (value: string) => unknown;
}

/**
 * A text input bound to one Value. It owns the one contract every scalar Value
 * shares: an empty input is `null`, never an empty string.
 */
export function TextControl<TFieldValues extends FieldValues>({
  field,
  type,
  transform = type === 'number' ? numberFromInput : textFromInput,
  ...props
}: TextControlProps<TFieldValues>): React.ReactElement {
  return (
    <Input
      type={type}
      // A numeric input steps by whole numbers unless it is told otherwise,
      // which marks a decimal somebody typed as a step mismatch and snaps the
      // spinner past it. zod is the sole validator here, so the input carries
      // no bound of its own and leaves the step open, see
      // contributing/renderer/forms.md#form-invariants.
      {...(type === 'number' ? { step: 'any' } : {})}
      {...field}
      // Content can be null (cleared) or undefined (language absent from the
      // partial record); the input needs a string either way
      value={field.value ?? ''}
      onChange={(event) => field.onChange(transform(event.target.value))}
      {...props}
    />
  );
}

export interface TextareaControlProps<
  TFieldValues extends FieldValues,
> extends React.ComponentProps<'textarea'> {
  field: ControllerRenderProps<TFieldValues>;
}

/** A multi-line text input bound to one Value, with the same null contract. */
export function TextareaControl<TFieldValues extends FieldValues>({
  field,
  ...props
}: TextareaControlProps<TFieldValues>): React.ReactElement {
  return (
    <Textarea
      {...field}
      value={field.value ?? ''}
      onChange={(event) => field.onChange(textFromInput(event.target.value))}
      {...props}
    />
  );
}

export interface SwitchControlProps<
  TFieldValues extends FieldValues,
> extends React.ComponentProps<typeof Switch> {
  field: ControllerRenderProps<TFieldValues>;
}

/** A switch bound to one boolean Value. */
export function SwitchControl<TFieldValues extends FieldValues>({
  field,
  ...props
}: SwitchControlProps<TFieldValues>): React.ReactElement {
  return (
    <Switch
      {...field}
      checked={field.value}
      onCheckedChange={field.onChange}
      {...props}
    />
  );
}
