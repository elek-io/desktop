import { expect, type Page } from '@playwright/test';

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
 * dashboard is a Project route, so the ProjectSidebar (with the Synchronize
 * control) renders alongside it.
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

/** Fill the visible fields of the Project form. */
export async function fillProjectForm(
  page: Page,
  props: { name: string; description: string }
): Promise<void> {
  await page.getByLabel('Project name').fill(props.name);
  await page.getByLabel('Project description').fill(props.description);
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
  // Open the create form from the Projects list
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
