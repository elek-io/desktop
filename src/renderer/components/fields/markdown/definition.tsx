import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { type FieldValues } from 'react-hook-form';

import { type DefinitionBinding } from '@renderer/components/fields/module';
import {
  DefinitionBounds,
  DefinitionChoiceRows,
  type DefinitionChoice,
} from '@renderer/components/forms/definition-controls';
import { MimeTypeRows } from '@renderer/components/forms/mime-type-rows';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  markdownHeadingDepthSchema,
  type MarkdownFeatures,
} from '@elek-io/core';

// The settings of a markdown field. See
// contributing/renderer/dynamic-form-field-generation.md and
// renderer/markdown-editor.md.
//
// What a markdown field allows is two lists, as ci draws every list a type
// takes: the blocks its text can be built from, and what can be marked inside
// a line. Each row is one thing the editor may use, so the rows are what the
// field allows and Add offers the rest.

/** The features that are not one boolean of their own, as a heading level is. */
type BooleanFeature = Exclude<keyof MarkdownFeatures, 'headings'>;

/* eslint-disable lingui/no-unlocalized-strings -- the keys a block and a
   restriction are stored under, which nobody reads as words. */

/** The key a heading level is stored under in the list of blocks. */
const HEADING_PREFIX = 'heading-';

/**
 * The restriction a feature carries, by the feature it belongs to.
 *
 * A restriction says nothing once what it restricts is gone, so taking the
 * feature away clears it rather than keeping a list nothing reads.
 */
const RESTRICTION_OF: Partial<
  Record<BooleanFeature, 'ofCollections' | 'ofAssetMimeTypes'>
> = {
  entryReferences: 'ofCollections',
  assetReferences: 'ofAssetMimeTypes',
};

/* eslint-enable lingui/no-unlocalized-strings */

/** One thing a markdown field can allow, with the words it reads as. */
interface MarkdownFeatureRow {
  key: BooleanFeature;
  label: MessageDescriptor;
}

const blockFeatures: MarkdownFeatureRow[] = [
  { key: 'blockquotes', label: msg`Quotes` },
  { key: 'lists', label: msg`Lists` },
  { key: 'taskListItems', label: msg`Task lists` },
  { key: 'codeBlocks', label: msg`Code blocks` },
  { key: 'thematicBreak', label: msg`Dividers` },
  { key: 'tables', label: msg`Tables` },
  { key: 'footnotes', label: msg`Footnotes` },
  { key: 'rawHtml', label: msg`Raw HTML` },
];

const inlineFeatures: MarkdownFeatureRow[] = [
  { key: 'strong', label: msg`Bold` },
  { key: 'emphasis', label: msg`Italic` },
  { key: 'strikethrough', label: msg`Struck through` },
  { key: 'inlineCode', label: msg`Code` },
  { key: 'hardLineBreaks', label: msg`Line breaks` },
  { key: 'externalLinks', label: msg`Links to the web` },
  { key: 'externalImages', label: msg`Images from the web` },
  { key: 'entryReferences', label: msg`Links to Entries` },
  { key: 'assetReferences', label: msg`Assets of this Project` },
];

/**
 * The next features, with the ones a feature depends on taken into account.
 *
 * Core refuses task lists without lists, so taking lists away takes task lists
 * with them, and a restriction that only means anything while its feature is
 * on is cleared with it.
 */
function featuresWithout(
  features: MarkdownFeatures,
  key: BooleanFeature
): MarkdownFeatures {
  return {
    ...features,
    [key]: false,
    ...(key === 'lists' ? { taskListItems: false } : {}),
  };
}

/** The settings of a markdown field: what its text may be built from. */
export function MarkdownDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
}: DefinitionBinding<
  'markdown',
  TFieldValues,
  TTransformedValues
