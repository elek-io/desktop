import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slot } from '@radix-ui/react-slot';
import { GripVerticalIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

function DragHandle({
  id,
  className,
}: {
  id: string;
  className?: string;
}): React.ReactElement {
  const { attributes, listeners } = useSortable({
    id,
  });
  return (
    <Button
      {...attributes}
      {...listeners}
      Icon={GripVerticalIcon}
      variant="secondary"
      size="icon"
      className={cn('hover:cursor-grab', className)}
    >
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

function DraggableComponent({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id,
  });

  return (
    <Slot
      data-dragging={isDragging}
      ref={setNodeRef}
      className={cn(
        'relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80',
        className
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {children}
    </Slot>
  );
}

function SortableFieldArray({
  children,
  items,
  onReorder,
}: {
  children: React.ReactNode;
  // The rows to reorder, identified by id.
  items: { id: string }[];
  onReorder: (activeId: string, overId: string) => void;
}): React.ReactElement {
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  function handleDragStart(event: DragStartEvent): void {
    const { active } = event;

    setActiveId(active.id);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over !== null && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      // modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId !== null ? <div id={activeId.toString()} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export { DraggableComponent, DragHandle, SortableFieldArray };
