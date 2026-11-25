import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { Button } from '@renderer/components/ui/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from '@renderer/components/ui/combobox';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import {
  collectionIcon,
  collectionIconGroups,
  collectionIconWord,
  DEFAULT_COLLECTION_ICON,
  type CollectionIconGroupOption,
  type CollectionIconOption,
} from '@renderer/lib/collectionIcons';
import { cn } from '@renderer/lib/utils';

/**
 * The icon a Collection is stored with, drawn by its name.
 *
 * It is decoration wherever it stands, with the words beside or below it saying
 * what it is about, so it is hidden from screen readers, which is ci's rule for
 * an icon next to a label. A name nothing here can draw takes the mark a
 * Collection is drawn by, see `lib/collectionIcons.ts`.
 */
export function CollectionIcon({
  name,
  className,
}: {
  /** Lucide's name, as Core stored it. */
  name: string;
  className?: string;
}): ReactElement {
  const Icon = collectionIcon(name);

  return <Icon aria-hidden="true" className={className} />;
}

export interface CollectionIconControlProps<
  TFieldValues extends FieldValues,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues>;
  /** The field's label, which the trigger says as its own name. */
  label: string;
  disabled: boolean;
}

/**
 * The control of a Collection's icon: the set in its groups, as a dropdown with
 * a filter.
 *
 * The set is longer than what still reads as a list of radio buttons, so it is
 * the same combobox a select field of many options is, see
 * `fields/select/control.tsx`. The filter matches an icon's word and its
 * group's, so "vehicle" reaches the Car as well, and a group whose icons all
 * filter out drops its label with them.
 *
 * A stored name the set does not hold stays the Value and shows on the trigger
 * as the name itself, so opening these settings and saving them again never
 * swaps a name a developer wrote through Core for one of ours.
 */
export function CollectionIconControl<TFieldValues extends FieldValues>({
  field,
  label,
  disabled,
  className,
  ...controlProps
}: CollectionIconControlProps<TFieldValues>): ReactElement {
  const { t } = useLingui();
  // Base UI's own matching, which goes through `Intl.Collator` rather than
  // comparing lowercased strings.
  const { contains } = ComboboxPrimitive.useFilter();
  const groups = collectionIconGroups();
  const chosenName =
    typeof field.value === 'string' ? field.value : DEFAULT_COLLECTION_ICON;
  // The option that is chosen, out of the very array the list is drawn from, so
  // the item and the Value are one object rather than two that look alike.
  const chosen =
    groups
      .flatMap((group) => group.items)
      .find((option) => option.name === chosenName) ?? null;

  return (
    <Combobox<CollectionIconOption>
      items={groups}
      itemToStringLabel={(option) => option.label}
      value={chosen}
      disabled={disabled}
      filter={(option, query) =>
        contains(option.label, query) || contains(option.group, query)
      }
      onValueChange={(option) => {
        if (option !== null) {
          field.onChange(option.name);
        }
      }}
    >
      <ComboboxTrigger
        {...controlProps}
        className={cn('w-full justify-between', className)}
        ref={field.ref}
        onBlur={field.onBlur}
        // A combobox never takes its name from its own text, so it says what
        // its label says.
        aria-label={label}
        render={<Button variant="outline" />}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CollectionIcon name={chosenName} />
          {/* The longest word of the set still fits the narrowest the field
          gets, and a stored name of a developer's can be longer. */}
          <span className="truncate">{collectionIconWord(chosenName)}</span>
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        {/* The field inside the popup filters the set, and no label stands
        above it, so it keeps its name inside itself, as every filter does. */}
        <ComboboxInput name={t`Filter icons`} showTrigger={false} />
        <ComboboxEmpty>
          <Trans>No icon matches the filter.</Trans>
        </ComboboxEmpty>
        <ComboboxList>
          {(group: CollectionIconGroupOption) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxLabel>{group.label}</ComboboxLabel>
              <ComboboxCollection>
                {(option: CollectionIconOption) => (
                  <ComboboxItem key={option.name} value={option}>
                    <CollectionIcon name={option.name} />
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
