import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDashboard } from "../lib/dashboard";
import { useOpenLink } from "../lib/hooks";
import { fieldLabel, modelSingular, serviceLabel, modelLabel } from "../lib/labels";
import {
  findReferrers,
  isClassConstant,
  isEmptyValue,
  isScalar,
  type Raw,
  type Resource,
} from "../lib/resources";
import { CopyButton, StatusLabel, TimeAgo } from "./bits";
import { Properties, Value } from "./Value";

const REFERRER_LIMIT = 12;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule py-4 last:border-b-0">
      <h3 className="mb-2 text-lead leading-tight font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-rule py-4 last:border-b-0">
      <summary className="cursor-pointer text-lead leading-tight font-medium group-open:mb-2">
        {title}
      </summary>
      {children}
    </details>
  );
}

function Fact({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string }) {
  return (
    <div className="contents">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-start justify-between gap-2.5 wrap-anywhere max-md:mb-2">
        <span className="min-w-0">{value}</span>
        {copy && <CopyButton text={copy} />}
      </dd>
    </div>
  );
}

/** Splits a resource's attributes into what's worth reading and what is empty. */
function sortAttributes(resource: Resource) {
  // Already shown at the top of the panel
  const facts = new Set(
    [resource.name, resource.id, resource.arn, resource.region, resource.account].filter(Boolean),
  );
  const settings: Raw = {};
  const nested: [string, unknown][] = [];
  const empty: string[] = [];
  const skip = new Set(resource.tagKeys);
  if (resource.status) skip.add(resource.status.key);
  if (resource.created) skip.add(resource.created.key);

  for (const key of Object.keys(resource.raw).sort((a, b) =>
    fieldLabel(a).localeCompare(fieldLabel(b)),
  )) {
    const value = resource.raw[key];
    if (skip.has(key) || isClassConstant(key)) continue;
    if (isEmptyValue(value)) empty.push(fieldLabel(key));
    else if (typeof value === "string" && facts.has(value)) continue;
    else if (isScalar(value) && !(typeof value === "string" && /^\s*[[{]/.test(value)))
      settings[key] = value;
    else nested.push([key, value]);
  }
  return { settings, nested, empty };
}

function closeHref(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("open");
  const search = next.toString();
  return search ? `?${search}` : "";
}

export function Inspector({ uid, resource }: { uid: string; resource?: Resource }) {
  const { inventory } = useDashboard();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const openLink = useOpenLink();
  const heading = useRef<HTMLHeadingElement>(null);

  const close = () => {
    navigate({ search: closeHref(params) });
    // Hand focus back to whatever opened this panel
    requestAnimationFrame(() => {
      const opener = [...document.querySelectorAll<HTMLElement>("[data-uid]")].find(
        (element) => element.dataset.uid === uid,
      );
      opener?.focus();
    });
  };

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const attributes = useMemo(() => (resource ? sortAttributes(resource) : null), [resource]);
  const referrers = useMemo(
    () => (resource ? findReferrers(resource, inventory.resources) : []),
    [resource, inventory],
  );

  const closeButton = (
    <button
      type="button"
      onClick={close}
      className="col-start-2 row-span-2 row-start-1 cursor-pointer self-start rounded-[3px] border border-ink-soft/50 px-2.5 py-0.5 text-label hover:border-ink-soft hover:bg-sheet"
    >
      Close
    </button>
  );

  return (
    <aside
      aria-label="Resource details"
      className="fixed inset-0 z-30 animate-inspector overflow-y-auto overscroll-contain border-ink bg-concrete motion-reduce:animate-none md:left-auto md:w-[min(36rem,100%)] md:border-l-2 xl:sticky xl:top-0 xl:h-screen xl:w-auto"
    >
      {!resource || !attributes ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-4">
          <h2
            ref={heading}
            tabIndex={-1}
            className="font-display text-h3 leading-tight font-semibold outline-none"
          >
            This resource no longer exists
          </h2>
          {closeButton}
          <p className="mt-2">It was removed, or Moto was reset, after this link was opened.</p>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-rule bg-concrete px-5 pt-4 pb-3.5">
            <p className="text-ink-soft">{modelSingular(resource.service, resource.model)}</p>
            {closeButton}
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-display text-h3 leading-[1.1] font-semibold wrap-anywhere outline-none"
            >
              {resource.name}
            </h2>
            {(resource.status || resource.builtin) && (
              <div className="col-span-2 mt-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                {resource.status && (
                  <span className="font-medium">
                    <StatusLabel status={resource.status} />
                  </span>
                )}
                {resource.builtin && (
                  <span className="text-label text-ink-soft">Built-in, created by Moto</span>
                )}
              </div>
            )}
          </div>

          <div className="px-5 pt-1 pb-12">
            <section className="border-b border-rule py-4 last:border-b-0">
              <dl className="grid gap-x-4 gap-y-1.25 md:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)]">
                {resource.arn && (
                  <Fact
                    label="ARN"
                    copy={resource.arn}
                    value={<span className="font-mono text-[0.875em]">{resource.arn}</span>}
                  />
                )}
                {resource.id && (
                  <Fact
                    label="ID"
                    copy={resource.id}
                    value={<span className="font-mono text-[0.875em]">{resource.id}</span>}
                  />
                )}
                {resource.region && <Fact label="Region" value={resource.region} />}
                {resource.account && <Fact label="Account" value={resource.account} />}
                {resource.created && (
                  <Fact label={resource.created.label} value={<TimeAgo date={resource.created.at} />} />
                )}
              </dl>
            </section>

            {resource.tags.length > 0 && (
              <Block title="Tags">
                <ul className="flex flex-wrap gap-1.5">
                  {resource.tags.map((tag) => (
                    <li
                      key={tag.key}
                      className="inline-flex max-w-full rounded-[2px] border border-ink-soft wrap-anywhere"
                    >
                      <span className="px-1.5 text-ink-soft">{tag.key}</span>
                      {tag.value && (
                        <span className="border-l border-ink-soft bg-sheet px-1.5 font-medium">
                          {tag.value}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {Object.keys(attributes.settings).length > 0 && (
              <Block title="Settings">
                <Properties object={attributes.settings} />
              </Block>
            )}

            {attributes.nested.map(([key, value]) => (
              <Block key={key} title={fieldLabel(key)}>
                <Value value={value} field={key} />
              </Block>
            ))}

            {referrers.length > 0 && (
              <Block title="Used by">
                <ul>
                  {referrers.slice(0, REFERRER_LIMIT).map((other) => (
                    <li key={other.uid} className="py-0.5">
                      <Link
                        to={openLink(other.uid)}
                        className="text-reference underline underline-offset-2"
                      >
                        {other.name}
                      </Link>{" "}
                      <span className="text-label text-ink-soft">
                        {serviceLabel(other.service)}, {modelLabel(other.service, other.model)}
                      </span>
                    </li>
                  ))}
                </ul>
                {referrers.length > REFERRER_LIMIT && (
                  <p className="mt-1 text-label text-ink-soft">
                    and {referrers.length - REFERRER_LIMIT} more
                  </p>
                )}
              </Block>
            )}

            {attributes.empty.length > 0 && (
              <Fold title={`Empty settings (${attributes.empty.length})`}>
                <p className="text-ink-soft">{attributes.empty.join(", ")}</p>
              </Fold>
            )}

            <Fold title="Raw data">
              <div className="mb-2">
                <CopyButton text={JSON.stringify(resource.raw, null, 2)} label="Copy JSON" />
              </div>
              <pre className="max-h-112 overflow-auto rounded-[3px] bg-sheet p-3 font-mono text-label leading-normal wrap-anywhere whitespace-pre-wrap">
                {JSON.stringify(resource.raw, null, 2)}
              </pre>
            </Fold>
          </div>
        </>
      )}
    </aside>
  );
}
