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

import type { MarkdownFieldDefinition } from '@elek-io/core';

import { AssetReferencePicker } from './asset-reference-picker';
import { EntryReferencePicker } from './entry-reference-picker';
import { LinkDialog } from './link-dialog';
import { insertAssetReferenceCommand } from './plugins/asset-reference';
import { insertEntryReferenceCommand } from './plugins/entry-reference';

export interface MarkdownToolbarProps {
  fieldDefinition: MarkdownFieldDefinition;
  disabled: boolean;
}

/**
 * Compact toolbar over the markdown editor. Renders only the affordances the
 * field's features enable. Buttons use onMouseDown with preventDefault so the
 * editor selection survives the click.
 */
export const MarkdownToolbar = ({
  fieldDefinition,
  disabled,
}: MarkdownToolbarProps): ReactElement | null => {
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
      size="icon"
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
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
                size="icon"
                disabled={disabled}
              />
            }
          >
            <HeadingIcon />
            <span className="sr-only">Heading</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                run(turnIntoTextCommand.key);
              }}
            >
              <PilcrowIcon /> Paragraph
            </DropdownMenuItem>
            {features.headings.map((depth) => (
              <DropdownMenuItem
                key={depth}
                onClick={() => {
                  run(wrapInHeadingCommand.key, depth);
                }}
              >
                Heading {depth}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {features.strong
        ? button('Bold', <BoldIcon />, () => {
            run(toggleStrongCommand.key);
          })
        : null}
      {features.emphasis
        ? button('Italic', <ItalicIcon />, () => {
            run(toggleEmphasisCommand.key);
          })
        : null}
      {features.inlineCode
        ? button('Inline code', <CodeIcon />, () => {
            run(toggleInlineCodeCommand.key);
          })
        : null}
      {features.strikethrough
        ? button('Strikethrough', <StrikethroughIcon />, () => {
            run(toggleStrikethroughCommand.key);
          })
        : null}

      {features.lists
        ? button('Bullet list', <ListIcon />, () => {
            run(wrapInBulletListCommand.key);
          })
        : null}
      {features.lists
        ? button('Ordered list', <ListOrderedIcon />, () => {
            run(wrapInOrderedListCommand.key);
          })
        : null}
      {features.blockquotes
        ? button('Blockquote', <TextQuoteIcon />, () => {
            run(wrapInBlockquoteCommand.key);
          })
        : null}
      {features.codeBlocks
        ? button('Code block', <SquareCodeIcon />, () => {
            run(createCodeBlockCommand.key);
          })
        : null}
      {features.tables
        ? button('Table', <TableIcon />, () => {
            run(insertTableCommand.key, {});
          })
        : null}
      {features.thematicBreak
        ? button('Thematic break', <MinusIcon />, () => {
            run(insertHrCommand.key);
          })
        : null}

      {features.externalLinks
        ? button('Link', <LinkIcon />, () => {
            setIsLinkDialogOpen(true);
          })
        : null}
      {features.assetReferences
        ? button('Reference an Asset', <ImagePlusIcon />, () => {
            setIsAssetPickerOpen(true);
          })
        : null}
      {features.entryReferences
        ? button('Reference an Entry', <ListPlusIcon />, () => {
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
