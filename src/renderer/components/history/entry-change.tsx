import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { fieldModule } from '@renderer/components/fields';
import { entryTitle } from '@renderer/components/fields/entry-title';
import { changeBefore } from '@renderer/components/history/change-before';
import { ChangePage } from '@renderer/components/history/change-page';
import {
  ReadField,
  ReadFields,
  ReadFieldsSkeleton,
  ReadValue,
} from '@renderer/components/history/read-field';
import {
  isValueChanged,
  valueReading,
} from '@renderer/components/history/value-reading';
import { LanguageSwitch } from '@renderer/components/language-switch';
import { Button } from '@renderer/components/ui/button';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { type ChangeSyncState } from '@renderer/lib/changeSyncState';
import {
  entryLanguage,
  type EntryLanguageSearch,
} from '@renderer/lib/entryLanguage';
import { cn, fieldWidth, languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  type Entry,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type GitCommit,
  type Project,
  type SupportedLanguage,
} from '@elek-io/core';

// A change of one Entry, as ci shows it: the Entry once, read rather than
// edited, laid out like its editor, with the Values that changed marked in
// place.
//
// Both states of the Entry are read at their own commit, and each Value is read
// through its field type's own `renderValue`, see `read-field.tsx`.

/** One Value of the Entry, as its field type is handed it. */
function valueContent(
  entry: Entry | undefined,
  fieldDefinition: FieldDefinition
): unknown {
  return entry?.values[fieldDefinition.slug]?.content;
}

/** How many of the Entry's Values this change touched in one language. */
function changedValues({
  fieldDefinitions,
  before,
  after,
  language,
}: {
  fieldDefinitions: FieldDefinition[];
  before: Entry | undefined;
  after: Entry | undefined;
  language: SupportedLanguage;
}): number {
  return fieldDefinitions.filter((fieldDefinition) =>
    isValueChanged({
      fieldDefinition,
      before: valueContent(before, fieldDefinition),
      after: valueContent(after, fieldDefinition),
      language,
    })
  ).length;
}

/**
 * One field of the Entry: its label, whether it changed, and its Value.
 *
 * It is a component of its own so each field reads its own Value as its type
 * reads one, and so a field keeps the width its definition gives it in the
 * editor.
 *
 * What the Value's body is, is the type's own answer too: a type that shows
 * more than text draws its own rows, as a reference does, and every other one
 * is read as text. Whether the field is marked at all comes from the stored
 * content either way, see `value-reading.ts`.
 */
function EntryField({
  fieldDefinition,
  before,
  after,
  isMarked,
  language,
  at,
}: {
  fieldDefinition: FieldDefinition;
  before: Entry | undefined;
  after: Entry | undefined;
  isMarked: boolean;
  language: SupportedLanguage;
  /** The commit each state of the Entry was read at. */
  at: { before: string | undefined; after: string | undefined };
}): ReactElement {
  const { translateContent, formatInUserLocale } = useProject();
  const module = fieldModule(fieldDefinition);
  const ReadRowsOfType = module.ReadRows;
  const reading = valueReading({
    fieldDefinition,
    before: valueContent(before, fieldDefinition),
    after: valueContent(after, fieldDefinition),
    isMarked,
    language,
    formatInUserLocale,
  });

  return (
    <ReadField
      label={translateContent({
        key: 'fieldDefinition.label',
        record: fieldDefinition.label,
      })}
      isChanged={reading.isChanged}
      className={cn('col-span-12', fieldWidth(fieldDefinition.inputWidth))}
    >
      {ReadRowsOfType === undefined ? (
        <ReadValue
          marks={reading.marks}
          className={cn(module.readsAsKey === true && 'font-mono')}
        />
      ) : (
        <ReadRowsOfType
          fieldDefinition={fieldDefinition}
          language={language}
          before={{
            content: valueContent(before, fieldDefinition),
            commitHash: at.before,
          }}
          after={{
            content: valueContent(after, fieldDefinition),
            commitHash: at.after,
          }}
          isMarked={isMarked}
        />
      )}
    </ReadField>
  );
}

