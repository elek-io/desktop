import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
import { type Resolver } from 'react-hook-form';

import { AssetMimeTypePicker } from '@renderer/components/forms/asset-mime-type-picker';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { FieldLegend, FieldSet } from '@renderer/components/ui/field';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  markdownFieldDefinitionSchema,
  markdownHeadingDepthSchema,
  uuid,
  type MarkdownFeatures,
  type MarkdownFieldDefinition,
} from '@elek-io/core';

// Authoring for the markdown field type. See
// contributing/renderer/dynamic-form-field-generation.md and
// renderer/markdown-editor.md.
//
// This is the one spec whose form values and resolver output diverge: the form
// pins the recursive `defaultValue` mdast tree to null (it blows RHF's path-type
// instantiation, and v1 never edits it) while the resolver still yields a full
// MarkdownFieldDefinition. Hence the single `as unknown as Resolver` cast below.

// MarkdownFieldDefinition.defaultValue is a recursive mdast tree that blows
// react-hook-form's path type instantiation. The form never edits it (v1 keeps
// markdown defaults null), so the form values pin it to null. The resolver
// still validates and yields the full MarkdownFieldDefinition.
type MarkdownFieldDefinitionFormValues = Omit<
  MarkdownFieldDefinition,
  'defaultValue'
> & { defaultValue: null };

type BooleanFeature = Exclude<keyof MarkdownFeatures, 'headings'>;

const blockFeatures: { key: BooleanFeature; label: string; hint: string }[] = [
  { key: 'blockquotes', label: 'Blockquotes', hint: 'Quoted text blocks.' },
  { key: 'lists', label: 'Lists', hint: 'Bulleted and numbered lists.' },
  {
    key: 'taskListItems',
    label: 'Task list items',
    hint: 'Checkboxes inside lists. Requires lists.',
  },
  {
    key: 'codeBlocks',
    label: 'Code blocks',
    hint: 'Multi line code with an optional language.',
  },
  {
    key: 'thematicBreak',
    label: 'Thematic breaks',
    hint: 'Horizontal rules between sections.',
  },
  { key: 'tables', label: 'Tables', hint: 'Tables with aligned columns.' },
  {
    key: 'footnotes',
    label: 'Footnotes',
    hint: 'Footnote references and definitions.',
  },
  {
    key: 'rawHtml',
    label: 'Raw HTML',
    hint: 'Raw HTML passes through unsanitized. Whatever renders this Field must sanitize it.',
  },
];

const inlineFeatures: { key: BooleanFeature; label: string; hint: string }[] = [
  { key: 'emphasis', label: 'Emphasis', hint: 'Italic text.' },
  { key: 'strong', label: 'Strong', hint: 'Bold text.' },
  { key: 'inlineCode', label: 'Inline code', hint: 'Code spans inside text.' },
  {
    key: 'strikethrough',
    label: 'Strikethrough',
    hint: 'Struck through text.',
  },
  {
    key: 'hardLineBreaks',
    label: 'Hard line breaks',
    hint: 'Line breaks inside a paragraph.',
  },
  {
    key: 'externalLinks',
    label: 'External links',
    hint: 'Links to external URLs.',
  },
  {
    key: 'externalImages',
    label: 'External images',
    hint: 'Images from external URLs.',
  },
  {
    key: 'entryReferences',
    label: 'Entry references',
    hint: 'Links to Entries of this Project.',
  },
  {
    key: 'assetReferences',
    label: 'Asset references',
    hint: "Images and files from this Project's Assets.",
  },
];

