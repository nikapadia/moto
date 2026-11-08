import { Fragment, useDeferredValue, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDashboard } from "../lib/dashboard";
import { useOpenLink } from "../lib/hooks";
import { modelLabel, serviceLabel } from "../lib/labels";
import { findMatch, searchResources } from "../lib/resources";

const RESULT_LIMIT = 200;

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}

function clip(text: string, term: string): string {
  if (text.length <= 140) return text;
  const at = text.toLowerCase().indexOf(term);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 140)}...`;
}

export function SearchResults({ query }: { query: string }) {
  const deferred = useDeferredValue(query);
  const { visible, hiddenBuiltin, fresh } = useDashboard();
  const [params] = useSearchParams();
  const openLink = useOpenLink();
  const navigate = useNavigate();
  const results = useMemo(() => searchResources(visible, deferred), [visible, deferred]);
  const terms = deferred.toLowerCase().split(/\s+/).filter(Boolean);
  const openUid = params.get("open");

  return (
    <>
      <h1 className="font-display text-h2 leading-tight font-semibold wrap-anywhere">
        {results.length === 0
          ? `No results for "${deferred}"`
          : `${results.length.toLocaleString()} result${results.length === 1 ? "" : "s"} for "${deferred}"`}
      </h1>
      {results.length === 0 && (
        <p className="mt-3 max-w-2xl">
          Search looks through every value of the resources on this page.
          {hiddenBuiltin > 0 &&
            ` ${hiddenBuiltin.toLocaleString()} built-in resources are hidden: tick Built-in to include them.`}
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-5 border-t-2 border-ink">
          {results.slice(0, RESULT_LIMIT).map((resource) => {
            const nameMatches = terms.every((term) =>
              resource.name.toLowerCase().includes(term),
            );
            const unmatched = terms.find((term) => !resource.name.toLowerCase().includes(term));
            const match = !nameMatches && unmatched ? findMatch(resource.raw, unmatched) : null;
            return (
              <li
                key={resource.uid}
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest("a")) navigate(openLink(resource.uid));
                }}
                className={`grid cursor-pointer gap-x-6 gap-y-0.5 border-b border-rule px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] ${
                  resource.uid === openUid ? "bg-selected" : "hover:bg-concrete"
                } ${fresh.has(resource.uid) ? "animate-flash motion-reduce:animate-none" : ""}`}
              >
                <div className="min-w-0">
                  <Link
                    to={openLink(resource.uid)}
                    data-uid={resource.uid}
                    className="block font-medium wrap-anywhere hover:underline"
                  >
                    <Highlight text={resource.name} terms={terms} />
                  </Link>
                  {resource.id && (
                    <span className="block font-mono text-label wrap-anywhere text-ink-soft">
                      <Highlight text={resource.id} terms={terms} />
                    </span>
                  )}
                </div>
                <div className="text-label text-ink-soft md:text-right">
                  {serviceLabel(resource.service)}, {modelLabel(resource.service, resource.model)}
                </div>
                {match && (
                  <p className="text-label wrap-anywhere text-ink-soft md:col-span-2">
                    {match.path}: <Highlight text={clip(match.text, unmatched!)} terms={terms} />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {results.length > RESULT_LIMIT && (
        <p className="mt-3.5 text-ink-soft">
          Showing the first {RESULT_LIMIT}. Add another word to narrow the search.
        </p>
      )}
    </>
  );
}
