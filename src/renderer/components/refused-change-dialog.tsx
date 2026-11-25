import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check, Trash2, TriangleAlertIcon } from 'lucide-react';
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';

import { fieldModule } from '@renderer/components/fields';
import { sectionPathOf } from '@renderer/components/fields/dynamic/sections';
import { entryTitle } from '@renderer/components/fields/entry-title';
import { FieldFromDefinition } from '@renderer/components/fields/field-from-definition';
import { defaultEntryValue } from '@renderer/components/fields/value-defaults';
import { LanguageSwitch } from '@renderer/components/language-switch';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useComponentResolver } from '@renderer/hooks/useComponentResolver';
import { FormLanguageContext } from '@renderer/hooks/useFormLanguage';
import { useMissingResolutions } from '@renderer/hooks/useMissingValues';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import {
  acceptedContentLossOf,
  lostValueLanguage,
  lostValuesOf,
  neededValuesOf,
  type LostValueIssue,
  type NeededValueIssue,
  type SchemaChangeIssue,
} from '@renderer/lib/schemaChange';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  getValueSchemaFromFieldDefinition,
  valueSchema,
  type Collection,
  type Component,
  type Entry,
  type FieldDefinition,
  type SupportedLanguage,
  type Value,
} from '@elek-io/core';

// The one dialog a field definition change Core refuses opens: what the save
// would delete, and the Values it needs, in the two groups ci draws. It shows
// what Core's refusal names and sends back what Core takes, so nothing here
// works out a loss or a resolution of its own.
//
// See contributing/error-handling.md#example-a-field-change-core-cannot-carry-out
// and contributing/renderer/dynamic-form-field-generation.md.

/**
 * The Values written here, by what holds each one, then by the field's new
 * slug, then the Value's own keys.
 *
 * What holds it is the Component item where the Value sits in one, and the
 * Entry itself where it does not, so two items of one Entry never write into
 * the same key. Core takes each of those back under a key of its own, see
 * `RefusedChangeAnswer`.
 *
 * Read one level at a time rather than as Core's `Value`, because the form
 * holds what somebody is typing: a Value a field has not filled in yet is
 * whatever that field binds, and Core's own schema is what checks it before it
 * is sent, see `resolutionsSchemaFor`.
 */
type Resolutions = Record<string, Record<string, Record<string, unknown>>>;

/**
 * What holds one issue's Value, which is what the form writes it under: the
 * Component item the field sits in where the issue names one, and the Entry
 * itself where it does not.
 */
function holderOf(issue: SchemaChangeIssue): string {
  return issue.componentItemId ?? issue.entryId;
}

/** The form the dialog is applied from. */
interface RefusedChangeFormValues {
  resolutions: Resolutions;
}

/** What the change is applied with, which is what Core takes back. */
export interface RefusedChangeAnswer {
  /** The field definitions whose content may go. */
  acceptedContentLoss: string[];
  /**
   * The Values the change needs that belong to an Entry itself, by Entry and
   * then by the field's new slug, which is what `collections.update` takes
   * back. Empty where the change named none, as a Component's change does.
   */
  resolutions: Record<string, Record<string, Value>>;
  /**
   * The Values that belong to a Component item, by Entry, then the item, then
   * the field's new slug, which is what `components.update` takes back, so
   * each Value lands in the item that raised its issue. Empty where the change
   * named none, as a Collection's change does.
   */
  itemResolutions: Record<string, Record<string, Record<string, Value>>>;
}

/** The Core schema one Value is checked against, by the field it belongs to. */
type ValueSchemaOf = (
  fieldDefinition: FieldDefinition
) => ReturnType<typeof getValueSchemaFromFieldDefinition>;

