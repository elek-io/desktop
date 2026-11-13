import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

// The project's own checks, run from a spec. What they pin is a compile error
// rather than anything a window can show, so a spec writes a probe file into
// the project and asserts the check refuses it.
//
// See contributing/testing.md.

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');

/** Type-checks the renderer and answers with its exit code and output. */
export async function typeCheck(): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '-p',
        'tsconfig.web.json',
        '--composite',
        'false',
      ],
      { cwd: root }
    );
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as {
      code?: unknown;
      stdout?: string;
      stderr?: string;
    };
    if (typeof failure.code !== 'number') {
      throw error;
    }
    return {
      code: failure.code,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}
