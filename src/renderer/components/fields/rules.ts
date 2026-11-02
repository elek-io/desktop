import {
  amountNotes,
  characterNotes,
  fieldRules,
  uniqueNote,
  type FieldRules,
} from '@renderer/lib/fieldRules';

// The rules more than one field type shows, as plain functions a type's own
// module opts into. Each one reads a field definition's own keys, so no rule is
// written out in Desktop that Core does not already hold.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/** What every field definition says: whether it is required and whether it is unique. */
interface RuledDefinition {
  isRequired: boolean;
  isUnique: boolean;
}

/** A bound a field definition may leave open. */
interface BoundDefinition {
  min: number | null;
  max: number | null;
}

/**
 * The rules of a field whose Value is one thing, with no bound of its own:
 * whether it has to be filled, and whether its Value may be held once only.
 */
export function scalarRules(
  fieldDefinition: RuledDefinition,
  notes: string[] = []
): FieldRules {
  return fieldRules({
    required: fieldDefinition.isRequired,
    notes: fieldDefinition.isUnique ? [uniqueNote(), ...notes] : notes,
  });
}

/** The rules of a text Value, whose bounds count characters. */
export function textRules(
  fieldDefinition: RuledDefinition & BoundDefinition
): FieldRules {
  return scalarRules(fieldDefinition, characterNotes(fieldDefinition));
}

/** The rules of a number Value, whose bounds are the number itself. */
export function numberRules(
  fieldDefinition: RuledDefinition & BoundDefinition
): FieldRules {
  return scalarRules(fieldDefinition, amountNotes(fieldDefinition));
}

/**
 * The rules of a Value that holds several things, whose bounds count them:
 * the Assets or Entries a reference field points at, or the sections of a
 * dynamic field.
 */
export function countRules(
  fieldDefinition: RuledDefinition & BoundDefinition,
  notes: string[] = []
): FieldRules {
  return scalarRules(fieldDefinition, [
    ...amountNotes(fieldDefinition),
    ...notes,
  ]);
}
