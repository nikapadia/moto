import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDashboard } from "../lib/dashboard";
import { useOpenLink } from "../lib/hooks";
import { chooseColumns, matchesQuery, parseTime, type Resource } from "../lib/resources";
import { StatusLabel, TimeAgo } from "./bits";

const PAGE_SIZE = 100;

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const helper = createColumnHelper<typeof features, Resource>();

type SortValue = string | number | null;

function sortValue(columnId: string, resource: Resource): SortValue {
  switch (columnId) {
    case "$name":
      return resource.name;
    case "$status":
      return resource.status?.label ?? null;
    case "$region":
      return resource.region;
    case "$created":
      return resource.created?.at.getTime() ?? null;
    default: {
      const value = resource.raw[columnId];
      if (typeof value === "number" || typeof value === "string") return value;
      return typeof value === "boolean" ? String(value) : null;
    }
  }
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function Cell({ columnId, resource }: { columnId: string; resource: Resource }) {
  if (columnId === "$status")
    return resource.status ? <StatusLabel status={resource.status} /> : null;
  if (columnId === "$region") return <>{resource.region}</>;
  if (columnId === "$created")
    return resource.created ? <TimeAgo date={resource.created.at} /> : null;

  const value = resource.raw[columnId];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") {
    const time = parseTime(columnId, value);
    return time ? <TimeAgo date={time} /> : <>{value}</>;
  }
  const time = parseTime(columnId, value);
  if (time) return <TimeAgo date={time} />;
  const isIdentifier = /^(arn:|[a-z0-9]+-[0-9a-f]{6,}$)/.test(String(value));
  return (
    <span
      title={String(value)}
      className={`block max-w-104 truncate ${isIdentifier ? "font-mono text-[0.875em]" : ""}`}
    >
      {String(value)}
    </span>
  );
}

