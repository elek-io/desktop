import { expect, type Locator, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The header's user menu trigger. Its accessible name holds the name and,
 * below it, where the person works.
 */
export function userMenuTrigger(page: Page, name: string): Locator {
  return page.getByRole('button', { name: new RegExp(name) });
}

/**
 * Assert the account line under the name in the header: "On this computer",
 * "elek.io Cloud" or "Sync paused".
 */
export async function expectAccountLine(
  page: Page,
  name: string,
  line: 'On this computer' | 'elek.io Cloud' | 'Sync paused'
): Promise<void> {
  await expect(userMenuTrigger(page, name)).toContainText(line);
}

/** Open the user menu and choose one of its items. */
export async function chooseFromUserMenu(
  page: Page,
  name: string,
  item: string
): Promise<void> {
  await userMenuTrigger(page, name).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Fill the Sign in page and press its button. */
export async function signIn(
  page: Page,
  { email, password }: { email: string; password: string }
): Promise<void> {
  // The First start has fields of the same names, so wait for this page
  await expect(
    page.getByRole('heading', { name: 'Sign in to elek.io Cloud' })
  ).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Fill the Create account page and press its button. */
export async function createAccount(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string }
): Promise<void> {
  // The First start has fields of the same names, so wait for this page
  await expect(
    page.getByRole('heading', { name: 'Create an elek.io Cloud account' })
  ).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/**
 * Every file below `directory` whose contents hold `needle`, read on the
 * runner. Used to prove a session token was never written in plain text.
 */
export async function filesContaining(
  directory: string,
  needle: string
): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.isFile() === false) {
      continue;
    }
    const path = join(entry.parentPath, entry.name);
    const contents = await readFile(path).catch(() => null);
    if (contents?.includes(needle) === true) {
      found.push(path);
    }
  }
  return found;
}
