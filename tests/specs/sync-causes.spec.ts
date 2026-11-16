import { expect, test } from '@playwright/test';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { typeCheck } from '../helpers/checks.js';

/**
 * That no cause Core refuses a synchronization for can reach an editor without
 * a sentence of its own, checked without the app.
 *
 * The map that words them is a `Record` over Core's own list of causes, so a
 * cause a Core release adds is a compile error until it is worded. What is
 * under test is therefore the project's own type check rather than anything a
 * window can show. The sentences themselves are driven in `sync.spec.ts`.
 */

const root = path.resolve(import.meta.dirname, '../..');

test.describe('The sentence per cause of a refused sync', () => {
  test('a cause without a sentence fails the type check', async () => {
    // The map as it would read with one cause worded and the rest missing,
    // which is what a Core release that adds one leaves behind. Written to
    // disk rather than checked from a string, because what is under test is
    // the project's own type check.
    const probe = path.join(root, 'src/renderer/lib/syncCauseProbe.ts');
    await writeFile(
      probe,
      [
        "import type { SyncRefusalCauses } from '@renderer/lib/sync';",
        '',
        '// Annotated with the map`s own exported type, so loosening that type',
        '// is what this goes green on rather than what TypeScript does with',
        '// any mapped type. The descriptor stands in for a sentence, which',
        '// cannot be written here: a catalog message comes from a macro, and',
        '// a probe is not compiled by the plugin that turns one into a call.',
        'export const unworded: SyncRefusalCauses = {',
        "  uncommitted_changes: { id: 'probe' },",
        '};',
        '',
      ].join('\n')
    );

    try {
      const failed = await typeCheck();
      expect(failed.code).not.toBe(0);
      // Nothing but the probe is asserted on, because `pnpm check` is what
      // proves the project itself is green and a spec running beside this one
      // writes probes of its own into the same project.
      expect(failed.output).toContain('syncCauseProbe.ts');
      // Named, so what refuses the incomplete map is the map's own exported
      // type rather than a mapped type written out again here.
      expect(failed.output).toContain(
        "is missing the following properties from type 'SyncRefusalCauses'"
      );
      // One of the causes left unworded, so the message says which cause to
      // write a sentence for.
      expect(failed.output).toContain('remote_holds_something_else');
    } finally {
      await rm(probe);
    }
  });
});
