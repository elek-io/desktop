import { arrayMove } from '@dnd-kit/sortable';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListPlusIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';
import {
  useFormContext,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { FieldFromDefinition } from '@renderer/components/fields/field-from-definition';
import { defaultEntryValues } from '@renderer/components/fields/value-defaults';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  resolveOfComponents,
  uuid,
  type Component,
  type DynamicFieldDefinition,
  type FieldDefinition,
} from '@elek-io/core';

/**
 * The path one field definition's Value sits at inside one section, whose own
 * bound path is `baseName`. `FieldFromDefinition` appends the language itself
 * where the Value is per-language, so this stops at `content`.
 */
function sectionValuePath<TFieldValues extends FieldValues>(
  baseName: string,
  index: number,
  fieldDefinition: FieldDefinition
): FieldPath<TFieldValues> {
  // Provably a key of the item's `values` record, but FieldPath cannot reduce
  // that for an unresolved generic, so it is asserted once here. A form field's
  // path, which react-hook-form reads, rather than words.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  return `${baseName}.${String(index)}.values.${fieldDefinition.slug}.content` as FieldPath<TFieldValues>;
}

/**
 * One section of a page as the form holds it: a Component item whose inner
 * Values are still the schema input rather than Core's strict `Value`, because
 * they are being written. Nothing here reads one, each is reached by its own
 * form path, so `unknown` is enough and Core stays the only validator.
 */
interface ComponentItemDraft {
  id: string;
  componentId: string;
  values: Record<string, unknown>;
}

export interface FormDynamicFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: DynamicFieldDefinition;
  disabled: boolean;
}

/**
 * The editor for a dynamic field: the ordered sections of a page, each built
 * from one of the Components the field allows and holding that Component's own
 * fields.
 *
 * Unlike every other field its Value is one flat array rather than content per
 * language, so it is the one module marked `translatable: false`, and the path
 * it is bound to ends at `content` instead of at a language. See
 * contributing/renderer/dynamic-form-field-generation.md.
 *
 * Sections are reordered with Move up and Move down rather than by dragging. A
 * section can hold a dynamic field of its own, so a drag context here would
 * nest inside itself, and a move that works without dragging is what WCAG
 * 2.1.1 asks for either way.
 *
 * This field is a list rather than one input, so its control-association props
 * are split. The list is a `group` carrying the `id` the field's label points
 * at, named by the same label and described by the same description. The Add
 * section trigger carries the invalid state, because that is the control an
 * editor presses to answer it. The `id` deliberately stays off that trigger: a
 * button is labelable, so a label pointing at it would rename it from "Add
 * section" to the field's label.
 */
