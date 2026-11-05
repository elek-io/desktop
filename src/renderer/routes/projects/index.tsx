import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Download, Plus, RefreshCw, Tag, WifiOff } from 'lucide-react';
import { type ReactElement, type ReactNode, useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { BrandMark } from '@renderer/components/brand-mark';
import { Page } from '@renderer/components/page';
import { Pane, Panel } from '@renderer/components/pane';
import {
  ProjectCard,
  ProjectCardSkeleton,
} from '@renderer/components/project-card';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { TextControl } from '@renderer/components/ui/field-controls';
import { FilterInput } from '@renderer/components/ui/filter-input';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import queryOptions from '@renderer/queries/options';

import {
  type CloneProjectProps,
  cloneProjectSchema,
  type Project,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/')({
  component: ListProjectsPage,
});

/** The three notes the Welcome screen ends on, each an icon, a word and a line. */
function WelcomeNotes(): ReactElement {
  return (
    <div className="mt-14 grid w-full grid-cols-3 text-left">
      {[
        {
          // The note's own key, which nobody reads.
          key: 'offline',
          icon: WifiOff,
          title: <Trans>Offline</Trans>,
          line: <Trans>Every change is saved on this computer first.</Trans>,
        },
        {
          key: 'sync',
          icon: RefreshCw,
          title: <Trans>Sync</Trans>,
          line: <Trans>Share changes with everyone on the Project.</Trans>,
        },
        {
          key: 'release',
          icon: Tag,
          title: <Trans>Release</Trans>,
          line: <Trans>Version the whole Project for your site.</Trans>,
        },
      ].map(({ key, icon: Icon, title, line }) => (
        <div
          key={key}
          className="relative px-5 py-1 text-small text-muted-foreground not-first:before:absolute not-first:before:inset-y-[min(24px,20%)] not-first:before:left-0 not-first:before:w-px not-first:before:bg-border"
        >
          <span className="mb-1 flex items-center gap-1.5 text-label text-foreground">
            <Icon className="size-4" />
            {title}
          </span>
          {line}
        </div>
      ))}
    </div>
  );
}

/**
 * The Projects page with nothing on it yet, which is the first thing an editor
 * sees once they have a User: the mark, what to do, both ways to do it, and
 * three notes on what a Project is good for.
 *
 * It is the empty state of this page rather than a screen of its own, so the
 * page head with its filter is gone and nothing repeats the two actions.
 */
function Welcome({ onDownload }: { onDownload: () => void }): ReactElement {
  const router = useRouter();

  return (
    <Empty>
      <EmptyMedia variant="mark">
        <BrandMark className="size-16" />
      </EmptyMedia>
      <EmptyTitle>
        <Trans>Create your first Project</Trans>
      </EmptyTitle>
      <EmptyDescription>
        <Trans>
          A Project holds the content of one website or app. It is a folder of
          files on this computer, and you can work on it offline.
        </Trans>
      </EmptyDescription>
      <EmptyActions>
        <Button
          Icon={Plus}
          onClick={async () => router.navigate({ to: '/projects/create' })}
        >
          <Trans>Create Project</Trans>
        </Button>
        <Button Icon={Download} variant="outline" onClick={onDownload}>
          <Trans>Download from another Git host</Trans>
        </Button>
      </EmptyActions>
      <WelcomeNotes />
    </Empty>
  );
}

/** The head of one section of the page: what it holds, and how many. */
function SectionHead({
  title,
  count,
}: {
  title: ReactNode;
  count: number;
}): ReactElement {
  return (
    <div className="flex items-baseline gap-2 pb-3">
      <h2 className="text-label">{title}</h2>
      <span className="text-muted-foreground">{count}</span>
    </div>
  );
}

/**
 * The Projects on this computer, as a ruled grid of three columns.
 *
 * The grid spans the pane rather than the page body's text edge, so a card's
 * rule ends on the pane's own edge the way ci draws it, which is what the
 * negative margin takes back.
 */
function ProjectGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="-mx-(--pane-edge) grid grid-cols-3 border-t [&>*:not(:nth-child(3n+1))]:before:absolute [&>*:not(:nth-child(3n+1))]:before:inset-y-6 [&>*:not(:nth-child(3n+1))]:before:left-0 [&>*:not(:nth-child(3n+1))]:before:w-px [&>*:not(:nth-child(3n+1))]:before:bg-border">
      {children}
    </div>
  );
}

/**
 * Everything the Projects page shows, read inside the pane that shows it.
 *
 * A component of its own, because the read is what the pane answers for: the
 * boundary only catches what is thrown below it, so a read in the route
 * component above the pane would take the whole window to the error screen
 * instead. See contributing/error-handling.md.
 *
 * The page head belongs here too, since a computer with no Project at all shows
 * the Welcome screen in place of the whole page, head and all.
 */
