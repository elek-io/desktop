import { z } from 'zod';

import { countEmptyFields } from '@renderer/lib/emptyFields';

import {
  createProjectSchema,
  setRemoteOriginUrlProjectSchema,
  type Project,
} from '@elek-io/core';

// What a Project form holds, and what of it is still empty.
//
// Core's own schema for creating a Project, plus where to keep it, which is
// not a field of a Project but two more calls: Core's create takes no remote,
// so the address goes to `setRemoteOriginUrl` and the first push to
// `synchronize`. Both forms that edit a Project check against this one schema,
// so neither of them views its form as something else.
//
// See contributing/renderer/forms.md#writing-a-form.

/**
 * Where a Project is kept.
 *
 * Two options rather than one, because one is no choice, and neither of them
 * names elek.io Cloud, which the alpha does not offer.
 */
export const projectLocationSchema = z.enum([
  // Item values, which nobody reads: the words come from the catalog where the
  // options are drawn.
  'this-computer',
  'git-host',
]);

export type ProjectLocation = z.infer<typeof projectLocationSchema>;

/**
 * What a Project form checks against.
 *
 * The address takes Core's own rule from the call that sets it, so no limit
 * Core sets is written out here, and it is nullable because a Project kept on
 * this computer has none. That it has to be there once another Git host is
 * chosen is the one rule this schema adds, and it lands on the address field.
 */
export const projectFormSchema = createProjectSchema
  .extend({
    keptOn: projectLocationSchema,
    remoteOriginUrl: setRemoteOriginUrlProjectSchema.shape.url.nullable(),
  })
  .check((ctx) => {
    if (ctx.value.keptOn === 'git-host' && ctx.value.remoteOriginUrl === null) {
      // The address is a string Core asks for, and nothing is in it, which is
      // the one shape a control that was left empty writes. The issue carries
      // no message of its own, so the zod error map words it through the
      // catalog like every other refusal, see
      // contributing/renderer/forms.md#the-words-a-refused-value-is-explained-in.
      ctx.issues.push({
        code: 'invalid_type',
        // zod's own name for the type the address is, which is no word
        // anybody reads.
        // eslint-disable-next-line lingui/no-unlocalized-strings
        expected: 'string',
        input: ctx.value.remoteOriginUrl,
        path: ['remoteOriginUrl'],
      });
    }
  });

/**
 * What a Project form edits: every key of a Project a person can change, and
 * where the Project is kept.
 *
 * An update carries the Project's id beside it, which the route holds and no
 * field writes, so both the create and the update form are this shape. The
 * update form keeps where the Project is kept as it found it and shows no field
 * for it, because the Project's Settings changes the address on its Sync page
 * instead.
 */
export type ProjectFormValues = z.infer<typeof projectFormSchema>;

/**
 * What a Project form starts a new Project with.
 *
 * A function rather than a constant, so the languages it starts with are built
 * where they are needed rather than read once at import time.
 */
export function newProjectFormValues(): ProjectFormValues {
  return {
    name: '',
    description: '',
    settings: {
      // Language codes, which are the same in every language.
      language: {
        default: 'en',
        supported: ['en'],
      },
    },
    keptOn: 'this-computer',
    remoteOriginUrl: null,
  };
}

/**
 * What a Project form holds for a Project that already exists.
 *
 * Where it is kept comes from the Project's own remote, so a form that shows no
 * field for it keeps it as it found it.
 */
export function projectFormValuesOf(project: Project): ProjectFormValues {
  return {
    name: project.name,
    description: project.description,
    settings: project.settings,
    keptOn: project.remoteOriginUrl === null ? 'this-computer' : 'git-host',
    remoteOriginUrl: project.remoteOriginUrl,
  };
}

/**
 * How many of the form's fields still need a Value before Core would take it.
 *
 * The address counts only while another Git host is chosen, since a Project
 * kept on this computer has none.
 */
export function missingProjectValues(values: ProjectFormValues): number {
  const needed: unknown[] = [
    values.name,
    values.description,
    values.settings.language.supported,
    values.settings.language.default,
  ];

  if (values.keptOn === 'git-host') {
    needed.push(values.remoteOriginUrl);
  }

  return countEmptyFields(needed);
}
