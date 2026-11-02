import * as React from 'react';

import { Input } from '@renderer/components/ui/input';

/**
 * The field that filters a list, which keeps its name inside itself.
 *
 * It carries placeholder text, which ci rules out everywhere but a filter,
 * because an empty field then looks filled. A filter stands above its list
 * with no label of its own, and what somebody types in it is never read back
 * as a Value. The name is the accessible name as well, so it is not left to
 * the placeholder, which is only the last thing the name of a field is
 * computed from.
 *
 * Every filter above a list goes through this component, and the one inside a
 * combobox's popup through `ComboboxInput`. Those two are what lets the lint
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
    // A text input rather than a search one: `type="search"` would add the
    // browser's own clear button inside the field, which ci does not draw.
    <Input
      data-slot="filter-input"
      type="text"
      aria-label={name}
      placeholder={name}
      {...props}
    />
  );
}

export { FilterInput };
