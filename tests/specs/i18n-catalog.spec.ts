import { createCompiledCatalog, getCatalogs } from '@lingui/cli/api';
import { getConfig } from '@lingui/conf';
import { setupI18n } from '@lingui/core';
import { expect, test } from '@playwright/test';
import { ESLint } from 'eslint';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolveAppLocale } from '../../src/shared/locale.js';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const catalogPath = path.join(root, 'src/locales/en.po');

/** The two rules that keep a string a person reads out of the code. */
const guards = ['lingui/no-unlocalized-strings', 'no-restricted-syntax'];

/**
 * What the catalog layer answers for, checked without the app.
 *
 * These run in Node rather than against the packaged build, because what they
 * pin is the seam between the code and the catalog: the lint rule that keeps a
 * literal out, the check that keeps the catalog in step with the code, and what
 * a second language does to the messages the components already carry. None of
 * it needs a window, and the suite's own runner is the one place to put them.
 */

/** Runs a repository script and answers with its exit code and output. */
async function runScript(
  args: string[]
): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run('pnpm', ['exec', ...args], {
      cwd: root,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

test.describe('The message catalog', () => {
  test('the lint rule refuses a user-facing literal outside the catalog', async () => {
    // Written to disk rather than linted from a string, because the renderer's
    // rules are type aware and the project service only knows a real file.
    const probe = path.join(root, 'src/renderer/components/linguiProbe.tsx');
    await writeFile(
      probe,
      [
        'export function LinguiProbe({ name }: { name: string }): React.JSX.Element {',
        '  return (',
        '    <div title="A tooltip nobody translated">',
        '      Some text nobody translated',
        '      <img src="/a.png" alt="An alt nobody translated" />',
        '      <button aria-label="A name nobody translated" />',
        '      <input placeholder="A placeholder nobody translated" />',
        "      {name === '' ? 'A sentence nobody translated' : null}",
        '      <span title={`A tooltip built around ${name}`} />',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    try {
      const eslint = new ESLint({ cwd: root });
      const [result] = await eslint.lintFiles([probe]);
      const flagged = (result?.messages ?? []).filter((message) =>
        guards.includes(message.ruleId ?? '')
      );

      // One per surface the criterion names, by the line it sits on: `title`
      // and the JSX text on line 3, `alt` on 5, the accessible name on 6, the
      // placeholder on 7, a string in an expression on 8 and a `title` built
      // around a value on 9. `title` and `alt` are caught twice, by Lingui's
      // rule and by the selector that covers the attributes it lets through on
      // a native element.
      expect(flagged.map((message) => message.line).sort()).toEqual([
        3, 3, 5, 5, 6, 7, 8, 9,
      ]);
    } finally {
      await rm(probe);
    }
  });

  test('a message the code uses and the catalog lacks fails the check', async () => {
    const probe = path.join(root, 'src/renderer/lib/catalogProbe.ts');
    await writeFile(
      probe,
      [
        "import { t } from '@lingui/core/macro';",
        '',
        'export function probe(): string {',
        '  return t`A message no catalog carries yet`;',
        '}',
        '',
      ].join('\n')
    );

    try {
      const failed = await runScript(['lingui', 'check', 'sync', '--clean']);
      expect(failed.code).not.toBe(0);
      expect(failed.output).toContain('out-of-sync');
    } finally {
      await rm(probe);
    }

    // And the same check passes again once the probe is gone, so the failure
    // above was the probe rather than a catalog that was already stale.
    const passed = await runScript(['lingui', 'check', 'sync', '--clean']);
    expect(passed.code).toBe(0);
  });

  test('a missing translation falls back to English, never to a message id', async () => {
    const config = getConfig({ cwd: root });
    const catalogs = await getCatalogs(config);
    const [catalog] = catalogs;
    expect(catalog).toBeDefined();

    const { messages: english } = await catalog!.getTranslations('en', {
      fallbackLocales: config.fallbackLocales,
      sourceLocale: config.sourceLocale,
    });

    // The test-only second catalog: every message of the English one, with a
    // single sentence translated and the rest left to the fallback chain the
    // compiler applies. Adding a language is this file and nothing else, which
    // is why no component takes part in it.
    const translatedSource = 'Could not create the Project';
    const translated = 'Das Projekt konnte nicht angelegt werden';
    const ids = Object.keys(english);
    const translatedId = ids.find((id) => english[id] === translatedSource);
    expect(translatedId).toBeDefined();

    const { source: compiled } = createCompiledCatalog(
      'xx',
      { ...english, [translatedId!]: translated },
      { namespace: 'json' }
    );
    const { messages } = JSON.parse(compiled) as {
      messages: Record<string, string>;
    };

    const i18n = setupI18n();
    i18n.loadAndActivate({ locale: 'xx', messages });

    // The one translated sentence comes back in the second language.
    expect(i18n._(translatedId!)).toBe(translated);

    // Every other message comes back in English, and never as its id, which is
    // what the compiled catalog's fallback to the source locale guarantees.
    const untranslated = ids.filter((id) => id !== translatedId);
    const asId = untranslated.filter(
      (id) => i18n._(id) === id && english[id] !== undefined
    );
    expect(asId).toEqual([]);

    // Compared on the messages that take no value, since one with a
    // placeholder or a plural renders rather than reading back as its source.
    const plain = untranslated.filter(
      (id) => english[id]?.includes('{') === false
    );
    expect(plain.length).toBeGreaterThan(100);
    for (const id of plain) {
      expect(i18n._(id)).toBe(english[id]);
    }
  });

  test('a language with no catalog of its own resolves to English', () => {
    // What the renderer does with the User's language and what the main
    // process does with the system's.
    expect(resolveAppLocale('en')).toBe('en');
    expect(resolveAppLocale('en-US')).toBe('en');
    expect(resolveAppLocale('de')).toBe('en');
    expect(resolveAppLocale('de-AT')).toBe('en');
    expect(resolveAppLocale('ZH')).toBe('en');
    expect(resolveAppLocale(null)).toBe('en');
    expect(resolveAppLocale(undefined)).toBe('en');
  });

  test('a counted sentence carries ICU plural rules, and no message is a bare placeholder', async () => {
    const catalog = await readFile(catalogPath, 'utf8');
    const ids = [...catalog.matchAll(/^msgid "((?:[^"\\]|\\.)*)"/gm)]
      .map((match) => match[1] ?? '')
      .filter((id) => id !== '');

    const plurals = ids.filter((id) => id.includes(', plural,'));
    expect(plurals.length).toBeGreaterThan(0);
    for (const id of plurals) {
      expect(id).toContain('one {');
      expect(id).toContain('other {');
    }

    // A message that is only a placeholder would be a sentence assembled in
    // the markup rather than held whole in the catalog.
    const bare = ids.filter((id) => /^\{[^{}]+\}$/.test(id.trim()));
    expect(bare).toEqual([]);
  });

  test('the words per Core error type come from the catalog', async () => {
    const catalog = await readFile(catalogPath, 'utf8');
    const source = await readFile(
      path.join(root, 'src/renderer/lib/coreErrorText.ts'),
      'utf8'
    );

    // Every type Core declares has a sentence, each held as a catalog message
    // rather than a plain string.
    const sentences = [...source.matchAll(/msg`([^`]+)`/g)].map(
      (match) => match[1] ?? ''
    );
    expect(sentences.length).toBeGreaterThanOrEqual(9);
    for (const sentence of sentences) {
      expect(catalog).toContain(sentence);
    }
    expect(source).not.toMatch(/Record<CoreErrorType, string>/);
  });

  test('a mutation carries its own two sentences, so one without them does not compile', async () => {
    const util = await readFile(
      path.join(root, 'src/renderer/queries/util.ts'),
      'utf8'
    );

    // Required rather than optional, which is what makes a mutation without
    // sentences of its own a type error.
    expect(util).toContain('  toasts: {');
    expect(util).not.toContain('toasts?:');

    // And nothing builds a toast from the call's method and object type any
    // more, which is what the sentences replaced.
    expect(util).not.toMatch(/toast\.(success|error)\([^)]*method/s);

    // Every mutation of the query layer supplies them.
    const options = path.join(root, 'src/renderer/queries/options');
    const files = [
      'apiOptions.ts',
      'assetOptions.ts',
      'cloudOptions.ts',
      'collectionOptions.ts',
      'componentOptions.ts',
      'entryOptions.ts',
      'projectOptions.ts',
      'releaseOptions.ts',
      'userOptions.ts',
    ];
    let mutations = 0;
    for (const file of files) {
      const source = await readFile(path.join(options, file), 'utf8');
      const declared = source.split('customMutationOptions({').length - 1;
      const withToasts = source.split('toasts: {').length - 1;
      expect(withToasts).toBe(declared);
      mutations += declared;
    }
    expect(mutations).toBeGreaterThanOrEqual(24);
  });
});
