import { type Page } from '@playwright/test';

import {
  type Component,
  type CreateComponentProps,
  type UpdateComponentProps,
} from '@elek-io/core';

import { textFieldDefinition } from './collection.js';
import { navigate } from './navigation.js';

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

/** Route to one Component's configure page and confirm it rendered. */
export async function navigateToComponent(
  page: Page,
  ids: { projectId: string; componentId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/components/${ids.componentId}`
  );
}
