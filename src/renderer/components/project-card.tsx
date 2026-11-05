import { Link } from '@tanstack/react-router';

import {
  CheckFailureLine,
  LastReleaseLine,
  SyncStateLines,
  WhereItSyncs,
} from '@renderer/components/project-state';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProjectState } from '@renderer/hooks/useProjectState';
import { cn, initials } from '@renderer/lib/utils';

import type { Project, SupportedLanguage } from '@elek-io/core';

/** One cell of the ruled grid the Projects page lists its Projects in. */
const CARD = cn('relative flex flex-col gap-3.5 border-b px-6 pt-5 pb-5.5');

/**
 * The Project's initials, 36 px as ci draws them on a card, on the inverted
 * surface.
 *
 * Hidden from assistive technology, because the Project's name stands beside
 * it.
 */
function ProjectInitials({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-tag font-semibold text-background"
    >
      {initials(name)}
    </span>
  );
}

/**
 * One language of the Project, by its code.
 *
 * A code rather than the language's name, because this labels the Project
 * rather than speaking about it, which is where ci puts the code.
 */
function LanguageTag({
  language,
}: {
  language: SupportedLanguage;
}): React.JSX.Element {
  return (
    <span className="flex h-[18px] items-center rounded-sm border px-[5px] font-mono text-tag font-medium text-muted-foreground">
      {language.toLocaleUpperCase()}
    </span>
  );
}

/**
 * One Project on the Projects page: its name, description and languages, where
 * it syncs, then its state and its last Release.
 *
 * The whole card opens the Project, so there is one way in and the focus ring
 * is drawn inside the cell, which the grid would otherwise clip.
 *
 * Each card runs the check of its own Git repository and the read of its own
 * Releases, and draws what each of them says through the lines every card
 * shares, so a slow or failing read holds up nothing but its own card. Its
 * last Release takes the gray marker, because a list has one highlight at
 * most, see ci's docs/color.md.
 */
function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const state = useProjectState(project);

  return (
    <Link
      to="/projects/$projectId/dashboard"
      params={{ projectId: project.id }}
      className={cn(
        CARD,
        'no-underline hover:bg-muted/50 focus-visible:-outline-offset-4'
      )}
    >
      <div className="flex items-center gap-3">
        <ProjectInitials name={project.name} />
        <div className="flex min-w-0 flex-col leading-4">
          <span className="truncate text-label">{project.name}</span>
          <span className="truncate text-small text-muted-foreground">
            {project.description}
          </span>
        </div>
        <ul className="ml-auto flex flex-none flex-wrap justify-end gap-1 self-start">
          {project.settings.language.supported.map((language) => (
            <li key={language}>
              <LanguageTag language={language} />
            </li>
          ))}
        </ul>
      </div>

      {/*
        ci gives a card's state lines a wider column for the marker and the
        12 px icon than the sidebar's card does, 6 px between them, and no row
        height of its own, so each line is as tall as its own words.
      */}
      <div className="flex flex-col gap-1.5 text-muted-foreground [--state-lead:12px] [--state-line-height:auto]">
        <WhereItSyncs remoteOriginUrl={project.remoteOriginUrl} />
        <SyncStateLines state={state} />
        <CheckFailureLine state={state} />
        <LastReleaseLine state={state} />
      </div>
    </Link>
  );
}

/** The same cell while the Projects are still being read. */
function ProjectCardSkeleton(): React.JSX.Element {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-[14px] w-24 rounded" />
        <Skeleton className="h-[14px] w-32 rounded" />
        <Skeleton className="h-[14px] w-28 rounded" />
      </div>
    </div>
  );
}

export { ProjectCard, ProjectCardSkeleton };