/** The Entry's fields in the order and the groups its editor draws them in. */
function EntryFields({
  fieldDefinitions,
  before,
  after,
  isMarked,
  language,
  at,
}: {
  fieldDefinitions: FieldDefinitionOrGroup[];
  before: Entry | undefined;
  after: Entry | undefined;
  isMarked: boolean;
  language: SupportedLanguage;
  /** The commit each state of the Entry was read at. */
  at: { before: string | undefined; after: string | undefined };
}): ReactElement {
  const { translateContent } = useProject();

  return (
    <ReadFields>
      {fieldDefinitions.map((fieldDefinition) => {
        if ('isGroup' in fieldDefinition) {
          return (
            <FieldSet key={fieldDefinition.id} className="col-span-12">
              <FieldLegend>
                {translateContent({
                  key: 'fieldDefinitionGroup.label',
                  record: fieldDefinition.label,
                })}
              </FieldLegend>
              <FieldGroup className="grid grid-cols-12 gap-x-6 gap-y-4">
                {fieldDefinition.fieldDefinitions.map((member) => (
                  <EntryField
                    key={member.id}
                    fieldDefinition={member}
                    before={before}
                    after={after}
                    isMarked={isMarked}
                    language={language}
                    at={at}
                  />
                ))}
              </FieldGroup>
            </FieldSet>
          );
        }

        return (
          <EntryField
            key={fieldDefinition.id}
            fieldDefinition={fieldDefinition}
            before={before}
            after={after}
            isMarked={isMarked}
            language={language}
            at={at}
          />
        );
      })}
    </ReadFields>
  );
}

export interface EntryChangeProps {
  project: Project;
  commit: GitCommit;
  /** The Collection the Entry belongs to, which the commit carries. */
  collectionId: string;
  /** Every change of the Project, newest first, to find the one before this. */
  history: GitCommit[];
  syncState: ChangeSyncState;
  /** The language the address names, or nothing while it names none. */
  search: EntryLanguageSearch;
  onLanguageChange: (language: SupportedLanguage) => void;
}

/**
 * The chosen change of an Entry.
 *
 * The Collection is read as it stood at the change, because its field
 * definitions are what lay the Entry out and it may have been deleted since,
 * which would take the Entry with it. A change that created the Entry has no
 * state before it, and one that deleted it none after it, so each of those
 * shows the one state it has without marks, as ci asks.
 */
