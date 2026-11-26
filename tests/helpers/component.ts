import { expect, type Locator, type Page } from '@playwright/test';

import {
  type Component,
  type CreateComponentProps,
  type ListComponentsProps,
  type PaginatedList,
  type UpdateComponentProps,
} from '@elek-io/core';

import { textFieldDefinition } from './collection.js';
import { mainPanel, navigate } from './navigation.js';

/**
 * Create a Component directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify. `projectId` is required, everything else defaults to a valid
 * single-language Component with one required text field ("title"). To
 * exercise the create flow through the form, use the Component create route.
 */
export async function createComponentViaIpc(
  page: Page,
  overrides: Partial<CreateComponentProps> & { projectId: string }
): Promise<Component> {
  const props: CreateComponentProps = {
    name: { en: 'Teaser' },
    slug: 'teaser',
    description: null,
    fieldDefinitions: [textFieldDefinition()],
    ...overrides,
  };

  return page.evaluate(
    async (p) => window.ipc.core.components.create(p),
    props
  );
}

/**
 * Update a Component directly over IPC, bypassing the UI.
 *
 * Used to arrange a change the form cannot make yet, such as renaming a field
 * definition's slug while keeping its id, which is what Core matches on. Pass
 * the whole Component plus `projectId`, as the configure form does.
 */
export async function updateComponentViaIpc(
  page: Page,
  props: UpdateComponentProps
): Promise<Component> {
  return page.evaluate(
    async (p) => window.ipc.core.components.update(p),
    props
  );
}

/**
 * List the Project's Components directly over IPC, in the order Core answers.
 *
 * Used to hand a stub of `core:components:list` the Components Core really
 * holds, in an order of the spec's own choosing.
 */
export async function listComponentsViaIpc(
  page: Page,
  projectId: string
): Promise<PaginatedList<Component>> {
  return page.evaluate(async (p) => window.ipc.core.components.list(p), {
    projectId,
    limit: 0,
  } satisfies ListComponentsProps);
}

/** Read a Component directly over IPC, to assert what was written. */
export async function readComponentViaIpc(
  page: Page,
  props: { projectId: string; id: string }
): Promise<Component> {
  return page.evaluate(async (p) => window.ipc.core.components.read(p), props);
}

/** Route to the Components list and confirm the app rendered there. */
export async function navigateToComponents(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/components`);
}

/** Route to the Component create form and confirm it rendered. */
export async function navigateToComponentCreate(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/components/create`);
}

/** Route to one Component's settings and confirm it rendered. */
export async function navigateToComponent(
  page: Page,
  ids: { projectId: string; componentId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/components/${ids.componentId}`
  );
}

/**
 * The list of Components beside the chosen one, so a caller can scope its
 * locators to it.
 *
 * Scoped to the main panel, since the Project's sidebar carries a Components
 * row of its own.
 */
export function componentListPane(page: Page): Locator {
  return mainPanel(page).getByRole('navigation', { name: 'Components' });
}

/**
 * One row of that list, by the Component's name.
 *
 * Found by the name the row shows rather than by the row's whole accessible
 * name, which carries how many Entries use it and how many fields it has.
 */
export function componentRow(page: Page, name: string): Locator {
  return componentListPane(page)
    .locator('[data-slot="component-row"]')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** Open a Component from the list beside it. */
export async function chooseComponent(page: Page, name: string): Promise<void> {
  await componentRow(page, name).click();
}

/**
 * Fill the visible base fields of the Component form, in the language the
 * switch above the page shows.
 *
 * Scoped to the main area, so the pane of the chosen field, whose Label, Slug
 * and Description carry names of their own, cannot make a locator ambiguous.
 */
export async function fillComponentForm(
  page: Page,
  props: { name: string; slug: string; description?: string }
): Promise<void> {
  const settings = page.getByRole('main');

  await settings.getByLabel('Component name', { exact: true }).fill(props.name);
  await settings.getByLabel('Component slug', { exact: true }).fill(props.slug);
  if (props.description !== undefined) {
    await settings
      .getByLabel('Description', { exact: true })
      .fill(props.description);
  }
}

/**
 * Press the settings' one Save and wait until Core answered it.
 *
 * The settings stay open after a save, with the Component still chosen beside
 * its list, so the toast that names the Component is what says the write
 * landed, as a Project's settings are waited on. `name` is the name the
 * Component carries after the save.
 */
export async function saveComponent(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`Component ${name} saved`)).toBeVisible();
}

/**
 * Open the More menu of the chosen Component and press Delete Component, which
 * opens the confirm.
 */
export async function openDeleteComponent(
  page: Page,
  name: string
): Promise<Locator> {
  await page.getByRole('button', { name: `More for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete Component' }).click();
  const confirm = page.getByRole('alertdialog', { name: `Delete ${name}?` });
  await expect(confirm).toBeVisible();

  return confirm;
}
