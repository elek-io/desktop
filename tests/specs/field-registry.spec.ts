import { expect, test } from '@playwright/test';
import { ESLint } from 'eslint';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { typeCheck } from '../helpers/checks.js';

const root = path.resolve(import.meta.dirname, '../..');

/**
 * What the field registry answers for, checked without the app.
 *
 * The registry's promise is a compile error and a lint error, neither of which
 * a window can show: a field type Core adds has to be given a folder before
 * anything compiles, and nothing outside a type's folder may branch on a field
 * type. Both are driven here with a probe file, the way the catalog's seam is,
 * see contributing/testing.md.
 */

test.describe('The field registry', () => {
  test('a field type without a folder fails the type check', async () => {
    // The registry as it would read with one type's folder missing. Written to
    // disk rather than checked from a string, because what is under test is the
    // project's own type check.
    const probe = path.join(root, 'src/renderer/components/registryProbe.ts');
    await writeFile(
      probe,
      [
        "import { markdownField } from '@renderer/components/fields/markdown';",
        "import { textField } from '@renderer/components/fields/text';",
        '',
        "import type { FieldTypeRegistry } from '@renderer/components/fields';",
        '',
        "// Two of Core's field types, which is what the registry would hold",
        '// if a type Core added had no folder of its own yet. Annotated with',
        "// the registry's own exported type, so loosening that type is what",
        '// this goes green on rather than what TypeScript does with any',
        '// mapped type.',
        'export const incomplete: FieldTypeRegistry = {',
        '  text: textField,',
        '  markdown: markdownField,',
        '};',
        '',
      ].join('\n')
    );

    try {
      const failed = await typeCheck();
      expect(failed.code).not.toBe(0);
      // The registry itself is where it fails, and the message names the types
      // whose folder is missing, so a field type Core adds says what it needs
      // rather than only that something is wrong. Nothing but the probe is
      // asserted on, because `pnpm check` is what proves the project itself is
      // green and a spec running beside this one writes probes of its own into
      // the same project.
      expect(failed.output).toContain('registryProbe.ts');
      // Named, so what refuses the incomplete registry is this registry's own
      // exported type rather than a mapped type written out again here.
      expect(failed.output).toContain(
        "is missing the following properties from type 'FieldTypeRegistry'"
      );
      expect(failed.output).toContain('textarea');
    } finally {
      await rm(probe);
    }
  });

  test('a branch on a field type outside a type folder is a lint error', async () => {
    const outside = path.join(root, 'src/renderer/components/branchProbe.ts');
    const inside = path.join(
      root,
      'src/renderer/components/fields/text/branchProbe.ts'
    );
    // Every shape the read takes, so the rule is not held by one spelling: a
    // plain member, an optional chain, a computed key, a name taken out by a
    // destructuring, and a switch.
    const source = [
      "import type { FieldDefinition } from '@elek-io/core';",
      '',
      'export function probe(',
      '  fieldDefinition: FieldDefinition,',
      '  other?: FieldDefinition',
      '): string {',
      "  if (fieldDefinition.fieldType === 'markdown') {",
      "    return 'markdown';",
      '  }',
      "  if (other?.fieldType === 'markdown') {",
      "    return 'also markdown';",
      '  }',
      "  if (fieldDefinition['valueType'] !== 'string') {",
      "    return 'not a string';",
      '  }',
      '  const { fieldType } = fieldDefinition;',
      "  if (fieldType === 'text') {",
      "    return 'text';",
      '  }',
      '  switch (fieldDefinition.fieldType) {',
      '    default:',
      "      return 'something else';",
      '  }',
      '}',
      '',
    ].join('\n');
    await writeFile(outside, source);
    await writeFile(inside, source);

    try {
      const eslint = new ESLint({ cwd: root });
      const [outsideResult] = await eslint.lintFiles([outside]);
      const flagged = (outsideResult?.messages ?? []).filter(
        (message) => message.ruleId === 'no-restricted-syntax'
      );
      // One per shape: the member on line 7, the optional chain on 10, the
      // computed key on 13, the destructured name on 17 and the switch on 20.
      expect(
        flagged.map((message) => message.line).sort((a, b) => a - b)
      ).toEqual([7, 10, 13, 17, 20]);
      expect(flagged[0]?.message).toContain("field type's own folder");

      // The same lines inside a type's folder are what that folder is for.
      const [insideResult] = await eslint.lintFiles([inside]);
      expect(
        (insideResult?.messages ?? []).filter(
          (message) => message.ruleId === 'no-restricted-syntax'
        )
      ).toEqual([]);
    } finally {
      await rm(outside);
      await rm(inside);
    }
  });

  test('placeholder text is a lint error, apart from the one filter field', async () => {
    const probe = path.join(
      root,
      'src/renderer/components/placeholderProbe.tsx'
    );
    // Every shape the attribute is written in, so the rule is not held by one
    // spelling: a plain string, a translated one in braces, and a value.
    await writeFile(
      probe,
      [
        "import { t } from '@lingui/core/macro';",
        '',
        'export function probe(name: string): React.JSX.Element {',
        '  return (',
        '    <>',
        '      <input placeholder="Your name" />',
        '      <input placeholder={t`Your name`} />',
        '      <input placeholder={name} />',
        '    </>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    try {
      const eslint = new ESLint({ cwd: root });
      const [result] = await eslint.lintFiles([probe]);
      const flagged = (result?.messages ?? []).filter(
        (message) => message.ruleId === 'no-restricted-syntax'
      );
      // One per shape: the string on line 6, the translated one on 7 and the
      // value on 8.
      expect(
        flagged.map((message) => message.line).sort((a, b) => a - b)
      ).toEqual([6, 7, 8]);
      expect(flagged[0]?.message).toContain('placeholder text');

      // A filter keeps its name inside its field, which is the one exception,
      // and it is the two components that draw one rather than a rule somebody
      // writes again per filter: the field above a list, and the field inside
      // a combobox's popup.
      const filterResults = await eslint.lintFiles([
        path.join(root, 'src/renderer/components/ui/filter-input.tsx'),
        path.join(root, 'src/renderer/components/ui/combobox.tsx'),
      ]);
      expect(
        filterResults.flatMap((result) =>
          result.messages
            .filter((message) => message.ruleId === 'no-restricted-syntax')
            .map((message) => `${result.filePath}: ${message.message}`)
        )
      ).toEqual([]);
    } finally {
      await rm(probe);
    }
  });

  test('a form built outside useAppForm, or reset in an effect, is a lint error', async () => {
    const probe = path.join(root, 'src/renderer/components/formProbe.ts');
    await writeFile(
      probe,
      [
        "import { useEffect } from 'react';",
        "import { useForm } from 'react-hook-form';",
        '',
        'export function probe(): void {',
        '  const form = useForm();',
        '  useEffect(() => {',
        '    form.reset({});',
        '  }, [form]);',
        '}',
        '',
      ].join('\n')
    );

    try {
      const eslint = new ESLint({ cwd: root });
      const [result] = await eslint.lintFiles([probe]);
      const flagged = (result?.messages ?? []).filter(
        (message) => message.ruleId === 'no-restricted-syntax'
      );
      // The raw hook's import on line 2, and the reset inside the effect on
      // line 7.
      expect(
        flagged.map((message) => message.line).sort((a, b) => a - b)
      ).toEqual([2, 7]);
    } finally {
      await rm(probe);
    }
  });
});