export interface RefusedChangeDialogProps {
  open: boolean;
  /** The question in its head, which names the object being saved. */
  question: string;
  /** Everything Core refused the change for, as its own reader read it. */
  issues: SchemaChangeIssue[];
  /**
   * The field definitions as the object holds them now, flattened. A removed
   * field is gone from the save and still has its label and its type here,
   * which is what the Value that would go is read with.
   */
  storedFieldDefinitions: FieldDefinition[];
  /**
   * The field definitions the save would write, flattened. A Value the change
   * needs is written under the field as the change leaves it.
   */
  newFieldDefinitions: FieldDefinition[];
  /**
   * The Component being saved, by its name, where the change is a Component's.
   * Core raises an item issue only for an item of the Component it is given, so
   * a row names that Component even before the Entry the item sits in has been
   * read, which is what stands in for the item's place then.
   */
  componentName?: string;
  /** The language the settings behind the dialog are read in. */
  language: SupportedLanguage;
  /**
   * Save, which the dialog was opened from and hands the focus back to when it
   * closes. The form it belongs to holds its fields read-only while the save
   * runs, which takes the focus off it, so there is nothing for the dialog to
   * return to on its own.
   */
  returnFocusTo: RefObject<HTMLElement | null>;
  /** Takes the dialog off screen and changes nothing. */
  onCancel: () => void;
  /** Applies the change with what Core takes back. */
  onApply: (answer: RefusedChangeAnswer) => Promise<void>;
  /** Keeps the settings behind the dialog, before a link leads away from them. */
  onFollowLink: () => void;
}

/** Everything the dialog draws of one refused change. */
type RefusedChangeProps = Omit<
  RefusedChangeDialogProps,
  'open' | 'returnFocusTo'
>;

/**
 * The dialog of a refused field definition change.
 *
 * It stays mounted for its own animation, and what it holds is keyed by the
 * issues the refusal names, so a refusal that names other Entries, Component
 * items or fields opens on their own empty Values rather than on what an
 * earlier one was answered with. A refusal that names the same ones again keeps
 * what was typed, which is the same change being pressed again.
 */
