import { Plus } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';

import { type DefinitionDraftProps } from '@renderer/components/forms/field-definition-draft';
import {
  FIELD_DEFINITION_REGISTRY,
  unauthorableFieldTypes,
} from '@renderer/components/forms/field-definition-registry';
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

// The Add Field sheet: a field-type picker, the matching registry entry rendered
// in the body, and one detached SubmitButton in the footer.
//
// See contributing/renderer/dynamic-form-field-generation.md.

interface AddFieldSheetProps {
  project: Project;
  // Read only, for the duplicate-slug guard and the slug source list. Edits go
  // through onAppend.
  fieldDefinitions: FieldDefinitionOrGroup[];
  onAppend: (definition: FieldDefinition) => void;
}

export function AddFieldSheet({
  project,
  fieldDefinitions,
  onAppend,
}: AddFieldSheetProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('text');
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
    onAdd,
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          Icon={Plus}
          onClick={(event) => {
            event.preventDefault();
            setIsOpen(true);
          }}
        >
          Add Field
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add a Field to this Collection</SheetTitle>
          <SheetDescription>
            Adding Fields to your Collection will enable users to enter data
            that follows the boundaries you&apos;ve set.
          </SheetDescription>
          <div className="grid gap-2">
            <Label htmlFor={inputTypeId} isRequired>
              Input type
            </Label>
            <Select
              value={selectedFieldType}
              onValueChange={(value: FieldType) => setSelectedFieldType(value)}
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
                    disabled={unauthorableFieldTypes.has(option)}
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={inputTypeHintId} className="text-sm text-muted-foreground">
              The type of input the user is able to enter for this Field.
            </p>
          </div>
        </SheetHeader>

        {/* Keyed by type so switching the picker remounts the body with the
        right schema and defaults. One live form, not 18. */}
        <SheetBody key={selectedFieldType}>
          {FIELD_DEFINITION_REGISTRY[selectedFieldType](draftProps)}
        </SheetBody>

        <SheetFooter>
          <SubmitButton className="w-full" form={addFieldFormId}>
            Add definition
          </SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
