import { useState } from "react";
import { Link } from "react-router";
import { useDashboard } from "../lib/dashboard";
import { useOpenLink } from "../lib/hooks";
import { fieldLabel } from "../lib/labels";
import { isEmptyValue, isScalar, parseTime, type Raw } from "../lib/resources";
import { TimeAgo } from "./bits";

const LONG_TEXT = 280;
const MAX_DEPTH = 6;
const IDENTIFIER = /^(arn:|[a-z0-9]+-[0-9a-f]{6,}$|[0-9a-f]{8}-[0-9a-f]{4}-)/;

function decodeJson(text: string): object | null {
  if (!/^\s*[[{]/.test(text)) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= LONG_TEXT) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <>
      <span className="whitespace-pre-wrap wrap-anywhere">
        {expanded ? text : `${text.slice(0, LONG_TEXT)}...`}
      </span>{" "}
      <button
        type="button"
        className="cursor-pointer text-reference underline underline-offset-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Show less" : `Show all ${text.length.toLocaleString()} characters`}
      </button>
    </>
  );
}

function StringValue({ text, field, depth }: { text: string; field: string; depth: number }) {
  const { inventory } = useDashboard();
  const openLink = useOpenLink();

  const time = parseTime(field, text);
  if (time) return <TimeAgo date={time} />;

  const target = inventory.references.get(text);
  if (target) {
    return (
      <Link
        to={openLink(target.uid)}
        title={`Open ${target.name}`}
        className="font-mono text-[0.875em] wrap-anywhere text-reference underline underline-offset-2"
      >
        {text}
      </Link>
    );
  }

  // IAM policies and similar documents are often stored as JSON text
  const decoded = decodeJson(text);
  if (decoded) return <Value value={decoded} field={field} depth={depth} />;

  if (IDENTIFIER.test(text)) {
    return <span className="font-mono text-[0.875em] wrap-anywhere">{text}</span>;
  }
  return <LongText text={text} />;
}

/** A list of same-shaped small objects reads best as a table: [{ Key, Value }, ...] */
function tableColumns(items: unknown[]): string[] | null {
  const columns = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    for (const [key, value] of Object.entries(item)) {
      if (value !== null && !isScalar(value)) return null;
      columns.add(key);
    }
  }
  return columns.size > 0 && columns.size <= 5 ? [...columns] : null;
}

function ArrayValue({ items, field, depth }: { items: unknown[]; field: string; depth: number }) {
  if (items.every(isScalar) && items.every((item) => String(item).length <= 80)) {
    return (
      <ul className="flex flex-wrap gap-x-1.5 gap-y-0.75">
        {items.map((item, index) => (
          <li key={index} className="max-w-full rounded-[2px] bg-sheet px-1.5">
            <Value value={item} field={field} depth={depth} />
          </li>
        ))}
      </ul>
    );
  }

  const columns = tableColumns(items);
  if (columns) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-label">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-ink-soft pr-3 pb-0.75 text-left font-normal text-ink-soft"
                >
                  {fieldLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} className="border-b border-rule py-0.75 pr-3 align-top wrap-anywhere">
                    <Value value={(item as Raw)[column]} field={column} depth={depth + 1} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul>
      {items.map((item, index) => (
        <li key={index} className="border-b border-rule py-2 first:pt-0 last:border-b-0 last:pb-0">
          <Value value={item} field={field} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

/** A set of label and value pairs, nested with a rule down the side. */
export function Properties({ object, depth = 0 }: { object: Raw; depth?: number }) {
  return (
    <dl
      className={`grid gap-x-4 gap-y-1.25 ${
        depth === 0
          ? "md:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)]"
          : depth === 1
            ? "border-l-2 border-rule pl-3 md:grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)]"
            : // Deeper levels stack, or the value column runs out of width
              "border-l-2 border-rule pl-3 [&>div>dd]:mb-1"
      }`}
    >
      {Object.entries(object).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="wrap-anywhere text-ink-soft">{fieldLabel(key)}</dt>
          <dd className="min-w-0 wrap-anywhere max-md:mb-2">
            <Value value={value} field={key} depth={depth} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Renders any value by what it is. Nothing is ever shown as a JSON string. */
export function Value({
  value,
  field,
  depth = 0,
}: {
  value: unknown;
  field: string;
  depth?: number;
}) {
  if (isEmptyValue(value)) return <span className="text-ink-soft">None</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") {
    const time = parseTime(field, value);
    return time ? <TimeAgo date={time} /> : <>{value}</>;
  }
  if (typeof value === "string") return <StringValue text={value} field={field} depth={depth} />;
  if (depth >= MAX_DEPTH) {
    return <span className="font-mono text-label wrap-anywhere">{JSON.stringify(value)}</span>;
  }
  if (Array.isArray(value)) return <ArrayValue items={value} field={field} depth={depth} />;
  return <Properties object={value as Raw} depth={depth + 1} />;
}
