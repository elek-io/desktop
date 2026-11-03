import { Trans, useLingui } from '@lingui/react/macro';
import { editorViewCtx, type CmdKey } from '@milkdown/kit/core';
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm';
import { callCommand } from '@milkdown/kit/utils';
import { useInstance } from '@milkdown/react';
import {
  BoldIcon,
  CodeIcon,
  HeadingIcon,
  ImagePlusIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListPlusIcon,
  MinusIcon,
  PilcrowIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  TableIcon,
  TextQuoteIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Toggle } from '@renderer/components/ui/toggle';

import type { MarkdownFieldDefinition } from '@elek-io/core';

import { AssetReferencePicker } from './asset-reference-picker';
import { EntryReferencePicker } from './entry-reference-picker';
import { LinkDialog } from './link-dialog';
import { insertAssetReferenceCommand } from './plugins/asset-reference';
import { insertEntryReferenceCommand } from './plugins/entry-reference';
import type { ActiveMarkFormats } from './plugins/mark-formats';

export interface MarkdownToolbarProps {
  fieldDefinition: MarkdownFieldDefinition;
  /** Which inline formats the cursor or the selection is inside right now. */
  activeFormats: ActiveMarkFormats;
  disabled: boolean;
}

/**
 * Compact toolbar over the markdown editor. Renders only the affordances the
 * field's features enable.
 *
 * A button that turns an inline format on and off is a Toggle, pressed while
 * that format is on, so somebody can see and hear what the text already is.
 * Every button runs on click, so the keyboard reaches it, and prevents the
 * default of the mouse press before it, so the editor's selection survives.
 *
 * Both kinds are the same square, since ci gives every button of the bar one
 * size.
 */
export const MarkdownToolbar = ({
  fieldDefinition,
  activeFormats,
  disabled,
}: MarkdownToolbarProps): ReactElement | null => {
  const { t } = useLingui();

  const features = fieldDefinition.features;
  const [isLoading, getEditor] = useInstance();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isEntryPickerOpen, setIsEntryPickerOpen] = useState(false);

  function run<T>(key: CmdKey<T>, payload?: T): void {
    if (isLoading) {
      return;
    }
    const editor = getEditor();
    editor.action(callCommand(key, payload));
    editor.action((ctx) => {
      ctx.get(editorViewCtx).focus();
    });
  }

  const button = (
    label: string,
    icon: ReactNode,
    onRun: () => void
  ): ReactElement => (
    <Button
      key={label}
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  /**
   * A button for an inline format, pressed while that format is on.
   *
   * ci gives a pressed button the muted surface and a ring in the input color,
   * so it is never color alone, and `aria-pressed` says the same thing to a
   * screen reader.
   */
  const formatToggle = (
    label: string,
    icon: ReactNode,
    isPressed: boolean,
    onRun: () => void
  ): ReactElement => (
    <Toggle
      key={label}
      type="button"
      size="sm"
      // The same square as the plain buttons beside it, which hold nothing but
      // an icon either.
      className="px-0"
      disabled={disabled}
      pressed={isPressed}
      onMouseDown={(event) => event.preventDefault()}
      onPressedChange={onRun}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Toggle>
  );

  const hasMarks =
    features.strong ||
    features.emphasis ||
    features.inlineCode ||
    features.strikethrough;
  const hasBlocks =
    features.headings.length > 0 ||
    features.blockquotes ||
    features.lists ||
    features.codeBlocks ||
    features.thematicBreak ||
    features.tables;
  const hasInserters =
    features.externalLinks ||
    features.assetReferences ||
    features.entryReferences;

  if (!hasMarks && !hasBlocks && !hasInserters) {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-1 border-b border-border p-1">
      {features.headings.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
              />
            }
          >
            <HeadingIcon />
            <span className="sr-only">
              <Trans>Heading</Trans>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                run(turnIntoTextCommand.key);
              }}
            >
              <PilcrowIcon /> <Trans>Paragraph</Trans>
            </DropdownMenuItem>
            {features.headings.map((depth) => (
              <DropdownMenuItem
                key={depth}
                onClick={() => {
                  run(wrapInHeadingCommand.key, depth);
                }}
              >
                <Trans>Heading {depth}</Trans>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {features.strong
        ? formatToggle(t`Bold`, <BoldIcon />, activeFormats.strong, () => {
            run(toggleStrongCommand.key);
          })
        : null}
      {features.emphasis
        ? formatToggle(
            t`Italic`,
            <ItalicIcon />,
            activeFormats.emphasis,
            () => {
              run(toggleEmphasisCommand.key);
            }
          )
        : null}
      {features.inlineCode
        ? formatToggle(
            t`Inline code`,
            <CodeIcon />,
            activeFormats.inlineCode,
            () => {
              run(toggleInlineCodeCommand.key);
            }
          )
        : null}
      {features.strikethrough
        ? formatToggle(
            t`Strikethrough`,
            <StrikethroughIcon />,
            activeFormats.strikethrough,
            () => {
              run(toggleStrikethroughCommand.key);
            }
          )
        : null}

      {features.lists
        ? button(t`Bullet list`, <ListIcon />, () => {
            run(wrapInBulletListCommand.key);
          })
        : null}
      {features.lists
        ? button(t`Ordered list`, <ListOrderedIcon />, () => {
            run(wrapInOrderedListCommand.key);
          })
        : null}
      {features.blockquotes
        ? button(t`Blockquote`, <TextQuoteIcon />, () => {
            run(wrapInBlockquoteCommand.key);
          })
        : null}
      {features.codeBlocks
        ? button(t`Code block`, <SquareCodeIcon />, () => {
            run(createCodeBlockCommand.key);
          })
        : null}
      {features.tables
        ? button(t`Table`, <TableIcon />, () => {
            run(insertTableCommand.key, {});
          })
        : null}
      {features.thematicBreak
        ? button(t`Thematic break`, <MinusIcon />, () => {
            run(insertHrCommand.key);
          })
        : null}

      {features.externalLinks
        ? button(t`Link`, <LinkIcon />, () => {
            setIsLinkDialogOpen(true);
          })
        : null}
      {features.assetReferences
        ? button(t`Reference an Asset`, <ImagePlusIcon />, () => {
            setIsAssetPickerOpen(true);
          })
        : null}
      {features.entryReferences
        ? button(t`Reference an Entry`, <ListPlusIcon />, () => {
            setIsEntryPickerOpen(true);
          })
        : null}

      {features.externalLinks ? (
        <LinkDialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          onConfirm={(href) => {
            run(toggleLinkCommand.key, { href });
            setIsLinkDialogOpen(false);
          }}
        />
      ) : null}
      {features.assetReferences ? (
        <AssetReferencePicker
          open={isAssetPickerOpen}
          onOpenChange={setIsAssetPickerOpen}
          ofAssetMimeTypes={fieldDefinition.ofAssetMimeTypes}
          onPick={(asset) => {
            run(insertAssetReferenceCommand.key, {
              assetId: asset.id,
              alt: asset.name,
              title: null,
            });
            setIsAssetPickerOpen(false);
          }}
        />
      ) : null}
      {features.entryReferences ? (
        <EntryReferencePicker
          open={isEntryPickerOpen}
          onOpenChange={setIsEntryPickerOpen}
          ofCollections={fieldDefinition.ofCollections}
          onPick={({ entry, collection, label }) => {
            run(insertEntryReferenceCommand.key, {
              collectionId: collection.id,
              entryId: entry.id,
              label,
            });
            setIsEntryPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};