export function EntryChange({
  project,
  commit,
  collectionId,
  history,
  syncState,
  search,
  onLanguageChange,
}: EntryChangeProps): ReactElement {
  const { t } = useLingui();
  const {
    translateContent,
    userQuery: { data: user },
  } = useProject();
  const { method, reference } = commit.message;
  const projectId = project.id;
  // The change before this one to the same Entry. A shallow copy of the
  // repository may not hold it, which is what leaves an update with nothing to
  // compare against, so it then shows the Entry as it stands rather than
  // failing.
  const previous =
    method === 'create' ? undefined : changeBefore(history, commit);
  const isMarked =
    method !== 'create' && method !== 'delete' && previous !== undefined;

  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({
      projectId,
      id: collectionId,
      commitHash: commit.hash,
    })
  );
  // A change that deleted the Entry has no state after it to read.
  const afterQuery = useQueryNoError({
    ...queryOptions.entries.read({
      projectId,
      collectionId,
      id: reference.id,
      commitHash: commit.hash,
    }),
    enabled: method !== 'delete',
  });
  const beforeQuery = useQueryNoError({
    ...queryOptions.entries.read({
      projectId,
      collectionId,
      id: reference.id,
      ...(previous === undefined ? {} : { commitHash: previous.hash }),
    }),
    enabled: previous !== undefined,
  });

  const isReading =
    isReadingCollection ||
    (method !== 'delete' && afterQuery.isPending) ||
    (previous !== undefined && beforeQuery.isPending);
  const before = beforeQuery.data;
  const after = afterQuery.data;
  // The Entry as this change left it, which is what the page names and shows:
  // the state after it, or the last one there was where the change deleted it.
  const shown = after ?? before;
  const fieldDefinitions =
    collection === undefined
      ? []
      : flattenFieldDefinitions(collection.fieldDefinitions);
  const supportedLanguages = project.settings.language.supported;
  const defaultLanguage = project.settings.language.default;
  // How many Values changed in each language, which says in which language the
  // change opens: the default language first, since that is where most work
  // starts, then the others in the Project's own order.
  const languages = [
    defaultLanguage,
    ...supportedLanguages.filter((language) => language !== defaultLanguage),
  ];
  const changedIn = new Map(
    languages.map((language) => [
      language,
      isMarked
        ? changedValues({ fieldDefinitions, before, after, language })
        : 0,
    ])
  );
  const changedLanguage = languages.find(
    (language) => (changedIn.get(language) ?? 0) > 0
  );
  // The language on screen: the one the address names while the Project
  // supports it, else the one that changed, else the Project's default.
  const language = entryLanguage({
    search,
    supportedLanguages,
    defaultLanguage: changedLanguage ?? defaultLanguage,
  });
  const changedHere = changedIn.get(language) ?? 0;
  // The language by its word in the language the app is read in, which comes
  // from the system's own language data rather than from the catalog, so the
  // sentence that words it takes it as a placeholder, see `languageName`.
  const shownLanguage = languageName(language);
  const title =
    shown === undefined || user === null || user === undefined
      ? ''
      : entryTitle({ entry: shown, fieldDefinitions, language: user.language });
  // ci names the Collection by its plural here, since German declines the name
  // in this sentence and a Collection's name takes no ending, see ci's
  // docs/desktop.md.
  const collectionName =
    collection === undefined
      ? ''
      : translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        });

  return (
    <ChangePage
      commit={commit}
      title={title}
      whatItIs={t`An Entry in the ${collectionName} Collection`}
      syncState={syncState}
      open={
        // Nothing to open where the change deleted the Entry. The way in
        // carries the language on screen, so the Entry opens in the language
        // the change is read in.
        method === 'delete' ? undefined : (
          <Button
            variant="outline"
            className="no-underline"
            render={
              <Link
                to="/projects/$projectId/collections/$collectionId/$entryId/update"
                params={{ projectId, collectionId, entryId: reference.id }}
                search={{ language }}
              />
            }
          >
            <Trans>Open Entry</Trans>
          </Button>
        )
      }
    >
      {isReading ? (
        <ReadFieldsSkeleton label={t`Reading this change`} />
      ) : (
        <>
          {/* The switch stands below the head and above the fields, where ci
          draws it, with what changed in the language beside it. A Project of
          one language has nothing to switch between, so it shows the count
          alone. */}
          {isMarked || supportedLanguages.length > 1 ? (
            <div className="flex items-center gap-3 pb-2">
              {supportedLanguages.length > 1 ? (
                <LanguageSwitch
                  languages={supportedLanguages.map((candidate) => ({
                    language: candidate,
                    missing: 0,
                    hasError: false,
                  }))}
                  language={language}
                  onLanguageChange={onLanguageChange}
                />
              ) : null}
              {isMarked ? (
                <span
                  data-slot="changed-values"
                  className="text-small text-muted-foreground"
                >
                  {t`${plural(changedHere, {
                    one: '# Value changed',
                    other: '# Values changed',
                  })} in ${shownLanguage}`}
                </span>
              ) : null}
            </div>
          ) : null}
          <EntryFields
            fieldDefinitions={collection.fieldDefinitions}
            before={before}
            after={after}
            isMarked={isMarked}
            language={language}
            at={{ before: previous?.hash, after: commit.hash }}
          />
        </>
      )}
    </ChangePage>
  );
}
