import {
  type DragEventHandler,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Card, CardContent } from '@renderer/components/ui/card';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { cn } from '@renderer/lib/utils';

export interface PageProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: ReactElement;
  actions?: ReactElement;
  layout?: 'bare';
  children?: ReactNode;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}

export const Page = forwardRef<HTMLElement, PageProps>(
  ({ className, ...props }, ref) => (
    <ScrollArea>
      <main
        ref={ref}
        className={cn('relative flex-1', className)}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDragEnter={props.onDragEnter}
        onDrop={props.onDrop}
      >
        <div className="relative pb-32">
          <div className="relative container mx-auto">
            <div className="px-4 py-10 sm:px-6 md:flex md:items-center lg:px-8">
              <div className="md:flex-auto">
                <h2 className="text-3xl">{props.title}</h2>
                {props.description ? (
                  <p className="mt-2 max-w-screen-sm text-sm">
                    {props.description}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-row space-x-2 md:mt-0 md:ml-16 md:flex-none">
                {props.actions ? props.actions : null}
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="relative container mx-auto -mt-32">
            <div className="p-4 !pt-0 sm:p-6 lg:p-8">
              {props.layout === 'bare' ? (
                <>{props.children}</>
              ) : (
                <Card className="py-0">
                  <CardContent className="px-0">{props.children}</CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </ScrollArea>
  )
);
Page.displayName = 'Page';