function ColumnsMenu({
  choices,
  isVisible,
  onToggle,
}: {
  choices: { id: string; label: string }[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string, visible: boolean) => void;
}) {
  return (
    <details className="relative ml-auto">
      <summary className="cursor-pointer list-none rounded-[3px] border border-rule px-2 py-0.5 text-label hover:border-ink-soft [&::-webkit-details-marker]:hidden">
        Columns
      </summary>
      <div className="absolute right-0 z-10 mt-1 max-h-88 w-68 overflow-y-auto rounded-[3px] border border-ink bg-sheet px-3 py-2">
        {choices.map(({ id, label }) => (
          <label key={id} className="flex cursor-pointer items-center gap-1.5 py-0.75">
            <input
              type="checkbox"
              className="size-4 accent-ink"
              checked={isVisible(id)}
              onChange={(event) => onToggle(id, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
    </details>
  );
}

export function ResourceTable({
  service,
  model,
  label,
  rows,
}: {
  service: string;
  model: string;
  label: string;
  rows: Resource[];
}) {
  const { fresh } = useDashboard();
  const [params] = useSearchParams();
  const openUid = params.get("open");
  const openLink = useOpenLink();
  const navigate = useNavigate();

  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const filtered = useMemo(
    () => (deferredFilter ? rows.filter((row) => matchesQuery(row, deferredFilter)) : rows),
    [rows, deferredFilter],
  );

  const choices = useMemo(() => chooseColumns(service, model, rows), [service, model, rows]);
  const regions = useMemo(() => new Set(rows.map((row) => row.region)), [rows]);
  const hasStatus = rows.some((row) => row.status);
  const hasCreated = rows.some((row) => row.created);
  const createdLabel = rows.find((row) => row.created)?.created?.label ?? "Created";

  const columns = useMemo(() => {
    const definition = (id: string, header: string) =>
      helper.accessor((row) => sortValue(id, row), {
        id,
        header,
        sortFn: (a, b) =>
          compareValues(sortValue(id, a.original), sortValue(id, b.original)),
        sortUndefined: "last",
      });
    return helper.columns([
      definition("$name", "Name"),
      definition("$status", "Status"),
      ...choices.map((choice) => definition(choice.key, choice.label)),
      definition("$region", "Region"),
      definition("$created", createdLabel),
    ]);
  }, [choices, createdLabel]);

  const defaultVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {
      $status: hasStatus,
      // Only worth a column when it tells rows apart
      $region: regions.size > 1,
      $created: hasCreated,
    };
    for (const choice of choices) visibility[choice.key] = choice.visible;
    return visibility;
  }, [choices, hasStatus, regions, hasCreated]);

  const [visibilityChoices, setVisibilityChoices] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([]);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const columnVisibility = useMemo(
    () => ({ ...defaultVisibility, ...visibilityChoices }),
    [defaultVisibility, visibilityChoices],
  );

  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (row) => row.uid,
    state: {
      sorting,
      columnVisibility,
      pagination: { pageIndex: 0, pageSize },
    },
    onSortingChange: setSorting,
    enableSortingRemoval: true,
    autoResetPageIndex: false,
  });

  const shown = table.getRowModel().rows;
  const remaining = filtered.length - shown.length;

  return (
    <>
      <div className="mt-3.5 mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="min-w-0 flex-[0_1_18rem]">
          <span className="sr-only">Filter {label.toLowerCase()}</span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={`Filter ${label.toLowerCase()}`}
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-[3px] border border-rule bg-sheet px-2.5 placeholder:text-ink-soft"
          />
        </label>
        {deferredFilter && (
          <span role="status" className="text-label text-ink-soft">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}
          </span>
        )}
        <ColumnsMenu
          choices={[
            ...(hasStatus ? [{ id: "$status", label: "Status" }] : []),
            ...choices.map(({ key, label: choiceLabel }) => ({ id: key, label: choiceLabel })),
            { id: "$region", label: "Region" },
            ...(hasCreated ? [{ id: "$created", label: createdLabel }] : []),
          ]}
          isVisible={(id) => columnVisibility[id] !== false}
          onToggle={(id, visible) =>
            setVisibilityChoices((current) => ({ ...current, [id]: visible }))
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                      }
                      className="border-b border-ink pt-1 pr-5 pb-1.5 text-left align-bottom whitespace-nowrap first:pl-3"
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`cursor-pointer text-label font-medium hover:text-ink ${
                          sorted ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {header.column.columnDef.header as string}
                        {sorted === "asc" && " ▴"}
                        {sorted === "desc" && " ▾"}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {shown.map((row) => {
              const resource = row.original;
              const selected = resource.uid === openUid;
              return (
                <tr
                  key={row.id}
                  aria-current={selected ? "true" : undefined}
                  onClick={(event) => {
                    const clickedLink = (event.target as HTMLElement).closest("a");
                    const selecting = window.getSelection()?.toString();
                    if (!clickedLink && !selecting) navigate(openLink(resource.uid));
                  }}
                  className={`group cursor-pointer ${
                    selected ? "bg-selected shadow-[inset_5px_0_0_var(--color-marker)]" : "hover:bg-concrete"
                  } ${fresh.has(resource.uid) ? "animate-flash motion-reduce:animate-none" : ""}`}
                >
                  {row.getVisibleCells().map((cell) =>
                    cell.column.id === "$name" ? (
                      <th
                        key={cell.id}
                        scope="row"
                        className="min-w-52 border-b border-rule py-2 pr-5 pl-3 text-left align-top font-normal"
                      >
                        <Link
                          to={openLink(resource.uid)}
                          data-uid={resource.uid}
                          className="block font-medium wrap-anywhere hover:underline"
                        >
                          {resource.name}
                        </Link>
                        {resource.id && (
                          <span className="block font-mono text-[0.8125rem] wrap-anywhere text-ink-soft">
                            {resource.id}
                          </span>
                        )}
                      </th>
                    ) : (
                      <td key={cell.id} className="border-b border-rule py-2 pr-5 align-top">
                        <Cell columnId={cell.column.id} resource={resource} />
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="mt-4">
          No {label.toLowerCase()} match "{deferredFilter}".{" "}
          <button
            type="button"
            className="cursor-pointer text-reference underline underline-offset-2"
            onClick={() => setFilter("")}
          >
            Clear the filter
          </button>
        </p>
      )}
      {remaining > 0 && (
        <p className="mt-3.5 text-ink-soft">
          Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()}.{" "}
          <button
            type="button"
            className="cursor-pointer text-reference underline underline-offset-2"
            onClick={() => setPageSize((size) => size + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, remaining).toLocaleString()} more
          </button>
        </p>
      )}
    </>
  );
}
