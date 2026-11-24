import { createContext, useContext } from 'react';

// The Core schema a part of a form is checked against, where that is not the
// schema the whole form passes.
//
// A field definition inside a Collection is the case: Core describes the array
// as a union of every field type and a group, which the walk over a schema
// cannot see into, while the schema of one definition of one type says
// everything about it. So the settings of the chosen field put that schema in
// scope, and each field inside reads its own rules off it.
//
// See contributing/renderer/forms.md#the-field-shell.

export interface FieldSchemaScopeValue {
  /** The Core schema the part below checks against. */
  schema: unknown;
  /** Where that part sits on the form, such as `fieldDefinitions.2`. */
  prefix: string;
}

export const FieldSchemaScopeContext =
  createContext<FieldSchemaScopeValue | null>(null);

/**
 * The schema in scope for a part of the form, or `null` outside one.
 *
 * A field reads it before the form's own schema and names its path relative to
 * the prefix, so a limit Core keeps on one field definition reaches the label
 * without being written out again.
 */
export function useFieldSchemaScope(): FieldSchemaScopeValue | null {
  return useContext(FieldSchemaScopeContext);
}