function ProjectsPane({
  onDownload,
}: {
  onDownload: () => void;
}): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const [filter, setFilter] = useState('');
  const { data: projects, isPending: isListingProjects } = useQueryNoError(
    queryOptions.projects.list({
      limit: 0,
    })
  );

  if (isListingProjects === false && projects.total === 0) {
    return <Welcome onDownload={onDownload} />;
  }

  // The whole list is read at once, so the filter runs over what is already
  // here, see contributing/renderer/loading-and-updating-data.md.
  const needle = filter.trim().toLocaleLowerCase();
  const matches = (project: Project): boolean =>
    needle === '' ||
    `${project.name} ${project.description}`
      .toLocaleLowerCase()
      .includes(needle);
  const shown = isListingProjects
    ? []
    : projects.list.filter((project) => matches(project));

  return (
    <Page
      title={t`Projects`}
      actions={
        <>
          <FilterInput
            name={t`Filter Projects`}
            className="w-56 flex-none"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Button Icon={Download} variant="outline" onClick={onDownload}>
            <Trans>Download from another Git host</Trans>
          </Button>
          <Button
            Icon={Plus}
            onClick={async () => router.navigate({ to: '/projects/create' })}
          >
            <Trans>Create Project</Trans>
          </Button>
        </>
      }
    >
      {/* The count is of what the section shows, so it never contradicts the
      cards below it while a filter narrows them. */}
      <SectionHead
        title={<Trans>On this computer</Trans>}
        count={shown.length}
      />
      {isListingProjects ? (
        <ProjectGrid>
          {[1, 2, 3].map((key) => (
            <ProjectCardSkeleton key={key} />
          ))}
        </ProjectGrid>
      ) : shown.length === 0 ? (
        // A filter without matches says so in plain text, because the page
        // itself is not empty, see ci's docs/desktop.md.
        <p className="py-4 text-muted-foreground">
          <Trans>No Project matches the filter.</Trans>
        </p>
      ) : (
        <ProjectGrid>
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ProjectGrid>
      )}
    </Page>
  );
}

/**
 * Download a Project from another Git host, which is Core's clone.
 *
 * Download is blocked while the address is empty and says so, as Save is on
 * every form, so an untouched press sends nothing: `cloneProjectSchema` takes
 * any string, so Core would answer an empty address with `Internal` and the
 * whole window would go to the error screen. See
 * contributing/renderer/forms.md.
 *
 * It `handles` only `PreconditionFailed`, which Core raises for a repository
 * without a `draft` branch, so the dialog stays open with the address to
 * correct. Every other failure reaches the root error screen, see
 * contributing/error-handling.md.
 */
function DownloadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const cloneProjectForm = useAppForm<CloneProjectProps>({
    resolver: zodResolver(cloneProjectSchema),
    defaultValues: {
      url: '',
    },
  });
  // Core refuses a repository without a draft branch, which holds no Project
  // or one made before the branches were renamed. Said in the dialog, so the
  // address can be corrected. A git that cannot load a shared library raises
  // the same type, which the renderer cannot tell apart.
  // See contributing/error-handling.md.
  const [isCloneRefused, setIsCloneRefused] = useState(false);
  const { mutateAsync: cloneProject, handleError: handleCloneError } =
    useAppMutation(queryOptions.projects.clone, {
      handled: {
        PreconditionFailed: () => setIsCloneRefused(true),
      },
    });
  const formId = useId();

  const { url } = cloneProjectForm.watch();
  const blockedBy = emptyFieldsReason(countEmptyFields([url]));

  const onDownloadProject: SubmitHandler<CloneProjectProps> = async (props) => {
    setIsCloneRefused(false);
    try {
      await cloneProject(props);
      onOpenChange(false);
    } catch (error) {
      handleCloneError(error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        setIsCloneRefused(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Download from another Git host</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              A Project on GitHub, GitLab or any other Git host, to work on it
              on this computer.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <AppForm
            form={cloneProjectForm}
            schema={cloneProjectSchema}
            onSubmit={onDownloadProject}
            id={formId}
            blockedBy={blockedBy}
          >
            <AppField
              form={cloneProjectForm}
              name="url"
              label={<Trans>Address</Trans>}
              description={
                <Trans>
                  Whoever set the Project up sends you this address.
                </Trans>
              }
            >
              {({ field, controlProps }) => (
                <TextControl field={field} type="text" {...controlProps} />
              )}
            </AppField>
            {isCloneRefused ? (
              <p role="alert" className="mt-4 text-sm text-error">
                <Trans>
                  This repository holds no Project, or one made with an older
                  version of elek.io Desktop. Ask whoever set it up.
                </Trans>
              </p>
            ) : null}
          </AppForm>
        </DialogBody>

        {/* The reason stands under Download, so Cancel keeps the button's own
        height beside it rather than stretching to the column. */}
        <DialogFooter className="sm:items-start">
          <DialogClose render={<Button variant="ghost" />}>
            <Trans>Cancel</Trans>
          </DialogClose>
          <FormActions
            form={cloneProjectForm}
            id={formId}
            blockedBy={blockedBy}
          >
            <SubmitButton Icon={Download}>
              <Trans>Download</Trans>
            </SubmitButton>
          </FormActions>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListProjectsPage(): ReactElement {
  const { t } = useLingui();
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);

  return (
    <>
      <Panel>
        <Pane name={t`your Projects`}>
          <ProjectsPane onDownload={() => setIsDownloadDialogOpen(true)} />
        </Pane>
      </Panel>

      {/*
        A sibling of the panel rather than part of the pane, so what was typed
        into it is not thrown away by anything the pane re-reads.
      */}
      <DownloadDialog
        open={isDownloadDialogOpen}
        onOpenChange={setIsDownloadDialogOpen}
      />
    </>
  );
}
