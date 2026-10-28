import { zodResolver } from '@hookform/resolvers/zod';
import { useId, type ReactElement } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

import { OfComponentsPicker } from '@renderer/components/forms/dynamic-field-definition';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@renderer/components/ui/sheet';
import { useProject } from '@renderer/hooks/useProject';

import {
  dynamicFieldDefinitionSchema,
  type DynamicFieldDefinition,
} from '@elek-io/core';

// The one change a Field definition takes after it was added: a dynamic Field
// can allow more Components, so a page can gain a new kind of section without
// losing the sections it has. Everything else about a definition is add-only,
// see contributing/not-yet-implemented.md.

interface AllowComponentsSheetProps {
  fieldDefinition: DynamicFieldDefinition;
  /**
   * Takes the definition with its grown `ofComponents`. The id and everything
   * else come back untouched, which is what keeps the sections Entries hold:
   * Core matches definitions by id, and a different one reads as a removal plus
   * an addition.
   */
  onAllow: (fieldDefinition: DynamicFieldDefinition) => void;
  onClose: () => void;
}

/**
 * The sheet that grows one dynamic Field's allowed Components.
 *
 * Only growing is offered. Narrowing `ofComponents` deletes every section built
 * from a Component taken away, which Core refuses until the update accepts that
 * loss, and showing what would go is not built yet. So the Components already
 * allowed are listed rather than offered as a control that could be switched
 * off, and a Field whose `ofComponents` is empty already allows every Component
 * of the Project, which leaves nothing to add.
 */
export function AllowComponentsSheet({
  fieldDefinition,
  onAllow,
  onClose,
}: AllowComponentsSheetProps): ReactElement {
  const { translateContent } = useProject();
  const formId = useId();
  // Seeded with the stored definition, so the submit yields it with nothing but
  // ofComponents changed, validated by Core's own schema.
  const form = useForm<DynamicFieldDefinition, unknown, DynamicFieldDefinition>(
    {
      resolver: zodResolver(dynamicFieldDefinitionSchema),
      defaultValues: fieldDefinition,
    }
  );
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  // An empty ofComponents allows every Component of the Project, Core's own
  // rule rather than ours, so such a Field has nothing to add.
  const allowsEveryComponent = fieldDefinition.ofComponents.length === 0;

  const onSubmit: SubmitHandler<DynamicFieldDefinition> = (definition) => {
    onAllow(definition);
  };

  return (
    <Sheet
      open
      onOpenChange={(isOpen) => {
        if (isOpen === false) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Allow more Components on {label}</SheetTitle>
          <SheetDescription>
            A dynamic Field can allow more Components after it was added.
            Nothing else about a Field can be changed yet, and a Component it
            allows cannot be taken away, since that would delete the sections
            built from it.
          </SheetDescription>
        </SheetHeader>

        {allowsEveryComponent ? (
          <SheetBody>
            <p className="text-sm">
              This Field allows every Component of this Project, the ones added
              later included, so there is nothing to add.
            </p>
          </SheetBody>
        ) : (
          <>
            <SheetBody>
              <AppForm id={formId} form={form} onSubmit={onSubmit}>
                <OfComponentsPicker
                  form={form}
                  lockedComponentIds={fieldDefinition.ofComponents}
                />
              </AppForm>
            </SheetBody>

            <SheetFooter>
              <FormActions form={form} id={formId}>
                <SubmitButton className="w-full" requireDirty>
                  Allow these Components
                </SubmitButton>
              </FormActions>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
