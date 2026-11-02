import { zodResolver } from '@hookform/resolvers/zod';
import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
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
import { AppField } from '@renderer/components/ui/app-form';
import { FieldLegend, FieldSet } from '@renderer/components/ui/field';
import { TextControl } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
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

/** One row of the feature list, with its words held as catalog messages. */
interface MarkdownFeatureRow {
  key: BooleanFeature;
  label: MessageDescriptor;
  hint: MessageDescriptor;
}

const blockFeatures: MarkdownFeatureRow[] = [
  {
    key: 'blockquotes',
    label: msg`Blockquotes`,
    hint: msg`Quoted text blocks.`,
  },
  { key: 'lists', label: msg`Lists`, hint: msg`Bulleted and numbered lists.` },
  {
    key: 'taskListItems',
    label: msg`Task list items`,
    hint: msg`Checkboxes inside lists. Requires lists.`,
  },
  {
    key: 'codeBlocks',
    label: msg`Code blocks`,
    hint: msg`Multi line code with an optional language.`,
  },
  {
    key: 'thematicBreak',
    label: msg`Thematic breaks`,
    hint: msg`Horizontal rules between sections.`,
  },
  {
    key: 'tables',
    label: msg`Tables`,
    hint: msg`Tables with aligned columns.`,
  },
  {
    key: 'footnotes',
    label: msg`Footnotes`,
    hint: msg`Footnote references and definitions.`,
  },
  {
    key: 'rawHtml',
    label: msg`Raw HTML`,
    hint: msg`Raw HTML passes through unsanitized. Whatever renders this Field must sanitize it.`,
  },
];

const inlineFeatures: MarkdownFeatureRow[] = [
  { key: 'emphasis', label: msg`Emphasis`, hint: msg`Italic text.` },
  { key: 'strong', label: msg`Strong`, hint: msg`Bold text.` },
  {
    key: 'inlineCode',
    label: msg`Inline code`,
    hint: msg`Code spans inside text.`,
  },
  {
    key: 'strikethrough',
    label: msg`Strikethrough`,
    hint: msg`Struck through text.`,
  },
  {
    key: 'hardLineBreaks',
    label: msg`Hard line breaks`,
    hint: msg`Line breaks inside a paragraph.`,
  },
  {
    key: 'externalLinks',
    label: msg`External links`,
    hint: msg`Links to external URLs.`,
  },
  {
    key: 'externalImages',
    label: msg`External images`,
    hint: msg`Images from external URLs.`,
  },
  {
    key: 'entryReferences',
    label: msg`Entry references`,
    hint: msg`Links to Entries of this Project.`,
  },
  {
    key: 'assetReferences',
    label: msg`Asset references`,
    hint: msg`Images and files from this Project's Assets.`,
  },
];

function MarkdownExtras({
  form,
}: DefinitionExtrasProps<MarkdownFieldDefinitionFormValues>): ReactElement {
  const { t } = useLingui();
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

  const featureRow = (feature: MarkdownFeatureRow): ReactElement => (
    <AppField
      key={feature.key}
      form={form}
      name={`features.${feature.key}`}
      label={i18n._(feature.label)}
      required
      description={i18n._(feature.hint)}
      orientation="horizontal"
      className="gap-4 rounded-lg border border-border p-3 shadow-xs"
    >
      {({ field, controlProps }) => (
        <Switch
          {...controlProps}
          aria-label={i18n._(feature.label)}
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
      )}
    </AppField>
  );

  return (
    <>
      <div className="flex flex-row items-center justify-between space-x-2">
        <AppField
          form={form}
          name="min"
          label={<Trans>Minimum</Trans>}
          description={
            <Trans>
              The minimum number of blocks (paragraphs, headings, lists) the
              content needs.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
        <AppField
          form={form}
          name="max"
          label={<Trans>Maximum</Trans>}
          description={
            <Trans>The maximum number of blocks the content can hold.</Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
      </div>

      <FieldSet>
        <FieldLegend>
          <Trans>Block features</Trans>
        </FieldLegend>
        <div className="space-y-2">
          <AppField
            form={form}
            name="features.headings"
            label={<Trans>Headings</Trans>}
            required
            description={
              <Trans>
                Which heading levels can be used. None disables headings.
              </Trans>
            }
            className="rounded-lg border border-border p-3 shadow-xs"
          >
            {({ controlProps }) => (
              <div className="flex flex-row gap-4" {...controlProps}>
                {markdownHeadingDepthSchema.options.map((option) => {
                  const depth = option.value;
                  return (
                    <label
                      key={depth}
                      className="flex flex-col items-center gap-1 text-sm"
                    >
                      <Trans>H{depth}</Trans>
                      <Switch
                        aria-label={t`Heading level ${depth}`}
                        checked={enabledHeadings.includes(depth)}
                        onCheckedChange={() => toggleHeadingDepth(depth)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </AppField>
          {blockFeatures.map((feature) => featureRow(feature))}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>
          <Trans>Inline features</Trans>
        </FieldLegend>
        <div className="space-y-2">
          {inlineFeatures.map((feature) => featureRow(feature))}
        </div>
      </FieldSet>

      {entryReferencesEnabled === true ? (
        <AppField
          form={form}
          name="ofCollections"
          label={<Trans>Restrict Entry references to Collections</Trans>}
          required
          description={
            <Trans>
              Only Entries from the selected Collections can be referenced. If
              none are selected, Entries from all Collections are available.
            </Trans>
          }
        >
          {({ controlProps }) => (
            <div className="space-y-2" {...controlProps}>
              {isReadingCollections === true ? (
                <Skeleton className="h-10" />
              ) : collectionList.list.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  <Trans>No Collections available in this project.</Trans>
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
                      className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
                    >
                      <div className="mr-4">
                        <span className="text-sm font-medium">{name}</span>
                      </div>
                      <Switch
                        aria-label={name}
                        checked={selectedCollectionIds.includes(collection.id)}
                        onCheckedChange={() => toggleCollection(collection.id)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </AppField>
      ) : null}

      {assetReferencesEnabled === true ? (
        <AppField
          form={form}
          name="ofAssetMimeTypes"
          label={<Trans>Restrict Asset references to file types</Trans>}
          required
          description={
            <Trans>
              Only Assets of the selected file types can be referenced. If none
              are selected, Assets of any type are available.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <div {...controlProps}>
              <AssetMimeTypePicker
                value={field.value}
                onChange={field.onChange}
              />
            </div>
          )}
        </AppField>
      ) : null}
    </>
  );
}

const markdownSpec: DefinitionSpec<MarkdownFieldDefinitionFormValues> = {
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