>): ReactElement {
  const { t } = useLingui();
  const { projectId, translateContent } = useProject();
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const collections = isReadingCollections ? [] : collectionList.list;
  const features = fieldDefinition.features;
  const headingRow = (depth: number): DefinitionChoice => ({
    key: `${HEADING_PREFIX}${String(depth)}`,
    title: t`Heading ${depth}`,
  });
  // Task lists are offered only once lists are, since Core refuses the one
  // without the other.
  const isOffered = (key: BooleanFeature): boolean =>
    features[key] === false && (key !== 'taskListItems' || features.lists);
  const featureRows = (rows: MarkdownFeatureRow[]): DefinitionChoice[] =>
    rows
      .filter((row) => features[row.key])
      .map((row) => ({ key: row.key, title: i18n._(row.label) }));
  const offeredRows = (rows: MarkdownFeatureRow[]): DefinitionChoice[] =>
    rows
      .filter((row) => isOffered(row.key))
      .map((row) => ({ key: row.key, title: i18n._(row.label) }));
  const setFeature = (key: string, allowed: boolean): void => {
    if (key.startsWith(HEADING_PREFIX)) {
      const depth = Number(key.slice(HEADING_PREFIX.length));
      set('features', {
        ...features,
        headings: allowed
          ? [...features.headings, depth].sort((one, other) => one - other)
          : features.headings.filter((enabled) => enabled !== depth),
      });
      return;
    }

    const feature = blockFeatures
      .concat(inlineFeatures)
      .find((row) => row.key === key);
    if (feature === undefined) {
      return;
    }
    if (allowed) {
      set('features', { ...features, [feature.key]: true });
      return;
    }
    set('features', featuresWithout(features, feature.key));
    const restriction = RESTRICTION_OF[feature.key];
    if (restriction !== undefined) {
      set(restriction, []);
    }
  };
  const blocksLabel = t`Blocks`;
  const inlineLabel = t`Inside a line`;
  const collectionsLabel = t`Entries from Collections`;
  const chosenCollectionIds = fieldDefinition.ofCollections;

  return (
    <>
      <DefinitionChoiceRows
        form={form}
        name={path('features')}
        label={blocksLabel}
        labelText={blocksLabel}
        description={
          <Trans>What the text can be built from, besides paragraphs.</Trans>
        }
        chosen={[
          ...features.headings.map(headingRow),
          ...featureRows(blockFeatures),
        ]}
        offered={[
          ...markdownHeadingDepthSchema.options
            .map((option) => option.value)
            .filter((depth) => features.headings.includes(depth) === false)
            .map(headingRow),
          ...offeredRows(blockFeatures),
        ]}
        addLabel={t`Add block`}
        emptyNote={<Trans>Editors write paragraphs only.</Trans>}
        nothingToAddNote={<Trans>Every block is allowed.</Trans>}
        onAdd={(key) => setFeature(key, true)}
        onRemove={(key) => setFeature(key, false)}
      />

      <DefinitionChoiceRows
        form={form}
        name={path('features.strong')}
        label={inlineLabel}
        labelText={inlineLabel}
        description={<Trans>What editors can mark inside a line.</Trans>}
        chosen={featureRows(inlineFeatures)}
        offered={offeredRows(inlineFeatures)}
        addLabel={t`Add a mark`}
        emptyNote={<Trans>Editors write plain text only.</Trans>}
        nothingToAddNote={<Trans>Everything is allowed.</Trans>}
        onAdd={(key) => setFeature(key, true)}
        onRemove={(key) => setFeature(key, false)}
      />

      {features.entryReferences ? (
        <DefinitionChoiceRows
          form={form}
          name={path('ofCollections')}
          label={collectionsLabel}
          labelText={collectionsLabel}
          description={
            <Trans>
              Editors can only link an Entry of these Collections. Every
              Collection is allowed while this is empty.
            </Trans>
          }
          chosen={chosenCollectionIds.map((id) => ({
            key: id,
            title:
              collections.find((candidate) => candidate.id === id) === undefined
                ? t`A Collection that is gone`
                : translateContent({
                    key: 'collection.name.plural',
                    record:
                      collections.find((candidate) => candidate.id === id)?.name
                        .plural ?? {},
                  }),
          }))}
          offered={collections
            .filter(
              (collection) =>
                chosenCollectionIds.includes(collection.id) === false
            )
            .map((collection) => ({
              key: collection.id,
              title: translateContent({
                key: 'collection.name.plural',
                record: collection.name.plural,
              }),
            }))}
          addLabel={t`Add Collection`}
          emptyNote={<Trans>Every Collection is allowed.</Trans>}
          nothingToAddNote={
            collections.length === 0 ? (
              <Trans>This Project holds no other Collection yet.</Trans>
            ) : undefined
          }
          onAdd={(id) => set('ofCollections', [...chosenCollectionIds, id])}
          onRemove={(id) =>
            set(
              'ofCollections',
              chosenCollectionIds.filter((chosen) => chosen !== id)
            )
          }
        />
      ) : null}

      {features.assetReferences ? (
        <MimeTypeRows
          form={form}
          name={path('ofAssetMimeTypes')}
          label={t`Assets of file types`}
          description={
            <Trans>
              Editors can only place an Asset of these types. Every type is
              allowed while this is empty.
            </Trans>
          }
          addLabel={t`Add file type`}
          chosen={fieldDefinition.ofAssetMimeTypes}
          onChange={(mimeTypes) => set('ofAssetMimeTypes', mimeTypes)}
        />
      ) : null}

      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={
          <Trans>
            The number of blocks, such as paragraphs and headings, the text can
            hold.
          </Trans>
        }
      />
    </>
  );
}
