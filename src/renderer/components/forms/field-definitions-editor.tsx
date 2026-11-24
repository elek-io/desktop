import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { type ReactElement } from 'react';
import {
  useWatch,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import {
  DraggableComponent,
  SortableFieldArray,
} from '@renderer/components/drag-and-drop';
import { fieldModule, fieldTypeGroups } from '@renderer/components/fields';
import { FieldDefinitionPreview } from '@renderer/components/fields/field-from-definition';
import { type FieldDefinitionsOwner } from '@renderer/components/fields/module';
import { FieldDefinitionEditor } from '@renderer/components/forms/field-definition-editor';
import { PaneHead } from '@renderer/components/pane';
import { FieldSubtreeError } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { type DefinitionsEditorState } from '@renderer/hooks/useDefinitionsEditor';
import { useProject } from '@renderer/hooks/useProject';

import { type FieldType, type SupportedLanguage } from '@elek-io/core';

// The fields a Collection or a Component defines: each one as editors see it,
// and the pane of 296 px beside them, which is either the field types or the
// settings of the chosen field.
//
// The two are rendered in different panes of the screen but belong to the one
// form the page is saved from, so they take the state the form holds through
// `useFieldDefinitions`.
//
// See contributing/renderer/dynamic-form-field-generation.md.

export interface FieldDefinitionsListProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  definitions: DefinitionsEditorState;
  owner: FieldDefinitionsOwner;
  /**
   * Where the form holds the name the fields are filled in for, which is the
   * Collection's plural name or the Component's own, in the language on screen.
   */
  ownerNamePath: FieldPath<TFieldValues>;
  isViewOnly?: boolean;
}

/**
 * What the fields are filled in for, which follows the name as it is typed and
 * says it without a name while nobody has written one.
 *
 * Its own component, so a keystroke in the name draws this sentence again
 * rather than every preview below it.
 */
function OwnerSentence<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  owner,
  ownerNamePath,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  owner: FieldDefinitionsOwner;
  ownerNamePath: FieldPath<TFieldValues>;
}): ReactElement {
  const written: unknown = useWatch({
    control: form.control,
    name: ownerNamePath,
  });
  const name = typeof written === 'string' ? written.trim() : '';

  if (name === '') {
    return owner === 'collection' ? (
      <Trans>
        Editors fill in these fields for every Entry, in this order.
      </Trans>
    ) : (
      <Trans>
        Editors fill in these fields in every section built from this Component,
        in this order.
      </Trans>
    );
  }

  return owner === 'collection' ? (
    <Trans>Editors fill in these fields for all {name}, in this order.</Trans>
  ) : (
    <Trans>
      Editors fill in these fields in every section built from {name}, in this
      order.
    </Trans>
  );
}

/**
 * The fields of a Collection or a Component as editors see them, each at its
 * own width, with the way to add one.
 */
