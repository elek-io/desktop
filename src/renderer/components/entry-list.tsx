import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { PlusIcon, SettingsIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { entryTitle } from '@renderer/components/fields/entry-title';
import { missingRequiredValues } from '@renderer/components/fields/missing-values';
import { PaneHead } from '@renderer/components/pane';
import { Badge } from '@renderer/components/ui/badge';
import { FilterInput } from '@renderer/components/ui/filter-input';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { SkeletonRows } from '@renderer/components/ui/skeleton';
import { useComponentResolver } from '@renderer/hooks/useComponentResolver';
import { useProject } from '@renderer/hooks/useProject';
import { languageName } from '@renderer/lib/utils';
import { buttonVariants } from '@renderer/lib/variants';

import {
  flattenFieldDefinitions,
  type Collection,
  type Entry,
  type FieldDefinition,
  type Project,
  type SupportedLanguage,
} from '@elek-io/core';

// The Entries of a Collection as ci's list of 296 px beside the editor: one
// ruled row each, with the Entry's title, when it last changed, and the one
// badge that says it misses a required Value.
//
// ci draws who changed it beside the date as well. Core stores no author on an
// Entry, only on each of its changes, so saying it would cost a read of every
// Entry's history, see contributing/renderer/loading-and-updating-data.md.

/** The catalog's `t`, as a component reads it through `useLingui`. */
type Translate = ReturnType<typeof useLingui>['t'];

/**
 * What a row says about the Values its Entry is missing, in the words a screen
 * reader hears: the language and how many, as ci writes it.
 */
function missingText(
  missing: Map<SupportedLanguage, number>,
  t: Translate
): string | null {
  const found = [...missing.entries()].find(([, count]) => count > 0);

  if (found === undefined) {
    return null;
  }

  const [language, count] = found;
  const name = languageName(language);
  return t`${name} is missing ${plural(count, {
    one: '# Value',
    other: '# Values',
  })}`;
}

/**
 * One Entry of the list: its title, when it last changed, and the badge for a
 * required Value it is still missing.
 *
 * The whole row is the link, so there is one way in, and the Entry it opens is
 * in the address, which is what lets the question before losing changes catch a
 * click on the next Entry. The open row takes the muted surface and the bar,
 * and its focus ring is drawn inside the row, which the pane's edge would
 * otherwise clip.
 */
function EntryRow({
  entry,
  collection,
  project,
  fieldDefinitions,
  missing,
}: {
  entry: Entry;
  collection: Collection;
  project: Project;
  fieldDefinitions: FieldDefinition[];
  /** How many required Values each language is missing, or null while unknown. */
  missing: Map<SupportedLanguage, number> | null;
}): ReactElement {
  const { t } = useLingui();
  const {
    formatDatetime,
    userQuery: { data: user },
  } = useProject();
  const title = entryTitle({
    entry,
    fieldDefinitions,
    language: user?.language ?? project.settings.language.default,
  });
  const says = missing === null ? null : missingText(missing, t);

  return (
    <Link
      data-slot="entry-row"
      to="/projects/$projectId/collections/$collectionId/$entryId/update"
      params={{
        projectId: project.id,
        collectionId: collection.id,
        entryId: entry.id,
      }}
      activeProps={{ 'data-active': true }}
      className="flex items-start gap-2.5 border-b px-(--pane-edge) py-2.5 no-underline hover:bg-muted/50 focus-visible:-outline-offset-4 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-small text-muted-foreground">
          {
            formatDatetime({ datetime: entry.updated ?? entry.created })
              .relative
          }
        </span>
      </span>
      {says === null ? null : (
        <Badge variant="warning">
          {/* The badge's color alone would carry it, so the icon says it
          again, which Nils decided on 2026-10-03. */}
          <TriangleAlertIcon aria-hidden />
          <Trans>Missing</Trans>
          {/* What exactly is missing, which the badge itself has no room for. */}
          <span className="sr-only">: {says}</span>
        </Badge>
      )}
    </Link>
  );
}

export interface EntryListPaneProps {
  project: Project;
  /** The Collection, or `undefined` while it is still being read. */
  collection: Collection | undefined;
  /** The Collection's Entries, or `undefined` while they are still being read. */
  entries: Entry[] | undefined;
}

/**
 * The pane of 296 px beside the editor: the Collection's name and how many
 * Entries it holds, the way to its settings and the way to a new Entry, the
 * filter, and one row per Entry.
 *
 * The filter stands above the rows rather than scrolling with them, so it is
 * still there once somebody has scrolled the list.
 */
export function EntryListPane({
  project,
  collection,
  entries,
}: EntryListPaneProps): ReactElement {
  const { t } = useLingui();
  const { translateContent } = useProject();
  const [filter, setFilter] = useState('');
  const collectionName =
    collection === undefined
      ? ''
      : translateContent({
          key: 'currentCollection.name.plural',
          record: collection.name.plural,
        });
  const entryName =
    collection === undefined
      ? ''
      : translateContent({
          key: 'currentCollection.name.singular',
          record: collection.name.singular,
        });
  // A section's own required Values count too, so the badge needs the field
  // definitions of each Component a section is built from. Until those are
  // read, no row claims anything rather than claiming a count that is too low.
  const { componentResolver, isReadingComponents } = useComponentResolver(
    project.id
  );
  const fieldDefinitions = useMemo(
    () =>
      collection === undefined
        ? []
        : flattenFieldDefinitions(collection.fieldDefinitions),
    [collection]
  );
  const { supported, default: defaultLanguage } = project.settings.language;
  const missingByEntry = useMemo(() => {
    if (
      entries === undefined ||
      collection === undefined ||
      isReadingComponents
    ) {
      return new Map<string, Map<SupportedLanguage, number>>();
    }

    return new Map(
      entries.map((entry) => [
        entry.id,
        missingRequiredValues({
          values: entry.values,
          fieldDefinitions,
          supportedLanguages: supported,
          defaultLanguage,
          componentFieldDefinitions: componentResolver,
        }),
      ])
    );
  }, [
    entries,
    collection,
    fieldDefinitions,
    supported,
    defaultLanguage,
    componentResolver,
    isReadingComponents,
  ]);

  const needle = filter.trim().toLowerCase();
  const shown = (entries ?? []).filter(
    (entry) =>
      needle === '' ||
      entryTitle({ entry, fieldDefinitions, language: defaultLanguage })
        .toLowerCase()
        .includes(needle)
  );

  return (
    <>
      <PaneHead>
        <h1 className="flex min-w-0 flex-1 items-baseline gap-2 text-label">
          <span className="truncate">{collectionName}</span>
          {entries === undefined ? null : (
            <span className="font-normal text-muted-foreground">
              {entries.length}
            </span>
          )}
        </h1>
        {/*
          The head gains its two ways on once the Collection is read, since
          both are named after it. A link rather than a button, because each
          leads to an address of its own, which is what lets the question
          before losing changes catch it. They take the ghost icon button's own
          look, as ci draws them.
        */}
        {collection === undefined ? null : (
          <>
            <Link
              to="/projects/$projectId/collections/$collectionId/update"
              params={{ projectId: project.id, collectionId: collection.id }}
              aria-label={t`Settings of the ${collectionName} Collection`}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <SettingsIcon />
            </Link>
            <Link
              to="/projects/$projectId/collections/$collectionId/create"
              params={{ projectId: project.id, collectionId: collection.id }}
              aria-label={t`Create ${entryName}`}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <PlusIcon />
            </Link>
          </>
        )}
      </PaneHead>
      {collection === undefined ? null : (
        <div className="px-(--pane-edge) pb-3">
          <FilterInput
            name={t`Filter ${collectionName}`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      )}
      <ScrollArea className="flex-1">
        {/* The rows span the pane rather than its text edge, so a row's rule
        ends on the pane's divider the way ci draws it, which is what the
        negative margin takes back, and each row carries the edge itself. */}
        <div className="px-(--pane-edge) pb-6">
          {entries === undefined || collection === undefined ? (
            <EntryListSkeleton />
          ) : shown.length === 0 ? (
            <p className="py-4 text-muted-foreground">
              <Trans>No results.</Trans>
            </p>
          ) : (
            <div
              data-slot="entry-list"
              className="-mx-(--pane-edge) border-t [&>*:last-child]:border-b-0"
            >
              {shown.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  collection={collection}
                  project={project}
                  fieldDefinitions={fieldDefinitions}
                  missing={missingByEntry.get(entry.id) ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

/** The same rows while the Entries are still being read. */
export function EntryListSkeleton(): ReactElement {
  const { t } = useLingui();

  return <SkeletonRows label={t`Loading Entries`} />;
}