function MarkdownExtras({
  form,
}: DefinitionExtrasProps<MarkdownFieldDefinitionFormValues>): ReactElement {
  const { projectId, translateContent } = useProject();
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  const enabledHeadings = form.watch('features.headings');
  const listsEnabled = form.watch('features.lists');
  const entryReferencesEnabled = form.watch('features.entryReferences');
  const assetReferencesEnabled = form.watch('features.assetReferences');
  const selectedCollectionIds = form.watch('ofCollections');

  function toggleHeadingDepth(
    depth: MarkdownFeatures['headings'][number]
  ): void {
    const next = enabledHeadings.includes(depth)
      ? enabledHeadings.filter((enabled) => enabled !== depth)
      : [...enabledHeadings, depth].sort((a, b) => a - b);
    form.setValue('features.headings', next);
  }

  function toggleCollection(collectionId: string): void {
    form.setValue(
      'ofCollections',
      selectedCollectionIds.includes(collectionId)
        ? selectedCollectionIds.filter((id) => id !== collectionId)
        : [...selectedCollectionIds, collectionId]
    );
  }

  const featureRow = (feature: {
    key: BooleanFeature;
    label: string;
    hint: string;
  }): ReactElement => (
    <FormField
      key={feature.key}
      control={form.control}
      name={`features.${feature.key}`}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700">
          <div className="mr-4">
            <FormLabel isRequired>{feature.label}</FormLabel>
            <FormDescription>{feature.hint}</FormDescription>
            <FormMessage />
          </div>
          <Switch
            aria-label={feature.label}
            checked={field.value}
            disabled={feature.key === 'taskListItems' && listsEnabled === false}
            onCheckedChange={(checked) => {
              field.onChange(checked);
              // Core rejects task list items without lists
              if (feature.key === 'lists' && checked === false) {
                form.setValue('features.taskListItems', false);
              }
              // Turning a reference feature off hides its restriction picker,
              // so clear the restriction with it rather than storing a list
              // that nothing reads.
              if (feature.key === 'entryReferences' && checked === false) {
                form.setValue('ofCollections', []);
              }
              if (feature.key === 'assetReferences' && checked === false) {
                form.setValue('ofAssetMimeTypes', []);
              }
            }}
          />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <div className="flex flex-row items-center justify-between space-x-2">
        <FormField
          control={form.control}
          name="min"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Minimum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The minimum number of blocks (paragraphs, headings, lists) the
                content needs.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="max"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Maximum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The maximum number of blocks the content can hold.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FieldSet>
        <FieldLegend>Block features</FieldLegend>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="features.headings"
            render={() => (
              <FormItem className="rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700">
                <FormLabel isRequired>Headings</FormLabel>
                <FormDescription>
                  Which heading levels can be used. None disables headings.
                </FormDescription>
                <div className="flex flex-row gap-4">
                  {markdownHeadingDepthSchema.options.map((option) => {
                    const depth = option.value;
                    return (
                      <label
                        key={depth}
                        className="flex flex-col items-center gap-1 text-sm"
                      >
                        H{depth}
                        <Switch
                          aria-label={`Heading level ${String(depth)}`}
                          checked={enabledHeadings.includes(depth)}
                          onCheckedChange={() => toggleHeadingDepth(depth)}
                        />
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          {blockFeatures.map((feature) => featureRow(feature))}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Inline features</FieldLegend>
        <div className="space-y-2">
          {inlineFeatures.map((feature) => featureRow(feature))}
        </div>
      </FieldSet>

      {entryReferencesEnabled === true ? (
        <FormField
          control={form.control}
          name="ofCollections"
          render={() => (
            <FormItem>
              <FormLabel isRequired={false}>
                Restrict Entry references to Collections
              </FormLabel>
              <FormDescription>
                Only Entries from the selected Collections can be referenced. If
                none are selected, Entries from all Collections are available.
              </FormDescription>
              <div className="space-y-2">
                {isReadingCollections === true ? (
                  <div className="h-10 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                ) : collectionList.list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Collections available in this project.
                  </p>
                ) : (
                  collectionList.list.map((collection) => {
                    const name = translateContent({
                      key: 'collection.name.plural',
                      record: collection.name.plural,
                    });
                    return (
                      <div
                        key={collection.id}
                        className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700"
                      >
                        <div className="mr-4">
                          <span className="text-sm font-medium">{name}</span>
                        </div>
                        <Switch
                          aria-label={name}
                          checked={selectedCollectionIds.includes(
                            collection.id
                          )}
                          onCheckedChange={() =>
                            toggleCollection(collection.id)
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      {assetReferencesEnabled === true ? (
        <FormField
          control={form.control}
          name="ofAssetMimeTypes"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>
                Restrict Asset references to file types
              </FormLabel>
              <FormDescription>
                Only Assets of the selected file types can be referenced. If
                none are selected, Assets of any type are available.
              </FormDescription>
              <AssetMimeTypePicker
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}

const markdownSpec: DefinitionSpec<MarkdownFieldDefinitionFormValues> = {
  authorableFieldType: 'markdown',
  // The resolver is typed over the schema input, whose recursive defaultValue
  // tree the form values pin to null (see MarkdownFieldDefinitionFormValues).
  // Every value the form holds is valid schema input, the Resolver generics just
  // cannot express that. This is the one cast this migration step adds.
  resolver: zodResolver(
    markdownFieldDefinitionSchema
  ) as unknown as Resolver<MarkdownFieldDefinitionFormValues>,
  // Markdown fields are never unique, keep the default value null, and default
  // every feature off (Core expects Desktop to opt features in explicitly).
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'mdast',
    fieldType: 'markdown',
    isUnique: false,
    defaultValue: null,
    min: null,
    max: null,
    features: {
      headings: [],
      blockquotes: false,
      lists: false,
      taskListItems: false,
      codeBlocks: false,
      thematicBreak: false,
      tables: false,
      footnotes: false,
      rawHtml: false,
      emphasis: false,
      strong: false,
      inlineCode: false,
      strikethrough: false,
      hardLineBreaks: false,
      externalLinks: false,
      externalImages: false,
      entryReferences: false,
      assetReferences: false,
    },
    ofCollections: [],
    ofAssetMimeTypes: [],
  }),
  Extras: MarkdownExtras,
};

/** The markdown authoring entry: a DefinitionDraft over the markdown spec. */
export function MarkdownDefinitionDraft(
  props: DefinitionDraftProps
): ReactElement {
  return <DefinitionDraft {...props} spec={markdownSpec} />;
}
