import { Trans, useLingui } from '@lingui/react/macro';
import { PlusIcon, XIcon } from 'lucide-react';
import { useId, type ReactElement, type ReactNode } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { AppField } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { FieldDescription } from '@renderer/components/ui/field';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useListFocus } from '@renderer/hooks/useListFocus';

// The controls more than one field type's settings are built from: a pair of
// bounds, and a list a type takes as rows with Add and Remove.
//
// They hold nothing about a single field type, so a type's folder stays the one
// place that knows about that type. They import no registry either, so a
// folder can build on them, see contributing/renderer/dynamic-form-field-generation.md.

/**
 * Two bounds side by side under one sentence, as ci draws a type's Minimum and
 * Maximum.
 *
 * The sentence stands once, below both, and each control names it, so what a
 * screen reader reads with either of them is what somebody reads under them.
 */
export function DefinitionBounds<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  minName,
  maxName,
  description,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  minName: FieldPath<TFieldValues>;
  maxName: FieldPath<TFieldValues>;
  description: ReactNode;
}): ReactElement {
  const descriptionId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-4">
        <AppField
          form={form}
          name={minName}
          label={<Trans>Minimum</Trans>}
          describedBy={descriptionId}
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
        <AppField
          form={form}
          name={maxName}
          label={<Trans>Maximum</Trans>}
          describedBy={descriptionId}
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
      </div>
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
    </div>
  );
}

/** One thing a list holds or can be given, by the key it is stored under. */
export interface DefinitionChoice {
  /** What is stored, such as a Collection's id or a feature's key. */
  key: string;
  /** What it reads as, which is what the row and the menu entry say. */
  title: string;
}

export interface DefinitionChoiceRowsProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** The path the list sits at, so a refusal of it lands on this field. */
  name: FieldPath<TFieldValues>;
  label: ReactNode;
  /** The label as text, which each row's Remove says it removes from. */
  labelText: string;
  description: ReactNode;
  /** What the list holds now, in the order it is stored. */
  chosen: DefinitionChoice[];
  /** What Add offers, which is everything not chosen yet. */
  offered: DefinitionChoice[];
  /** What Add says, such as "Add Collection". */
  addLabel: string;
  /** What stands in place of the rows while the list is empty. */
  emptyNote: ReactNode;
  /** What stands in place of Add once there is nothing left to add. */
  nothingToAddNote?: ReactNode;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

/**
 * A list a field type takes, as rows with Add and Remove, which is how ci draws
 * every one of them: a select's options, the Collections an Entry field
 * allows, the Components a dynamic field allows, the blocks a markdown field
 * allows and the fields a slug is made from.
 *
 * Add offers what is not in the list yet rather than toggling a row that is
 * already there, so the rows are what the field holds and nothing else.
 *
 * A row is one line with its own Remove, so that Remove is what stands for the
 * row the focus goes to once a row is removed. How many rows a removal takes is
 * the consumer's own: a markdown field's blocks takes Task lists out with
 * Lists, and the focus still lands on a row the list holds, because the place
 * is taken once the list has been drawn again, see `useListFocus`.
 */
export function DefinitionChoiceRows<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  label,
  labelText,
  description,
  chosen,
  offered,
  addLabel,
  emptyNote,
  nothingToAddNote,
  onAdd,
  onRemove,
}: DefinitionChoiceRowsProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const focus = useListFocus();

  return (
    <AppField form={form} name={name} label={label} description={description}>
      {({ controlProps, disabled, readOnly }) => (
        <div
          className="flex flex-col gap-2"
          {...controlProps}
          ref={focus.listRef}
          // The rows and the control that adds one are several controls rather
          // than one, so this is a group named by the field's own label, and
          // it is focusable only to be focused: it is where the focus lands
          // once the last row was removed and nothing else can take it.
          role="group"
          aria-label={labelText}
          tabIndex={-1}
        >
          {chosen.length === 0 ? (
            <p className="text-small text-muted-foreground">{emptyNote}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {chosen.map(({ key, title }, index) => (
                <li
                  key={key}
                  className="flex items-center gap-2 py-1 pr-1 pl-2.5"
                >
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    Icon={XIcon}
                    ref={focus.rowRef}
                    disabled={disabled || readOnly}
                    onClick={() => {
                      onRemove(key);
                      focus.afterRemoval(index);
                    }}
                  >
                    {/* The name says what goes and what it goes from, since a
                    row of icons says nothing on its own. */}
                    <span className="sr-only">
                      {t`Remove ${title} from ${labelText}`}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {offered.length === 0 ? (
            nothingToAddNote === undefined ? null : (
              <p className="text-small text-muted-foreground">
                {nothingToAddNote}
              </p>
            )
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    Icon={PlusIcon}
                    ref={focus.addRef}
                    disabled={disabled || readOnly}
                    className="w-fit"
                  />
                }
              >
                {addLabel}
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent align="start">
                  {offered.map((choice) => (
                    <DropdownMenuItem
                      key={choice.key}
                      onClick={() => onAdd(choice.key)}
                    >
                      {choice.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>
          )}
        </div>
      )}
    </AppField>
  );
}