export function RefusedChangeDialog({
  open,
  issues,
  returnFocusTo,
  ...change
}: RefusedChangeDialogProps): ReactElement {
  // What the dialog last drew, which is what it keeps while it closes. Both
  // routes drop the refusal and close the dialog in one state change, so the
  // issues are gone before the close animation has played, and a dialog that
  // empties itself collapses to a line instead of fading out.
  const drawn = useRef<RefusedChangeProps | null>(null);

  if (issues.length > 0) {
    drawn.current = { ...change, issues };
  }

  const shown = drawn.current;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next === false) {
          change.onCancel();
        }
      }}
    >
      {/* ci draws this dialog 560 px wide, and its body scrolls between the
      head and the buttons, so the red button stays in view at the smallest
      window. */}
      <DialogContent className="sm:max-w-[560px]" finalFocus={returnFocusTo}>
        {shown === null ? null : (
          <RefusedChange
            key={shown.issues
              .map(
                (issue) =>
                  `${holderOf(issue)}.${issue.fieldSlug}.${issue.issue}`
              )
              .join('|')}
            {...shown}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The Values an Entry needs, each with the field they are written under. */
function neededValuesWithFields(
  needed: NeededValueIssue[],
  newFieldDefinitions: FieldDefinition[]
): { issue: NeededValueIssue; fieldDefinition: FieldDefinition }[] {
  return needed.flatMap((issue) => {
    const fieldDefinition = newFieldDefinitions.find(
      (candidate) => candidate.id === issue.fieldDefinitionId
    );

    // A field the save does not declare has no Value to write. Core names one
    // for the loss of a removed field alone, which is accepted rather than
    // answered, so no row is dropped here.
    return fieldDefinition === undefined ? [] : [{ issue, fieldDefinition }];
  });
}

/**
 * The form the dialog is applied from, checked against Core's own schema for
 * each Value it holds.
 *
 * The shape is static, so the form it resolves keeps its type, and each Value
 * is checked by the schema Core generates for the field it is written under,
 * which is the same schema Core checks it against when it arrives. A refusal
 * lands at the path of the field that holds it, with Core's own paths kept, so
 * the message stands below that field rather than on the form.
 */
function resolutionsSchemaFor(
  needed: { issue: NeededValueIssue; fieldDefinition: FieldDefinition }[],
  valueSchemaOf: ValueSchemaOf
): z.ZodType<RefusedChangeFormValues, RefusedChangeFormValues> {
  return z
    .object({
      resolutions: z.record(
        z.string(),
        z.record(z.string(), z.record(z.string(), z.unknown()))
      ),
    })
    .check((ctx) => {
      for (const { issue, fieldDefinition } of needed) {
        const written =
          ctx.value.resolutions[holderOf(issue)]?.[issue.fieldSlug];
        const checked = valueSchemaOf(fieldDefinition).safeParse(written);

        if (checked.success) {
          continue;
        }

        for (const refusal of checked.error.issues) {
          ctx.issues.push({
            code: 'custom',
            input: written,
            // Already in the words the renderer's error map gave it, since the
            // schema above ran with that map, so it is carried rather than
            // worded again.
            message: refusal.message,
            path: [
              'resolutions',
              holderOf(issue),
              issue.fieldSlug,
              ...refusal.path,
            ],
          });
        }
      }
    });
}

function RefusedChange({
  question,
  issues,
  storedFieldDefinitions,
  newFieldDefinitions,
  componentName,
  language,
  onCancel,
  onApply,
  onFollowLink,
}: RefusedChangeProps): ReactElement {
  const { t } = useLingui();
  const {
    projectId,
    projectQuery: { data: project, isPending: isReadingProject },
    translateContent,
    formatInUserLocale,
  } = useProject();
  const lost = lostValuesOf(issues);
  const needed = neededValuesOf(issues);
  // The Values this dialog writes, each under the field the change leaves.
  const written = useMemo(
    () => neededValuesWithFields(needed, newFieldDefinitions),
    [needed, newFieldDefinitions]
  );
  // The language the Values are written in, which starts at the one the
  // settings behind the dialog are read in. It is this dialog's own, because
  // the switch above the settings takes names and labels into another
  // language while this one takes Values.
  const [valueLanguage, setValueLanguage] = useState(language);
  const supportedLanguages = isReadingProject
    ? []
    : project.settings.language.supported;
  const defaultLanguage = isReadingProject
    ? language
    : project.settings.language.default;
  // A Value of a dynamic field is checked against the field definitions of the
  // Components it embeds, so Core's resolver is needed for it.
  const { componentResolver, isReadingComponents } =
    useComponentResolver(projectId);
  // The Project's Components, which name each section an item sits in and hold
  // the fields those sections are built under. The resolver above reads the
  // same list, so this is the one query either way.
  const { data: componentList, isPending: isReadingComponentList } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));
  const componentsById = new Map<string, Component>(
    isReadingComponentList
      ? []
      : componentList.list.map((component) => [component.id, component])
  );

  // The Entries the refusal names, read through their Collections' lists, which
  // is what the list beside an Entry's editor reads too. Each is named by its
  // title, never by the id Core names it with.
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const namedCollectionIds = [
    ...new Set(issues.map((issue) => issue.collectionId)),
  ];
  const entryLists = useQueriesNoError(
    namedCollectionIds.map((collectionId) =>
      queryOptions.entries.list({ projectId, collectionId, limit: 0 })
    )
  );
  const entriesById = new Map<string, Entry>(
    entryLists.flatMap((list) =>
      list.isPending ? [] : list.data.list.map((entry) => [entry.id, entry])
    )
  );

  /** The Collection one issue's Entry belongs to, once the list has arrived. */
  function collectionOf(issue: SchemaChangeIssue): Collection | undefined {
    return isReadingCollections
      ? undefined
      : collectionList.list.find(
          (candidate) => candidate.id === issue.collectionId
        );
  }

  /** One Entry as Desktop names it, which is the one way it is named. */
  function entryName(issue: SchemaChangeIssue): string {
    const entry = entriesById.get(issue.entryId);
    const collection = collectionOf(issue);

    if (entry === undefined || collection === undefined) {
      // Only while the lists are still being read. The Entry is named by the
      // start of its id then, as every other list does where nothing names it.
      return issue.entryId.slice(0, 8);
    }

    return entryTitle({
      entry,
      fieldDefinitions: flattenFieldDefinitions(collection.fieldDefinitions),
      language,
    });
  }

  /** That Collection by its plural name, or nothing while it is being read. */
  function collectionName(issue: SchemaChangeIssue): string | null {
    const collection = collectionOf(issue);

    return collection === undefined
      ? null
      : translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        });
  }

  /** One field as its label names it, out of the definitions that hold it. */
  function fieldName(
    issue: SchemaChangeIssue,
    definitions: FieldDefinition[]
  ): string {
    const fieldDefinition = definitions.find(
      (candidate) => candidate.id === issue.fieldDefinitionId
    );

    return fieldDefinition === undefined
      ? issue.fieldSlug
      : translateContent({
          key: 'fieldDefinition.label',
          record: fieldDefinition.label,
        });
  }

  /** The way to the Component item one issue is about, or nothing. */
  function sectionPath(
    issue: SchemaChangeIssue
  ): ReturnType<typeof sectionPathOf> {
    const entry = entriesById.get(issue.entryId);

    return issue.componentItemId === undefined || entry === undefined
      ? null
      : sectionPathOf(entry.values, issue.componentItemId);
  }

  /**
   * Which section of an Entry one issue is about, where it is about a
   * Component's item, so two rows of the same Entry and field never read the
   * same. ci gives an item no name, so it is said by its place, the way the
   * section's own head says it.
   */
  function sectionName(issue: SchemaChangeIssue): string | null {
    const path = sectionPath(issue);

    if (path === null) {
      return null;
    }

    const [{ position, total }] = path;

    return t`Section ${position} of ${total}`;
  }

  /**
   * Where one Component item sits, as the way to it from the item outward,
   * such as "Teaser, section 1 of 3 in Page sections of Blog posts".
   *
   * Each step names what the editor reads on that section's head and the field
   * it sits in, which is the way they walk when they follow the row's link.
   * One message per step and one that joins two of them, so a language can
   * reorder inside a step as well as between them.
   *
   * Nothing where a step cannot be named, which is an Entry that changed under
   * the dialog or a read that has not arrived yet.
   */
  function sectionPlace(issue: SchemaChangeIssue): string | null {
    const path = sectionPath(issue);
    const collection = collectionOf(issue);
    const plural = collectionName(issue);

    if (path === null || collection === undefined || plural === null) {
      return null;
    }

    const steps = path.flatMap(
      ({ componentId, position, total, fieldSlug }, index) => {
        // The field is the one the section stands in: a field of the item that
        // holds it where there is one, and of the Collection at the top.
        const outward = path[index + 1];
        const holding = flattenFieldDefinitions(
          outward === undefined
            ? collection.fieldDefinitions
            : (componentsById.get(outward.componentId)?.fieldDefinitions ?? [])
        ).find((candidate) => candidate.slug === fieldSlug);
        const component = componentsById.get(componentId);

        if (holding === undefined || component === undefined) {
          return [];
        }

        const section = translateContent({
          key: 'component.name',
          record: component.name,
        });
        const field = translateContent({
          key: 'fieldDefinition.label',
          record: holding.label,
        });

        return [t`${section}, section ${position} of ${total} in ${field}`];
      }
    );

    return steps.length === path.length
      ? steps.reduceRight((outward, step) => t`${step} of ${outward}`, plural)
      : null;
  }

  /**
   * What the row of a Value a Component item needs says about that item, below
   * the field and the Entry it names.
   *
   * The place where it can be read, and the Component the item is built from
   * alone where it cannot: the Value still lands in the right item either way,
   * since Core takes it keyed by the item's id rather than by its place.
   */
  function itemPlace(issue: SchemaChangeIssue): string | null {
    return issue.componentItemId === undefined
      ? null
      : (sectionPlace(issue) ?? componentName ?? null);
  }

  /**
   * What one Value that would go reads as, from the field type it belongs to.
   *
   * Core says which Value goes, whole for a removed field and only the items
   * that would be stripped for a narrowed one, and the type's own folder says
   * what it reads as. A language that holds nothing reads as nothing, so the
   * first language that holds something stands instead of an empty row.
   */
  function lostText(issue: LostValueIssue): string | null {
    const fieldDefinition = storedFieldDefinitions.find(
      (candidate) => candidate.id === issue.fieldDefinitionId
    );

    if (fieldDefinition === undefined) {
      return null;
    }

    const module = fieldModule(fieldDefinition);
    const read = (inLanguage: SupportedLanguage): string | null =>
      module.renderValue({
        content: issue.currentValue.content,
        fieldDefinition,
        language: inLanguage,
        formatInUserLocale,
      });

    return (
      read(lostValueLanguage(issue, valueLanguage)) ??
      supportedLanguages.map(read).find((text) => text !== null) ??
      null
    );
  }

  const formId = useId();
  // Each Value is checked by the schema Core generates for the field it is
  // written under, which is the same schema Core checks it against when it
  // arrives. A Value of a dynamic field needs Core's resolver for the
  // Components it embeds, so the form waits for them below.
  const valueSchemaOf: ValueSchemaOf = (fieldDefinition) =>
    getValueSchemaFromFieldDefinition(
      fieldDefinition,
      supportedLanguages,
      componentResolver
    );
  const refusedChangeForm = useAppForm<RefusedChangeFormValues>({
    resolver: zodResolver(resolutionsSchemaFor(written, valueSchemaOf)),
    // Every Value the change needs starts as an empty one of its field's type,
    // so each row is controlled from the first render and holds the shape Core
    // takes back.
    defaultValues: {
      resolutions: Object.fromEntries(
        [...new Set(written.map(({ issue }) => holderOf(issue)))].map(
          (holderId) => [
            holderId,
            Object.fromEntries(
              written
                .filter(({ issue }) => holderOf(issue) === holderId)
                .map(({ issue, fieldDefinition }) => [
                  issue.fieldSlug,
                  defaultEntryValue(fieldDefinition, supportedLanguages),
                ])
            ),
          ]
        )
      ),
    },
    disabled: isReadingProject || isReadingComponents,
  });

  // How many of the Values the change needs are still missing, per language,
  // which is what holds the button back and marks the language in the switch.
  const missingByLanguage = useMissingResolutions({
    form: refusedChangeForm,
    name: 'resolutions',
    needed: useMemo(
      () =>
        written.map(({ issue, fieldDefinition }) => ({
          holderId: holderOf(issue),
          fieldSlug: issue.fieldSlug,
          fieldDefinition,
        })),
      [written]
    ),
    languages: isReadingProject ? undefined : project.settings.language,
  });
  const [missingLanguage, missingValues] = [
    ...missingByLanguage.entries(),
  ].find(([, count]) => count > 0) ?? [undefined, 0];
  const missing =
    missingLanguage === undefined ? undefined : languageName(missingLanguage);
  const blockedBy =
    missing === undefined
      ? undefined
      : t`${missing} is missing ${plural(missingValues, { one: '# Value', other: '# Values' })}`;

  /**
   * The Values written here as Core takes them back, each under the key of the
   * call that takes it: a Value of an Entry's own field by the Entry and the
   * slug, and one of a Component item by the Entry, the item and the slug. So
   * neither map ever carries a Value the other call is keyed for.
   *
   * Whether each one holds what its field allows was answered by that field's
   * own Core schema when the form was submitted, so this only reads the shape
   * of a Value, which is what a resolution is sent as. One that is not a Value
   * at all is left out, which this form cannot produce, and leaves Core
   * refusing the change again rather than writing something it did not take.
   */
  function answeredValues(typed: Resolutions): {
    resolutions: RefusedChangeAnswer['resolutions'];
    itemResolutions: RefusedChangeAnswer['itemResolutions'];
  } {
    const resolutions: RefusedChangeAnswer['resolutions'] = {};
    const itemResolutions: RefusedChangeAnswer['itemResolutions'] = {};

    for (const { issue } of written) {
      const read = valueSchema.safeParse(
        typed[holderOf(issue)]?.[issue.fieldSlug]
      );

      if (read.success === false) {
        continue;
      }
      const { entryId, fieldSlug, componentItemId } = issue;

      if (componentItemId === undefined) {
        resolutions[entryId] = {
          ...resolutions[entryId],
          [fieldSlug]: read.data,
        };
        continue;
      }
      itemResolutions[entryId] = {
        ...itemResolutions[entryId],
        [componentItemId]: {
          ...itemResolutions[entryId]?.[componentItemId],
          [fieldSlug]: read.data,
        },
      };
    }

    return { resolutions, itemResolutions };
  }

  const onSubmit: SubmitHandler<RefusedChangeFormValues> = async ({
    resolutions,
  }) => {
    await onApply({
      acceptedContentLoss: acceptedContentLossOf(issues),
      ...answeredValues(resolutions),
    });
  };

  // What the change does to the Entries, one sentence per group, which is what
  // ci's head says below the question.
  const lostFields = [...new Set(lost.map((issue) => issue.fieldDefinitionId))];
  const lostEntries = [...new Set(lost.map((issue) => issue.entryId))];
  const neededFields = [
    ...new Set(needed.map((issue) => issue.fieldDefinitionId)),
  ];
  const neededEntries = [...new Set(needed.map((issue) => issue.entryId))];
  const firstLost = lost[0];
  const onlyRemoval =
    lostFields.length === 1 &&
    firstLost !== undefined &&
    lost.every((issue) => issue.reason === 'field_removed');
  const removedField =
    firstLost === undefined ? '' : fieldName(firstLost, storedFieldDefinitions);
  const firstNeeded = needed[0];
  const neededField =
    firstNeeded === undefined
      ? ''
      : fieldName(firstNeeded, newFieldDefinitions);
  // One sentence per group, which is what ci's head says below the question.
  const says = [
    lost.length === 0
      ? null
      : onlyRemoval
        ? t`Removing ${removedField} deletes its Value from ${plural(lostEntries.length, { one: '# Entry', other: '# Entries' })}.`
        : t`Saving deletes ${plural(lost.length, { one: '# Value', other: '# Values' })} from ${plural(lostEntries.length, { one: '# Entry', other: '# Entries' })}.`,
    firstNeeded === undefined
      ? null
      : neededFields.length === 1
        ? t`${neededField} needs a Value in ${plural(neededEntries.length, { one: '# Entry', other: '# Entries' })}.`
        : t`${plural(neededEntries.length, { one: '# Entry', other: '# Entries' })} need a Value before this can be saved.`,
  ].filter((sentence): sentence is string => sentence !== null);

  return (
    <FormLanguageContext
      value={{ language: valueLanguage, defaultLanguage: defaultLanguage }}
    >
      <DialogHeader>
        <DialogTitle>{question}</DialogTitle>
        <DialogDescription>{says.join(' ')}</DialogDescription>
      </DialogHeader>

      <AppForm
        form={refusedChangeForm}
        onSubmit={onSubmit}
        id={formId}
        blockedBy={blockedBy}
        // A grid item and a fieldset refuse to shrink below their content on
        // their own, so each box between the dialog and the rows is allowed
        // to, and a row too long for the dialog truncates inside it rather
        // than running past its edge.
        className="flex min-h-0 min-w-0 flex-col"
        fieldsetClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <DialogBody flush className="min-w-0">
          <div className="flex flex-col gap-3 px-5 pt-3 pb-5">
            {lost.length === 0 ? null : (
              <>
                <h3 className="flex items-center gap-1.5 pt-1 text-label">
                  {/* The group's color alone would carry what it is about, so the
                icon says it again. */}
                  <TriangleAlertIcon
                    aria-hidden
                    className="size-3 shrink-0 text-warning"
                  />
                  <Trans>Lost when you save</Trans>
                </h3>
                <ul className="flex flex-col border-t">
                  {lost.map((issue) => {
                    const section = sectionName(issue);

                    return (
                      <li
                        key={`${issue.entryId}.${issue.componentItemId ?? ''}.${issue.fieldDefinitionId}.${issue.language ?? ''}`}
                        className="flex h-9 shrink-0 items-center gap-3 border-b"
                      >
                        <EntryLink
                          issue={issue}
                          name={entryName(issue)}
                          onFollowLink={onFollowLink}
                        />
                        <span className="truncate text-muted-foreground">
                          {fieldName(issue, storedFieldDefinitions)}
                        </span>
                        {section === null ? null : (
                          <span className="shrink-0 text-muted-foreground">
                            {section}
                          </span>
                        )}
                        <span className="ml-auto min-w-0 truncate text-muted-foreground">
                          {/* The line through the Value says it is going, and the
                        words say the same, so neither the color nor the line
                        carries it alone. */}
                          <span className="sr-only">
                            <Trans>Would be lost:</Trans>{' '}
                          </span>
                          <s>{lostText(issue)}</s>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {needed.length === 0 ? null : (
              <>
                <h3 className="pt-1 text-label">
                  <Trans>Needs a Value</Trans>
                </h3>
                {/* One switch for the Values written here, as above an Entry's
              fields: Core takes the change only once every language of the
              Project holds each Value it needs. */}
                {written.length > 0 && supportedLanguages.length > 1 ? (
                  <LanguageSwitch
                    languages={supportedLanguages.map((candidate) => ({
                      language: candidate,
                      missing: missingByLanguage.get(candidate) ?? 0,
                      hasError: false,
                    }))}
                    language={valueLanguage}
                    onLanguageChange={setValueLanguage}
                  />
                ) : null}
                {/* The field as editors see it under its new rules, to fill in
              right here, which is what ci draws. */}
                {written.length === 0 ? null : (
                  <div className="flex flex-col gap-4">
                    {written.map(({ issue, fieldDefinition }) => {
                      const field = fieldName(issue, newFieldDefinitions);
                      const entry = entryName(issue);
                      const place = itemPlace(issue);
                      // The field and the Entry it belongs to, with the Entry
                      // leading there, as ci names the row. Both kinds of row
                      // read the same here, so the Entry keeps the whole line.
                      const named = (
                        <Trans>
                          {field} in{' '}
                          <EntryLink
                            issue={issue}
                            name={entry}
                            onFollowLink={onFollowLink}
                          />
                        </Trans>
                      );

                      return (
                        <FieldFromDefinition
                          key={`${holderOf(issue)}.${issue.fieldSlug}`}
                          form={refusedChangeForm}
                          fieldDefinition={fieldDefinition}
                          name={`resolutions.${holderOf(issue)}.${issue.fieldSlug}.content`}
                          label={{
                            node:
                              place === null ? (
                                named
                              ) : (
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="flex min-w-0 items-center gap-2">
                                    {named}
                                  </span>
                                  {/* Where the item sits, which is what tells
                                  two items of one Entry apart. It wraps rather
                                  than truncating, since the way to the item is
                                  the whole point of it. */}
                                  <span
                                    data-slot="field-label-place"
                                    className="text-small text-muted-foreground"
                                  >
                                    {place}
                                  </span>
                                </span>
                              ),
                            text:
                              place === null
                                ? t`${field} in ${entry}`
                                : t`${field} in ${entry}, ${place}`,
                          }}
                          missingWarning={
                            <Trans>
                              Missing, so the changes can&apos;t be saved yet
                            </Trans>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogBody>
      </AppForm>

      {/* The buttons and, below Save, the reason it waits, both inside the
      dialog's own footer: the row of buttons keeps the dialog's width, so the
      border above it and the padding around the reason are the dialog's. */}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
        <FormActions form={refusedChangeForm} id={formId} blockedBy={blockedBy}>
          {/* The button names the loss, as ci's rule for anything that deletes
          something kept on this computer asks. Without one there is nothing to
          warn about, so it is the primary Save. */}
          {lost.length === 0 ? (
            <SubmitButton Icon={Check}>
              <Trans>Save</Trans>
            </SubmitButton>
          ) : (
            <SubmitButton variant="destructive" Icon={Trash2}>
              {onlyRemoval
                ? t`Remove ${removedField} from ${plural(lostEntries.length, { one: '# Entry', other: '# Entries' })}`
                : t`Delete ${plural(lost.length, { one: '# Value', other: '# Values' })} from ${plural(lostEntries.length, { one: '# Entry', other: '# Entries' })}`}
            </SubmitButton>
          )}
        </FormActions>
      </DialogFooter>
    </FormLanguageContext>
  );
}

/**
 * One Entry by its title, leading to the Entry itself.
 *
 * Following it keeps the settings behind the dialog, so the person comes back
 * to what they had typed, and the question before losing changes is not asked
 * for it: the changes are kept rather than lost. Every other way out of the
 * settings still asks.
 */
function EntryLink({
  issue,
  name,
  onFollowLink,
}: {
  issue: SchemaChangeIssue;
  name: string;
  onFollowLink: () => void;
}): ReactElement {
  const { projectId } = useProject();

  return (
    <Link
      to="/projects/$projectId/collections/$collectionId/$entryId/update"
      params={{
        projectId,
        collectionId: issue.collectionId,
        entryId: issue.entryId,
      }}
      ignoreBlocker
      onClick={onFollowLink}
      // The app's link: the 2 px underline in the link color, and the weight
      // of whatever names the Entry, which is the row's own in a row and the
      // label's above a field.
      className="min-w-0 truncate underline decoration-link-underline decoration-2 underline-offset-2"
    >
      {name}
    </Link>
  );
}