export function DynamicControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: FormDynamicFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();

  const {
    projectId,
    translateContent,
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  // Each section's own group, so the focus can go to the one that takes a
  // removed section's place, and the two it falls back to.
  const sectionsById = React.useRef(new Map<string, HTMLDivElement>());
  const addSectionRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  // The surrounding AppForm is the provider, so the inner fields reach the same
  // form without this leaf having to be handed it through the registry.
  const form = useFormContext<TFieldValues>();
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));

  if (isReadingProject || isReadingComponents) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-9 w-40 rounded-md" />
        <span className="text-sm text-muted-foreground">
          <Trans>Loading this Project&apos;s Components</Trans>
        </span>
      </div>
    );
  }

  // Only the shape of the list is read from here: how many sections there are
  // and which Component each is built from. The Values inside are stale as soon
  // as somebody types into one, because react-hook-form only re-renders a
  // Controller for a change at its own exact name, not for one below it. They
  // are read from the form itself in `sections()` instead.
  const items: ComponentItemDraft[] = Array.isArray(field.value)
    ? field.value
    : [];
  const supportedLanguages = project.settings.language.supported;

  const components = componentList.list;
  const componentsById = new Map(
    components.map((component) => [component.id, component])
  );
  // An empty `ofComponents` allows every Component of the Project, which is
  // Core's own rule rather than ours, so it is read off Core.
  const allowedComponents = resolveOfComponents(
    fieldDefinition,
    components.map((component) => component.id)
  )
    .map((id) => componentsById.get(id))
    .filter((component): component is Component => component !== undefined);

  const maxReached =
    fieldDefinition.max !== null && items.length >= fieldDefinition.max;
  const sectionMaximum = fieldDefinition.max;
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });

  function componentName(componentId: string): string {
    const component = componentsById.get(componentId);
    // Only reachable while the Components are still loading, since Core refuses
    // to delete a Component something still holds
    if (component === undefined) {
      return t`Section`;
    }
    return translateContent({
      key: 'component.name',
      record: component.name,
    });
  }

  /**
   * The sections as the form holds them right now, Values included. Read from
   * the form rather than from `field.value`, which does not see what somebody
   * typed into a section since this field last changed.
   */
  function sections(): ComponentItemDraft[] {
    const value: unknown = form.getValues(field.name);
    return Array.isArray(value) ? value : [];
  }

  /**
   * Writes the new list. Each section is keyed by its own id below, so a
   * structural change moves a section's fields to another index, which changes
   * the `name` each of them is bound to and makes its Controller re-read on its
   * own.
   */
  function setSections(next: ComponentItemDraft[]): void {
    field.onChange(next);
  }

  function addSection(component: Component): void {
    setSections([
      ...sections(),
      {
        id: uuid(),
        componentId: component.id,
        values: defaultEntryValues(
          component.fieldDefinitions,
          supportedLanguages
        ),
      },
    ]);
  }

  /**
   * Removes one section and leaves the focus in the list: on the section that
   * takes its place, else the one before it, else Add section where that can
   * take it, else the list itself.
   *
   * The sections that stay are keyed by their own id, so each keeps its element
   * and can be focused straight away. See
   * contributing/renderer/forms.md#keeping-focus-after-a-row-is-removed.
   */
  function removeSection(index: number): void {
    const current = sections();
    const staying = current.filter((_item, itemIndex) => itemIndex !== index);
    setSections(staying);

    const next = staying[index] ?? staying[index - 1];
    const section =
      next === undefined ? undefined : sectionsById.current.get(next.id);
    // Add section is still disabled where the removal is what frees it, since
    // React has not re-rendered it yet, and a disabled control takes no focus.
    // So the list takes it rather than the page.
    const addSection =
      addSectionRef.current?.disabled === false ? addSectionRef.current : null;
    (section ?? addSection ?? listRef.current)?.focus();
  }

  function moveSection(index: number, offset: number): void {
    const current = sections();
    const target = index + offset;
    if (target < 0 || target >= current.length) {
      return;
    }
    setSections(arrayMove(current, index, target));
  }

  return (
    <div
      ref={listRef}
      className="grid gap-3"
      role="group"
      aria-label={label}
      // Focusable only to be focused: it is where the focus lands once the
      // last section was removed and nothing else is left to take it.
      tabIndex={-1}
      {...(id === undefined ? {} : { id })}
      {...(describedBy === undefined
        ? {}
        : { 'aria-describedby': describedBy })}
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground">
          <Trans>No sections yet.</Trans>
        </p>
      ) : (
        items.map((item, index) => {
          const component = componentsById.get(item.componentId);
          const name = componentName(item.componentId);
          const position = index + 1;
          const total = items.length;

          return (
            // Keyed by the item's own id, not by its position, so a move takes
            // the whole section with it: the button that was pressed keeps both
            // its focus and the section it belongs to, and pressing it again
            // moves the same section on rather than undoing the move.
            <div
              key={item.id}
              data-slot="section"
              role="group"
              aria-label={t`${name}, section ${position} of ${total}`}
              // Focused rather than tabbed to, so removing the section above
              // leaves the focus here instead of on the page.
              tabIndex={-1}
              ref={(group) => {
                if (group === null) {
                  sectionsById.current.delete(item.id);
                  return;
                }
                sectionsById.current.set(item.id, group);
              }}
              className="rounded-xl border"
            >
              {/* The section's own head, ruled off its fields, with the three
              ways to move it at the right, as ci draws them. */}
              <div className="flex items-center gap-2 border-b py-2.5 pr-2 pl-4">
                <p className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate text-label">{name}</span>
                  <span className="text-small whitespace-nowrap text-muted-foreground">
                    {t`Section ${position} of ${total}`}
                  </span>
                </p>
                <Button
                  Icon={ArrowUpIcon}
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  <span className="sr-only">
                    <Trans>Move the {name} section up</Trans>
                  </span>
                </Button>
                <Button
                  Icon={ArrowDownIcon}
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === items.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  <span className="sr-only">
                    <Trans>Move the {name} section down</Trans>
                  </span>
                </Button>
                <Button
                  Icon={Trash2Icon}
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  onClick={() => removeSection(index)}
                >
                  <span className="sr-only">
                    <Trans>Remove the {name} section</Trans>
                  </span>
                </Button>
              </div>

              {component === undefined ? null : (
                <div className="@container grid grid-cols-12 gap-x-6 gap-y-4 p-4">
                  {component.fieldDefinitions.map((definition) => (
                    <FieldFromDefinition
                      key={definition.id}
                      fieldDefinition={definition}
                      form={form}
                      name={sectionValuePath<TFieldValues>(
                        field.name,
                        index,
                        definition
                      )}
                    />
                  ))}
                </div>
              )}
              {component !== undefined &&
              component.fieldDefinitions.length === 0 ? (
                <p className="p-4 text-muted-foreground">
                  <Trans>
                    This Component has no fields yet, so this section holds
                    nothing.
                  </Trans>
                </p>
              ) : null}
            </div>
          );
        })
      )}

      {allowedComponents.length === 0 ? (
        <p className="text-muted-foreground">
          <Trans>
            This Project has no Component this field allows, so no section can
            be added. Create one, or allow another one on this field.
          </Trans>
        </p>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={addSectionRef}
                Icon={ListPlusIcon}
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={disabled || maxReached}
                {...(invalid === undefined ? {} : { 'aria-invalid': invalid })}
              />
            }
          >
            <Trans>Add section</Trans>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {allowedComponents.map((component) => (
              <DropdownMenuItem
                key={component.id}
                onClick={() => addSection(component)}
              >
                {translateContent({
                  key: 'component.name',
                  record: component.name,
                })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {maxReached ? (
        <p className="text-muted-foreground">
          {t`This field holds at most ${sectionMaximum} sections. Remove one to add another.`}
        </p>
      ) : null}
    </div>
  );
}
