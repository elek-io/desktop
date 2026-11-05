import { expect, type Locator, type Page } from '@playwright/test';

import type {
  CreateProjectProps,
  DeleteProjectProps,
  Project,
  SetRemoteOriginUrlProjectProps,
  SupportedLanguage,
  UpdateProjectProps,
} from '@elek-io/core';

import { navigate } from './navigation.js';

const defaultProjectProps: CreateProjectProps = {
  name: 'Test Project',
  description: 'A Project created by the E2E tests',
  settings: {
    language: {
      default: 'en',
      supported: ['en'],
    },
  },
};

/**
 * Create a Project directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify. To exercise the create flow through the form, use `createProject`.
 */
export async function createProjectViaIpc(
  page: Page,
  overrides: Partial<CreateProjectProps> = {}
): Promise<Project> {
  const props: CreateProjectProps = { ...defaultProjectProps, ...overrides };
  return page.evaluate(async (p) => window.ipc.core.projects.create(p), props);
}

/**
 * List every Project directly over IPC, bypassing the UI.
 *
 * Used to corroborate how many Projects a flow ended up making, which the
 * screen itself does not say.
 */
export async function listProjectsViaIpc(
  page: Page
): Promise<{ list: Project[]; total: number }> {
  return page.evaluate(async () => window.ipc.core.projects.list({ limit: 0 }));
}

/**
 * Update a Project directly over IPC, bypassing the UI. `props` is the full
 * `UpdateProjectProps`, so pass a spread of the Project with the parts adjusted.
 */
export async function updateProjectViaIpc(
  page: Page,
  props: UpdateProjectProps
): Promise<Project> {
  return page.evaluate(async (p) => window.ipc.core.projects.update(p), props);
}

/**
 * Add a language to a Project's supported set directly over IPC.
 *
 * Core writes only the Project file, so everything written before keeps the
 * languages it had. That is the real way a Collection ends up missing a
 * language a later save then demands, which the strict language-aware form
 * schemas validate against.
 */
export async function addProjectLanguageViaIpc(
  page: Page,
  project: Project,
  language: SupportedLanguage
): Promise<Project> {
  return updateProjectViaIpc(page, {
    id: project.id,
    name: project.name,
    description: project.description,
    settings: {
      ...project.settings,
      language: {
        ...project.settings.language,
        supported: [...project.settings.language.supported, language],
      },
    },
  });
}

/**
 * Set a Project's remote `origin` URL directly over IPC, bypassing the UI.
 *
 * Use this to arrange a Project that points at a remote (paired with
 * `setupRemote`) before exercising a flow that depends on that origin.
 */
export async function setRemoteOriginUrlViaIpc(
  page: Page,
  props: SetRemoteOriginUrlProjectProps
): Promise<void> {
  await page.evaluate(
    async (p) => window.ipc.core.projects.setRemoteOriginUrl(p),
    props
  );
}

/**
 * Delete a Project directly over IPC, bypassing the UI.
 *
 * Pass `force: true` to skip Core's delete guards (no origin / unpushed work),
 * used to remove a local copy so a bare mirror holds a Project the local data
 * dir does not, as the clone flow needs.
 */
export async function deleteProjectViaIpc(
  page: Page,
  props: DeleteProjectProps
): Promise<void> {
  await page.evaluate(async (p) => window.ipc.core.projects.delete(p), props);
}

/**
 * Route to a Project's dashboard and confirm the app rendered there. The
 * dashboard is a Project route, so the ProjectSidebar (with the Project card
 * and its Sync) renders alongside it.
 */
export async function navigateToProjectDashboard(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/dashboard`);
}

/** Route to a Project's general settings (update) page and confirm it rendered. */
export async function navigateToProjectSettings(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/settings/general`);
}

/** Route to a Project's commit history and confirm the app rendered there. */
export async function navigateToHistory(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/history`);
}

/** Route to a Project's version-control settings page and confirm it rendered. */
export async function navigateToVersionControl(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/settings/version-control`);
}

/** Route to a Project's Assets list and confirm the app rendered there. */
export async function navigateToAssets(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/assets`);
}

/** Route to the Create Project page and confirm the app rendered there. */
export async function navigateToProjectCreate(page: Page): Promise<void> {
  await navigate(page, '#/projects/create');
}

/** Fill the visible fields of the Project form. */
export async function fillProjectForm(
  page: Page,
  props: { name: string; description: string }
): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(props.name);
  await page.getByLabel('Description', { exact: true }).fill(props.description);
}

/** One Project's card on the Projects page, by the Project's name. */
export function projectCardOf(page: Page, name: string): Locator {
  return page
    .getByRole('main')
    .getByRole('link')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/**
 * Open the dialog that downloads a Project from another Git host, from the
 * Projects page or from the Welcome screen.
 */
export async function openDownloadDialog(page: Page): Promise<Locator> {
  await page
    .getByRole('button', { name: 'Download from another Git host' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Download from another Git host' })
  ).toBeVisible();

  return dialog;
}

/** Download a Project from an address through the dialog. */
export async function downloadProject(
  page: Page,
  url: string
): Promise<Locator> {
  const dialog = await openDownloadDialog(page);
  await dialog.getByLabel('Address', { exact: true }).fill(url);
  await dialog.getByRole('button', { name: 'Download' }).click();

  return dialog;
}

/**
 * Create a Project through the form and wait for the redirect to its dashboard.
 * Starts from the Projects list, where the create flow begins, and returns the
 * new Project's id parsed from the resulting route.
 */
export async function createProject(
  page: Page,
  props: { name: string; description: string }
): Promise<string> {
  // Open the create form from the Projects page, whose head carries the button
  // while it lists Projects and whose Welcome screen carries it while it does
  // not.
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/#\/projects\/create/);

  await fillProjectForm(page, props);

  // Submit. create navigates to /projects/{id}, which redirects to the dashboard
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/#\/projects\/[^/]+\/dashboard/);

  const hash = new URL(page.url()).hash;
  const id = hash.split('/')[2];
  if (id === undefined) {
    throw new Error(`Expected a project id in the route, got "${hash}"`);
  }
  return id;
}
