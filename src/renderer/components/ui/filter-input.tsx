import * as React from 'react';

import { Input } from '@renderer/components/ui/input';

/**
 * The field that filters a list, which keeps its name inside itself.
 *
 * It is the one input in the app that carries placeholder text. ci rules that
 * out everywhere else, because an empty field then looks filled, and allows it
 * here: a filter stands above a list with no label of its own, and what
 * somebody types in it is never read back as a Value. The name is the
 * accessible name as well, so it is not left to the placeholder, which is only
 * the last thing the name of a field is computed from.
 *
 * Every filter goes through this one component, which is what lets the lint
 * rule against placeholder text hold everywhere else. See
 * contributing/renderer/forms.md#placeholder-text.
 */
function FilterInput({
  name,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'placeholder' | 'type'> & {
  /** What this field filters, such as "Filter Blog posts". */
  name: string;
}): React.JSX.Element {
  return (
    <Input
      data-slot="filter-input"
      type="search"
      aria-label={name}
      placeholder={name}
      {...props}
    />
  );
}

export { FilterInput };
