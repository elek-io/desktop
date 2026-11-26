import { Trans, useLingui } from '@lingui/react/macro';
import { errorLogAttributes } from '@root/src/shared/logError';
import { ChevronRight, Copy } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@renderer/components/ui/button';
import { errorDetailsOf } from '@renderer/lib/errorDetails';
import { cn } from '@renderer/lib/utils';
import { buttonVariants } from '@renderer/lib/variants';

/**
 * The masked text, or why there is none.
 *
 * `pending` is the one IPC hop the masking takes, and nothing of the error is
 * on screen while it lasts, which is why the disclosure opens onto nothing
 * until it is over. `failed` is a masking that never answered, which leaves
 * the disclosure saying so rather than showing the text unmasked.
 */
type MaskedDetails =
  | { status: 'pending' }
  | { status: 'ready'; text: string }
  | { status: 'failed' };

/**
 * The technical cause of the error behind Details, closed until somebody opens
 * it, with Copy details in the text's top right corner.
 *
 * The text is Core's type, message and stack, masked in the main process
 * through Core's own call, so the user and password of an address, an email
 * address and the home folder do not reach the screen or the clipboard, see
 * contributing/error-handling.md. Nothing unmasked is ever rendered: the text
 * arrives masked or not at all, and Copy details copies that same string, so
 * the two can never drift apart.
 *
 * The disclosure itself stands from the first render, with nothing below it
 * until the masked text arrives, so the column keeps its height and the
 * centered screen does not move while the masking is on its way. The text then
 * opens below Details out of the flow, so the screen stays where it stood and
 * the button somebody just pressed does not move under the pointer. It scrolls
 * in a block of its own, which takes keyboard focus, so the arrow keys scroll
 * it too.
 */
export function ErrorDetails({ error }: { error: unknown }): ReactElement {
  const { t } = useLingui();
  const summaryId = useId();
  const [details, setDetails] = useState<MaskedDetails>({ status: 'pending' });

  useEffect(() => {
    let isCurrent = true;

    void window.ipc.core.logger
      .mask(errorDetailsOf(error))
      .then((masked) => {
        if (isCurrent) {
          setDetails({ status: 'ready', text: masked });
        }
      })
      .catch((maskingError: unknown) => {
        if (isCurrent) {
          setDetails({ status: 'failed' });
        }

        // Nothing else would say that the details are missing, and the log is
        // where this screen already wrote the error itself. The call can be
        // the thing that is broken, so a failure of it is let go of rather
        // than left as an unhandled rejection.
        void window.ipc.core.logger
          .error({
            source: 'desktop',
            message: 'Failed to mask the details of an uncaught error',
            meta: errorLogAttributes(maskingError),
          })
          .catch(() => undefined);
      });

    return () => {
      isCurrent = false;
    };
  }, [error]);

  async function copyDetails(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t`Details copied`);
    } catch (copyError) {
      toast.error(t`elek.io Desktop could not copy the details`);

      void window.ipc.core.logger
        .error({
          source: 'desktop',
          message: 'Failed to copy the details of an uncaught error',
          meta: errorLogAttributes(copyError),
        })
        .catch(() => undefined);
    }
  }

  return (
    // Stretched across the column and relative, so the text below opens over
    // what follows it rather than pushing the screen around.
    <details
      data-slot="error-details"
      className="group relative mt-4 self-stretch"
    >
      {/*
        The disclosure is the element the platform brings: it owns the open
        state, the keyboard and the `aria-expanded` a screen reader reads, so
        only the look is ours, which is ci's small ghost button.
      */}
      <summary
        id={summaryId}
        data-slot="error-details-summary"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'list-none [&::-webkit-details-marker]:hidden'
        )}
      >
        <ChevronRight className="size-3 text-muted-foreground group-open:rotate-90" />
        <Trans>Details</Trans>
      </summary>

      {/*
        While the masking is still on its way there is nothing to put here,
        and the disclosure above stands from the first render either way, so
        the column keeps its height and the screen does not move when the
        text arrives.
      */}
      {details.status === 'pending' ? null : (
        <div className="absolute inset-x-0 top-full pt-3 pb-6">
          {details.status === 'failed' ? (
            <p className="text-left text-small text-muted-foreground">
              <Trans>
                elek.io Desktop could not prepare the details of this error, so
                there is nothing to show or copy here.
              </Trans>
            </p>
          ) : (
            /*
              A scrolling block has to take the keyboard, or its content is
              out of reach for anybody who does not use a pointer, which is
              what axe's scrollable-region-focusable asks for. The region's
              name is the Details button above it.
            */
            <pre
              data-slot="error-details-text"
              tabIndex={0}
              role="region"
              aria-labelledby={summaryId}
              className="m-0 max-h-[200px] overflow-y-auto rounded-lg border bg-subtle py-3 pr-12 pl-4 text-left font-mono text-code wrap-anywhere whitespace-pre-wrap text-foreground"
            >
              {/*
                In the text's own top right corner, as the website's code
                blocks carry their copy button, and it stays there while the
                text scrolls. It floats into the 48 px the text keeps free on
                its right, 8 px from either side, and a sticky inset counts
                from inside the block's 12 px of padding, hence the 4 px back.

                Its name is an `aria-label` rather than the usual text only a
                screen reader reads, because such a text would stand inside
                the block and so in what Copy details copies.
              */}
              <Button
                variant="outline"
                size="icon"
                Icon={Copy}
                aria-label={t`Copy details`}
                title={t`Copy details`}
                className="sticky -top-1 float-right -mt-1 -mr-10"
                onClick={async () => copyDetails(details.text)}
              />
              {details.text}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
