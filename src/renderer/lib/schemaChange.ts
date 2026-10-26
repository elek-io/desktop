import { parseIpcError } from '@root/src/shared/ipcError';

import type { EntryIssueType } from '@elek-io/core';

/**
 * Reading the `cause` Core attaches to a `Conflict` it raises for a field
 * definition change it cannot carry out on its own.
 *
 * Core's `Conflict` covers unrelated refusals on the same call, a slug another
 * object already uses among them, and only the field definition cascade carries
 * an issue list. So the presence of issues is what tells the two apart, and
 * `type` alone cannot.
 *
 * @see node_modules/@elek-io/core/docs/schema-changes.md
 */

// The issue types Core declares, so a decoded one can be validated without
// importing Core at runtime (`EntryIssue` is a type-only export). Built from a
// Record keyed by EntryIssueType, which forces the list to stay exhaustive: a
// type added in Core fails to compile here until it is listed.
const entryIssueTypes = new Set<string>(
  Object.keys({
    missing_required: true,
    type_mismatch: true,
    constraint_violation: true,
    unique_collision: true,
    content_loss: true,
  } satisfies Record<EntryIssueType, true>)
);

/**
 * Where one refused change sits, and why it was refused.
 *
 * Deliberately narrower than Core's `EntryIssue`: that also carries
 * `transformedValues` and `currentValue`, which are the content somebody wrote,
 * and nothing on screen needs them. Reading only these four keeps an Entry's
 * content out of every component that renders a refusal.
 */
export interface SchemaChangeIssue {
  entryId: string;
  collectionId: string;
  fieldSlug: string;
  issue: EntryIssueType;
}

/**
 * The issues behind a failed Collection or Component update, or an empty array
 * when the error carries none. An empty array is the answer for every other
 * `Conflict` too, which is what lets a screen tell a cascade refusal from a
 * slug already in use.
 */
export function entryIssuesOf(error: unknown): SchemaChangeIssue[] {
  const { cause } = parseIpcError(error);

  if (Array.isArray(cause) === false) {
    return [];
  }

  const issues: SchemaChangeIssue[] = [];

  for (const candidate of cause as unknown[]) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }
    const { entryId, collectionId, fieldSlug, issue } = candidate as Partial<
      Record<keyof SchemaChangeIssue, unknown>
    >;
    if (
      typeof entryId === 'string' &&
      typeof collectionId === 'string' &&
      typeof fieldSlug === 'string' &&
      typeof issue === 'string' &&
      entryIssueTypes.has(issue)
    ) {
      // The membership check above is what proves the string is an issue type
      issues.push({
        entryId,
        collectionId,
        fieldSlug,
        issue: issue as EntryIssueType,
      });
    }
  }

  return issues;
}

/**
 * What has to happen to one Entry before the change can be saved, in words.
 * Never Core's own message, which is written for a developer reading a log.
 */
export function describeEntryIssue(issue: EntryIssueType): string {
  switch (issue) {
    case 'missing_required':
      return 'needs a Value for this Field, which is now required and has no default';
    case 'type_mismatch':
      return 'holds a Value that does not fit this Field anymore';
    case 'constraint_violation':
      return 'holds a Value this Field no longer allows';
    case 'unique_collision':
      return 'holds a Value another Entry already holds, and this Field is now unique';
    case 'content_loss':
      return 'would lose what it holds in this Field, so the change is refused';
  }
}
