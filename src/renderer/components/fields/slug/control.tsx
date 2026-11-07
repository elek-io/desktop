import { Trans } from '@lingui/react/macro';
import { RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import {
  useFormContext,
  useWatch,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Button } from '@renderer/components/ui/button';
import {
  TextControl,
  type FieldControlProps,
} from '@renderer/components/ui/field-controls';
import {
  InputGroup,
  InputGroupAddon,
} from '@renderer/components/ui/input-group';
import { useFieldDefinitions } from '@renderer/hooks/useFieldDefinitions';
import { cn } from '@renderer/lib/utils';

import { slug, type SlugFieldDefinition } from '@elek-io/core';

export interface FormSlugFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: SlugFieldDefinition;
  disabled: boolean;
}

/**
 * Input for slug Values. While the value is untouched (empty or still equal to
 * the last value derived here), it follows the definition's source fields of
 * the same language live. A stored slug is never rewritten, since keeping
 * permalinks stable is the editor's responsibility. Manual input is made
 * canonical on blur and a button re-derives from the sources on demand.
 */
export function SlugControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormSlugFieldProps<TFieldValues>): React.ReactElement {
  const fieldDefinitions = useFieldDefinitions();
  const { control } = useFormContext<TFieldValues>();
  const lastDerivedRef = React.useRef<string | null>(null);

  const slugOptions = {
    separator: fieldDefinition.separator,
    lowercase: fieldDefinition.lowercase,
    decamelize: fieldDefinition.decamelize,
  };

  // Entry forms bind Values as values.<slug>.content.<language>
  const language = field.name.split('.').at(-1) ?? '';

  // Resolve the source ids to sibling Value paths of the same language.
  // Outside an Entry form (no context) there is nothing to derive from.
  const sourcePaths = React.useMemo(
    () =>
      fieldDefinitions === null
        ? []
        : (fieldDefinition.ofFieldDefinitions.flatMap((id) => {
            const source = fieldDefinitions.find(
              (definition) => definition.id === id
            );
            return source === undefined
              ? []
              : // A form field's path, which react-hook-form reads.
                // eslint-disable-next-line lingui/no-unlocalized-strings
                [`values.${source.slug}.content.${language}`];
          }) as FieldPath<TFieldValues>[]),
    [fieldDefinitions, fieldDefinition.ofFieldDefinitions, language]
  );

  const sourceValues = useWatch({ control, name: sourcePaths });
  const derived = slug(
    sourceValues
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter((value) => value !== '')
      .join(' '),
    slugOptions
  );
  const derivedOrNull = derived === '' ? null : derived;

  React.useEffect(() => {
    // A read-only field must not be rewritten when its sources change either,
    // otherwise isDisabled only locks the input and not the value behind it.
    if (sourcePaths.length === 0 || disabled) {
      return;
    }
    const current: unknown = field.value;
    const isUntouched =
      current === null ||
      current === undefined ||
      current === '' ||
      current === lastDerivedRef.current;
    if (isUntouched && current !== derivedOrNull) {
      lastDerivedRef.current = derivedOrNull;
      field.onChange(derivedOrNull);
    }
  }, [field, derivedOrNull, sourcePaths, disabled]);

  return (
    <InputGroup>
      <TextControl
        field={field}
        data-slot="input-group-control"
        disabled={disabled}
        className={cn(
          'flex-1 rounded-none border-0 bg-transparent font-mono shadow-none focus-visible:ring-0 dark:bg-transparent',
          className
        )}
        {...controlProps}
        onBlur={() => {
          field.onBlur();
          // Core only accepts canonical slugs for this field's configuration
          if (typeof field.value === 'string' && field.value !== '') {
            const canonical = slug(field.value, slugOptions);
            if (canonical !== field.value) {
              field.onChange(canonical === '' ? null : canonical);
            }
          }
        }}
        type="text"
      />
      {sourcePaths.length > 0 ? (
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            Icon={RefreshCwIcon}
            onClick={() => {
              lastDerivedRef.current = derivedOrNull;
              field.onChange(derivedOrNull);
            }}
          >
            <span className="sr-only">
              <Trans>Generate from the source Fields</Trans>
            </span>
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
