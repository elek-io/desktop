import { i18n } from '@lingui/core';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { PaneHead } from '@renderer/components/pane';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { SkeletonRows } from '@renderer/components/ui/skeleton';
import { useComponentUsage } from '@renderer/hooks/useComponentUsage';
import { useProject } from '@renderer/hooks/useProject';
import { cn } from '@renderer/lib/utils';
import { buttonVariants } from '@renderer/lib/variants';

import { type Component } from '@elek-io/core';

// The Components of a Project as ci's list of 296 px beside the chosen one: one
// ruled row each, with the Component's name, how many Entries use it and how
// many fields it defines. Create Component stands in the head.

/**
 * One Component of the list: its name, how many Entries use it and how many
 * fields it has.
 *
 * The whole row is the link, so there is one way in, and the Component it opens
 * is in the address. The open row takes the muted surface and the bar, and its
 * focus ring is drawn inside the row, which the pane's edge would otherwise
 * clip.
 */
function ComponentRow({
  projectId,
  component,
  name,
  entriesUsing,
}: {
  projectId: string;
  component: Component;
  /** The Component's name, in the language the app is read in. */
  name: string;
  /**
   * How many Entries hold a section built from it, or `null` where that could
   * not be read.
   */
  entriesUsing: number | null;
}): ReactElement {
  const { t } = useLingui();
  const fields = component.fieldDefinitions.length;
  // One sentence per case rather than a phrase spliced into one, so a
  // translation can word a Component nobody uses yet its own way, see
  // contributing/renderer/internationalization.md. The row says what it cannot
  // tell rather than claiming nothing uses it, as a Project card says it
  // cannot read the Releases, and it says it of the count alone: how many
  // fields the Component has is read off the Component itself.
  const says =
    entriesUsing === null
      ? t`Can't read how many Entries use it, ${plural(fields, { one: '# field', other: '# fields' })}`
      : entriesUsing === 0
        ? t`Not used yet, ${plural(fields, { one: '# field', other: '# fields' })}`
        : t`${plural(entriesUsing, { one: '# Entry uses it', other: '# Entries use it' })}, ${plural(fields, { one: '# field', other: '# fields' })}`;

  return (
    <Link
      data-slot="component-row"
      to="/projects/$projectId/components/$componentId"
      params={{ projectId, componentId: component.id }}
      activeProps={{ 'data-active': true }}
      className="flex items-start gap-2.5 border-b px-(--pane-edge) py-2.5 no-underline hover:bg-muted/50 focus-visible:-outline-offset-4 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-slot="component-name" className="truncate font-medium">
          {name}
        </span>
        <span
          data-slot="component-use"
          className={cn(
            'truncate text-small',
            // In the warning color where it says what it cannot tell, as ci
            // colors a state nothing is wrong with but nothing is known about
            // either.
            entriesUsing === null ? 'text-warning' : 'text-muted-foreground'
          )}
        >
          {says}
        </span>
      </span>
    </Link>
  );
}

export interface ComponentListPaneProps {
  projectId: string;
  /**
   * The Project's Components, or `undefined` while they are still being read.
   */
  components: Component[] | undefined;
}

/**
 * The pane of 296 px beside the chosen Component: how many Components the
 * Project has, Create Component, and one row per Component.
 *
 * How many Entries use each one is read here rather than passed in, so a read
 * that fails is answered in this pane's own rows rather than taking the screen
 * with it. The rows wait for it, so a row says what it says once rather than
 * gaining half of it a moment later. A read that failed leaves every row
 * standing and says in the row that the count could not be read, since the
 * Components themselves were read and the list is the only way to one.
 *
 * The rows stand in the order of the names they show, as ci's list does. Core
 * answers in the order the Components sit on disk, which is the order of their
 * uuid folders, so the same Components would stand in a different order in
 * every Project.
 */
export function ComponentListPane({
  projectId,
  components,
}: ComponentListPaneProps): ReactElement {
  const { t } = useLingui();
  const { translateContent } = useProject();
  const {
    entriesByComponent,
    isPending: isReadingUsage,
    error: usageError,
  } = useComponentUsage(projectId);
  // By the name the row shows, compared in the language the app is read in, so
  // the order follows that language's own rules rather than the code points,
  // which would put Teaser ahead of gallery. A name that reads the same for
  // the collator, such as two Components called Hero, is settled by the slug,
  // which is unique in the Project, so an order nobody set is never left to
  // the disk. `numeric` keeps Section 2 ahead of Section 10.
  const byName = new Intl.Collator(i18n.locale, { numeric: true });
  const rows =
    components === undefined
      ? []
      : components
          .map((component) => ({
            component,
            name: translateContent({
              key: 'component.name',
              record: component.name,
            }),
          }))
          .sort(
            (one, other) =>
              byName.compare(one.name, other.name) ||
              byName.compare(one.component.slug, other.component.slug)
          );

  return (
    // The rows are the way from one Component to the next, which is what makes
    // this a navigation rather than a column of content.
    <nav aria-label={t`Components`} className="flex min-h-0 flex-1 flex-col">
      <PaneHead>
        {/* The chosen Component beside it carries the screen's h1, so the
        list's own title is the heading below it. */}
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-label">
          <span className="truncate">
            <Trans>Components</Trans>
          </span>
          {components === undefined ? null : (
            <span className="font-normal text-muted-foreground">
              {components.length}
            </span>
          )}
        </h2>
        {/* A link rather than a button, because it opens a page, which is what
        lets the question before losing changes catch it. It takes the ghost
        icon button's own look, as ci draws it. */}
        <Link
          to="/projects/$projectId/components/create"
          params={{ projectId }}
          aria-label={t`Create Component`}
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
        >
          <PlusIcon />
        </Link>
      </PaneHead>
      <ScrollArea className="flex-1">
        {/* The rows span the pane rather than its text edge, so a row's rule
        ends on the pane's divider the way ci draws it, which is what the
        negative margin takes back, and each row carries the edge itself. */}
        <div className="px-(--pane-edge) pb-6">
          {components === undefined || isReadingUsage ? (
            <SkeletonRows label={t`Loading the Components`} />
          ) : (
            <div
              data-slot="component-list"
              className="-mx-(--pane-edge) border-t [&>*:last-child]:border-b-0"
            >
              {rows.map(({ component, name }) => (
                <ComponentRow
                  key={component.id}
                  projectId={projectId}
                  component={component}
                  name={name}
                  entriesUsing={
                    usageError === null
                      ? (entriesByComponent.get(component.id) ?? 0)
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </nav>
  );
}