export function FieldDefinitionsList<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  definitions,
  owner,
  ownerNamePath,
  isViewOnly = false,
}: FieldDefinitionsListProps<TFieldValues, TTransformedValues>): ReactElement {
  const { translateContent } = useProject();
  // Every form this serves holds the array under this key, asserted once here
  // as the editor's own helpers do, see
  // contributing/renderer/forms.md#form-typing.
  const name = 'fieldDefinitions' as FieldPath<TFieldValues>;

  return (
    <section className="flex flex-col gap-4 border-t px-(--pane-edge) py-6">
      <div>
        <h2 className="text-h4">
          {owner === 'collection' ? (
            <Trans>Define this Collection&apos;s fields</Trans>
          ) : (
            <Trans>Define this Component&apos;s fields</Trans>
          )}
        </h2>
        <p className="mt-1 text-small text-muted-foreground">
          <OwnerSentence
            form={form}
            owner={owner}
            ownerNamePath={ownerNamePath}
          />
        </p>
      </div>

      {/* The definitions are drawn as the fields they define, not as bound
      fields, so a Core refinement that lands on the array itself (a duplicate
      slug, a stale slug source) has no field to land on. Without this, such an
      error would make Save a silent no-op. See
      contributing/renderer/forms.md#when-an-error-has-no-field-to-land-on. */}
      <FieldSubtreeError form={form} name={name} />

      <div className="@container grid grid-cols-12 gap-x-6 gap-y-2">
        <SortableFieldArray
          items={definitions.list}
          onReorder={definitions.move}
        >
          {definitions.list.map((fieldDefinition) => {
            // A group is presentational. Authoring one is not supported yet,
            // so its members are shown as fields with no settings of their own.
            if ('isGroup' in fieldDefinition) {
              return (
                <FieldSet key={fieldDefinition.id} className="col-span-12">
                  <FieldLegend>
                    {translateContent({
                      key: 'fieldDefinitionGroup.label',
                      record: fieldDefinition.label,
                    })}
                  </FieldLegend>
                  <FieldGroup className="grid grid-cols-12 gap-x-6 gap-y-2">
                    {fieldDefinition.fieldDefinitions.map((member) => (
                      <FieldDefinitionPreview
                        key={member.id}
                        fieldDefinition={member}
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              );
            }

            return (
              <DraggableComponent
                key={fieldDefinition.id}
                id={fieldDefinition.id}
              >
                <FieldDefinitionPreview
                  fieldDefinition={fieldDefinition}
                  isChosen={definitions.chosen?.id === fieldDefinition.id}
                  isDraggable={isViewOnly === false}
                  {...(isViewOnly
                    ? {}
                    : {
                        onChoose: () => definitions.choose(fieldDefinition.id),
                      })}
                />
              </DraggableComponent>
            );
          })}
        </SortableFieldArray>
      </div>

      {isViewOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          Icon={PlusIcon}
          className="w-fit"
          aria-pressed={definitions.isAddingField}
          onClick={definitions.addField}
        >
          <Trans>Add field</Trans>
        </Button>
      )}
    </section>
  );
}

/** The pane of field types, in ci's groups, each with its icon. */
function FieldTypesPane({
  owner,
  onAdd,
  onClose,
}: {
  owner: FieldDefinitionsOwner;
  onAdd: (fieldType: FieldType) => void;
  onClose: () => void;
}): ReactElement {
  const { t } = useLingui();
  const groups = fieldTypeGroups()
    .map((group) => ({
      ...group,
      // Core refuses a field type an object cannot hold, so it is never
      // offered there rather than offered and then refused.
      fieldTypes: group.fieldTypes.filter(
        (fieldType) =>
          owner === 'collection' ||
          fieldModule({ fieldType }).forbiddenInComponent !== true
      ),
    }))
    .filter((group) => group.fieldTypes.length > 0);
  const offered = groups.reduce(
    (count, group) => count + group.fieldTypes.length,
    0
  );

  return (
    <aside aria-label={t`Add field`} className="flex min-h-0 flex-1 flex-col">
      <PaneHead>
        <h2 className="min-w-0 flex-1 truncate text-label">
          <Trans>Add field</Trans>
        </h2>
        <span className="text-small text-muted-foreground">
          <Trans>{offered} types</Trans>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          Icon={XIcon}
          aria-label={t`Close the field types`}
          onClick={onClose}
        />
      </PaneHead>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-(--pane-edge) pb-6">
          {groups.map((group) => (
            <div key={group.group} className="flex flex-col gap-2">
              <h3 className="text-small text-muted-foreground">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.fieldTypes.map((fieldType) => {
                  const Icon = fieldModule({ fieldType }).Icon;
                  return (
                    <Button
                      key={fieldType}
                      type="button"
                      variant="outline"
                      size="sm"
                      Icon={Icon}
                      className="justify-start"
                      onClick={() => onAdd(fieldType)}
                    >
                      {fieldType}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

export interface FieldDefinitionsPaneProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  definitions: DefinitionsEditorState;
  owner: FieldDefinitionsOwner;
  supportedLanguages: SupportedLanguage[];
  /** The language the switch above the page shows. */
  language: SupportedLanguage;
}

/**
 * The pane of 296 px beside the fields: the field types while a field is being
 * added, and otherwise the settings of the chosen field.
 *
 * It answers `null` while neither is open, so the screen draws no pane at all
 * rather than an empty one.
 */
export function FieldDefinitionsPane<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  definitions,
  owner,
  supportedLanguages,
  language,
}: FieldDefinitionsPaneProps<
  TFieldValues,
  TTransformedValues
>): ReactElement | null {
  const { t } = useLingui();
  const { translateContent } = useProject();
  const { chosen } = definitions;

  if (definitions.isAddingField) {
    return (
      <FieldTypesPane
        owner={owner}
        onAdd={definitions.add}
        onClose={definitions.close}
      />
    );
  }

  if (chosen === undefined) {
    return null;
  }

  const label = translateContent({
    key: 'fieldDefinition.label',
    record: chosen.label,
  });
  const at = definitions.list.findIndex(
    (candidate) => candidate.id === chosen.id
  );

  return (
    <aside
      // Named after the field rather than after what the row button that opens
      // it says, so a screen reader does not hear one name twice.
      aria-label={t`The ${label} field`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PaneHead className="gap-2">
        <h2 className="min-w-0 flex-1 truncate text-label">{label}</h2>
        <span className="text-small text-muted-foreground">
          {chosen.fieldType}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                Icon={EllipsisIcon}
                aria-label={t`More for ${label}`}
              />
            }
          />
          <DropdownMenuPortal>
            <DropdownMenuContent align="end">
              {/* Moving a field needs no dragging, as WCAG 2.5.7 asks. */}
              <DropdownMenuItem
                disabled={at <= 0}
                onClick={() => definitions.moveBy(chosen.id, -1)}
              >
                <ArrowUpIcon />
                <Trans>Move up</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={at === -1 || at >= definitions.list.length - 1}
                onClick={() => definitions.moveBy(chosen.id, 1)}
              >
                <ArrowDownIcon />
                <Trans>Move down</Trans>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => definitions.remove(chosen.id)}
              >
                <Trash2Icon />
                <Trans>Remove field</Trans>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          Icon={XIcon}
          aria-label={t`Close ${label}`}
          onClick={definitions.close}
        />
      </PaneHead>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 px-(--pane-edge) pb-6">
          <FieldDefinitionEditor
            // Keyed by the definition, so what each field holds belongs to the
            // field whose settings are open rather than to whichever was open
            // first.
            key={chosen.id}
            form={form}
            fieldDefinition={chosen}
            prefix={definitions.chosenPrefix}
            owner={owner}
            siblings={definitions.list}
            supportedLanguages={supportedLanguages}
            language={language}
            onFieldTypeChange={definitions.changeType}
          />
        </div>
      </ScrollArea>
    </aside>
  );
}
