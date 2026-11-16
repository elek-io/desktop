import { Trans } from '@lingui/react/macro';
import { Plus } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';

import {
  authorableFieldTypes,
  fieldModule,
  fieldTypesForbiddenInComponents,
} from '@renderer/components/fields';
import { type FieldDefinitionsOwner } from '@renderer/components/forms/default-field-definition-form';
import { type DefinitionDraftProps } from '@renderer/components/forms/field-definition-draft';
import { SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@renderer/components/ui/sheet';

import {
  fieldTypeSchema,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type FieldType,
  type Project,
} from '@elek-io/core';

// The select reads the label of the chosen field type from here.
const fieldTypeItems: Record<string, string> = Object.fromEntries(
  fieldTypeSchema.options.map((option) => [option, option])
);

// The Add Field sheet: a field-type picker, the matching registry entry rendered
// in the body, and one detached SubmitButton in the footer.
//
// See contributing/renderer/dynamic-form-field-generation.md.

interface AddFieldSheetProps {
  project: Project;
  // Which object the field is added to. It names the sheet and decides which
  // field types the picker offers.
  owner: FieldDefinitionsOwner;
  // Read only, for the duplicate-slug guard and the slug source list. Edits go
  // through onAppend.
  fieldDefinitions: FieldDefinitionOrGroup[];
  onAppend: (definition: FieldDefinition) => void;
}

export function AddFieldSheet({
  project,
  owner,
  fieldDefinitions,
  onAppend,
}: AddFieldSheetProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>(
    // The type the picker opens on, which is a Core field type rather than a
    // word.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    'text'
  );
  const addFieldFormId = useId();
  // A plain state control, not a react-hook-form field, so it uses a bare Label
  // and Select and wires its own ids.
  const inputTypeId = useId();
  const inputTypeHintId = useId();

  const supportedLanguages = project.settings.language.supported;
  const defaultLanguage = project.settings.language.default;

  const existingSlugs = fieldDefinitions.flatMap((definition) =>
    'isGroup' in definition
      ? definition.fieldDefinitions.map((member) => member.slug)
      : [definition.slug]
  );

  const onAdd = (definition: FieldDefinition): void => {
    onAppend(definition);
    setIsOpen(false);
  };

  const draftProps: DefinitionDraftProps = {
    id: addFieldFormId,
    existingSlugs,
    fieldDefinitions,
    supportedLanguages,
    defaultLanguage,
    owner,
    onAdd,
  };

  // A type is offered unless the client cannot author it at all, or the object
  // it would be added to cannot hold it.
  const isUnavailable = (fieldType: FieldType): boolean =>
    authorableFieldTypes.has(fieldType) === false ||
    (owner === 'component' && fieldTypesForbiddenInComponents.has(fieldType));

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        render={
          <Button
            Icon={Plus}
            onClick={(event) => {
              event.preventDefault();
              setIsOpen(true);
            }}
          />
        }
      >
        <Trans>Add Field</Trans>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {owner === 'collection' ? (
              <Trans>Add a Field to this Collection</Trans>
            ) : (
              <Trans>Add a Field to this Component</Trans>
            )}
          </SheetTitle>
          <SheetDescription>
            {owner === 'collection' ? (
              <Trans>
                A Field says what every Entry of this Collection holds, and how
                somebody fills it in.
              </Trans>
            ) : (
              <Trans>
                A Field says what every section built from this Component holds,
                and how somebody fills it in. A Component cannot hold a slug
                Field and none of its Fields can be unique.
              </Trans>
            )}
          </SheetDescription>
          <div className="grid gap-2">
            <Label htmlFor={inputTypeId}>
              <Trans>Input type</Trans>
            </Label>
            <Select
              items={fieldTypeItems}
              value={selectedFieldType}
              onValueChange={(value) => {
                if (value !== null) {
                  setSelectedFieldType(value);
                }
              }}
            >
              <SelectTrigger
                id={inputTypeId}
                aria-describedby={inputTypeHintId}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldTypeSchema.options.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    disabled={isUnavailable(option)}
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={inputTypeHintId} className="text-sm text-muted-foreground">
              <Trans>
                The type of input the user is able to enter for this Field.
              </Trans>
            </p>
          </div>
        </SheetHeader>

        {/* Keyed by type so switching the picker remounts the body with the
        right schema and defaults. One live form, not 18. */}
        <SheetBody key={selectedFieldType}>
          {fieldModule({ fieldType: selectedFieldType }).DefinitionDraft?.(
            draftProps
          )}
        </SheetBody>

        <SheetFooter>
          <SubmitButton className="w-full" form={addFieldFormId}>
            <Trans>Add definition</Trans>
          </SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
