import { useRouter } from '@tanstack/react-router';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';

import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Input } from '@renderer/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@renderer/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useProject } from '@renderer/hooks/useProject';

import {
  extractText,
  flattenFieldDefinitions,
  type Collection,
  type Entry,
  type PaginatedList,
  type Project,
} from '@elek-io/core';

// A table row: the fixed columns plus one loosely typed cell per field slug.
type EntryRow = {
  id: string;
  created: string;
  updated: string;
} & Record<string, unknown>;

export function EntryTable({
  project,
  collection,
  entries,
}: {
  project: Project;
  collection: Collection;
  entries: PaginatedList<Entry>;
}): React.JSX.Element {
  const router = useRouter();
  const { formatDatetime, translateContent, formatTemporalFieldValue } =
    useProject();
  const [filter, setFilter] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  function columns(): ColumnDef<EntryRow>[] {
    const columns: ColumnDef<EntryRow>[] = flattenFieldDefinitions(
      collection.fieldDefinitions
    ).map((definition) => {
      return {
        accessorKey: definition.slug,
        header: translateContent({
          key: 'definition.label',
          record: definition.label,
        }),
      };
    });

    columns.push(
      {
        accessorKey: 'created',
        header: 'Created',
      },
      {
        accessorKey: 'updated',
        header: 'Updated',
      }
      // {
      //   id: 'actions',
      //   header: 'Actions',
      //   cell: ({ row }) => {
      //     return <Button>Test</Button>;
      //   },
      // }
    );

    return columns;
  }
  const fieldTypeBySlug = new Map(
    flattenFieldDefinitions(collection.fieldDefinitions).map((definition) => [
      definition.slug,
      definition.fieldType,
    ])
  );
  const table = useReactTable({
    data: entries.list.map((entry) => {
      const row: EntryRow = {
        id: entry.id,
        created: formatDatetime({ datetime: entry.created }).relative,
        updated: formatDatetime({ datetime: entry.updated }).relative,
      };

      for (const [slug, value] of Object.entries(entry.values)) {
        if (value.valueType === 'reference') {
          // Reference content is an array of { id, objectType } objects,
          // which cannot be rendered directly - show a count instead
          const references =
            value.content[project.settings.language.default] ?? [];
          const fieldType = fieldTypeBySlug.get(slug);
          const noun =
            fieldType === 'asset'
              ? references.length === 1
                ? 'Asset'
                : 'Assets'
              : fieldType === 'entry'
                ? references.length === 1
                  ? 'Entry'
                  : 'Entries'
                : references.length === 1
                  ? 'Reference'
                  : 'References';
          row[slug] =
            references.length === 0
              ? undefined
              : `${String(references.length)} ${noun}`;
        } else if (value.valueType === 'mdast') {
          // Structured markdown content - show its plain text
          const tree = value.content[project.settings.language.default];
          row[slug] =
            tree === null || tree === undefined ? undefined : extractText(tree);
        } else {
          // Content is a per-language record; index it by the default language.
          // Date, datetime and time values are formatted in the user's locale,
          // every other type is shown as stored.
          const content = (value.content as Record<string, unknown>)[
            project.settings.language.default
          ];
          row[slug] = formatTemporalFieldValue({
            value: content,
            fieldType: fieldTypeBySlug.get(slug),
          });
        }
      }

      return row;
    }),
    columns: columns(),
    getCoreRowModel: getCoreRowModel(),
    // The route loads the whole Collection with limit 0 (the app-wide load-all
    // list pattern, see loading-and-updating-data.md), so pagination is applied
    // client side over the fully loaded list rather than refetched per page.
    getPaginationRowModel: getPaginationRowModel(),
    // `data` is rebuilt into a new array on every render, which the default
    // autoResetPageIndex reads as a data change and snaps the page back to 0,
    // so paging past the first page never sticks. Disable it: the page index is
    // driven only by the pagination controls.
    autoResetPageIndex: false,
    // The filter input drives a global filter across the visible columns. It is
    // applied before pagination, so a match on any page surfaces on the first
    // one (the filter input resets the page index, see below).
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination, // update the pagination state when internal APIs mutate the pagination state
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setFilter,
    state: {
      pagination,
      columnVisibility,
      globalFilter: filter,
    },
  });

  // The list is paginated client side with autoResetPageIndex off, so a shrink in
  // the loaded data (an Entry removed while the table is open) would leave the
  // page index past the last page and strand the user on an empty page. Clamp it
  // back to the last valid page. useLayoutEffect runs before paint, so the empty
  // page never flashes, and it is a no-op while the page index is in range.
  const pageCount = table.getPageCount();
  useLayoutEffect(() => {
    if (pagination.pageIndex > 0 && pagination.pageIndex > pageCount - 1) {
      table.setPageIndex(pageCount - 1);
    }
  }, [pageCount, pagination.pageIndex, table]);

  async function onRowClicked(id: string): Promise<void> {
    await router.navigate({
      to: '/projects/$projectId/collections/$collectionId/$entryId/update',
      params: {
        projectId: project.id,
        collectionId: collection.id,
        entryId: id,
      },
    });
  }

  return (
    <>
      <div className="flex items-center justify-end p-6">
        <Input
          placeholder={`Filter ${translateContent({
            key: 'currentCollection.name.plural',
            record: collection.name.plural,
          })}...`}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            // Reset to the first page so a match on a later page is visible.
            setPagination((previous) => ({ ...previous, pageIndex: 0 }));
          }}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="ml-auto" />}
          >
            Visible Values
            <ChevronDown className="ml-2 h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {typeof column.columnDef.header === 'string'
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                onClick={async () => onRowClicked(row.original.id)}
                className="hover:cursor-pointer"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                className="h-24 text-center"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end p-6">
        <div className="flex-1 text-sm text-muted-foreground">
          Showing {table.getFilteredRowModel().rows.length} of {entries.total}{' '}
          total{' '}
          {translateContent({
            key: 'currentCollection.name.plural',
            record: collection.name.plural,
          })}{' '}
          ({table.getFilteredSelectedRowModel().rows.length} selected)
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => table.previousPage()}
                disabled={table.getCanPreviousPage() === false}
              />
            </PaginationItem>

            {Array.from({ length: table.getPageCount() }).map(
              (_value, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <PaginationItem key={index + 1}>
                  <PaginationLink
                    onClick={() => table.setPageIndex(index)}
                    isActive={pagination.pageIndex === index}
                  >
                    {index + 1}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            {/* <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem> */}
            <PaginationItem>
              <PaginationNext
                onClick={() => table.nextPage()}
                disabled={table.getCanNextPage() === false}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}

export function EntryTableSkeleton(): React.JSX.Element {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-1/4 rounded bg-muted" />
      <div className="mt-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
