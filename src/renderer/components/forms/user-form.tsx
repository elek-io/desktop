import { Trans } from '@lingui/react/macro';
import { Info } from 'lucide-react';
import { type ReactElement } from 'react';
import { type UseFormReturn } from 'react-hook-form';

import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import { type SetUserProps } from '@elek-io/core';

// Who the person using Desktop is, in the two fields and the one note the
// first start and the Profile share.
//
// ci draws the same form in both places, so both build it from here and
// neither words the note on its own, see ci's docs/desktop.md.

/**
 * The name and the email address every change is signed with.
 *
 * Both are marked Required, which they take from the Core schema the form
 * checks against rather than from a prop, see
 * contributing/renderer/forms.md#form-invariants.
 */
export function UserIdentityFields({
  form,
}: {
  form: UseFormReturn<SetUserProps>;
}): ReactElement {
  return (
    <>
      <AppField form={form} name="name" label={<Trans>Name</Trans>}>
        {({ field, controlProps }) => (
          <TextControl field={field} type="text" {...controlProps} />
        )}
      </AppField>
      <AppField form={form} name="email" label={<Trans>Email address</Trans>}>
        {({ field, controlProps }) => (
          <TextControl field={field} type="email" {...controlProps} />
        )}
      </AppField>
    </>
  );
}

/**
 * What Desktop keeps of the name and the email address, and where they go.
 *
 * It is true of the build: nothing but a commit Core writes carries them, and
 * Report an issue fills them in for the person to change or clear before they
 * send it.
 */
export function UserIdentityNote(): ReactElement {
  return (
    <p className="flex gap-2 text-small text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-3 flex-none" />
      <span>
        <Trans>
          Your name and email address mark your changes in the History.
          They&apos;re saved with each change, so whoever you sync a Project
          with sees them. Desktop sends them nowhere else without asking.
        </Trans>
      </span>
    </p>
  );
}
