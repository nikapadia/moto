import { useMemo } from "react";
import { Link } from "react-router";
import { groupByService, useDashboard } from "../lib/dashboard";
import { useOpenLink } from "../lib/hooks";

const TOKENS_PER_TYPE = 8;

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function NothingDeployed() {
  const { hiddenBuiltin } = useDashboard();
  const endpoint = window.location.origin;
  return (
    <div className="max-w-2xl pt-12">
      <h1 className="font-display text-h2 leading-tight font-semibold">Nothing deployed yet</h1>
      <p className="mt-3">
        Point an AWS SDK at this server and create something. It appears here after a refresh.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-[3px] bg-concrete px-4 py-3.5 font-mono text-label leading-relaxed">
        {`import boto3

s3 = boto3.client("s3", endpoint_url="${endpoint}", region_name="us-east-1")
s3.create_bucket(Bucket="my-bucket")`}
      </pre>
      {hiddenBuiltin > 0 && (
        <p className="mt-3 text-ink-soft">
          {plural(hiddenBuiltin, "built-in resource")} that Moto created by itself are hidden. Tick
          Built-in above to see them.
        </p>
      )}
    </div>
  );
}

export function Overview() {
  const { visible, hiddenBuiltin, fresh } = useDashboard();
  const openLink = useOpenLink();
  const services = useMemo(() => groupByService(visible), [visible]);

  if (visible.length === 0) return <NothingDeployed />;

  return (
    <>
      <h1 className="font-display text-h2 leading-tight font-semibold md:text-h1">
        Deployed resources
      </h1>
      <p className="mt-1.5 max-w-2xl text-ink-soft">
        {plural(visible.length, "resource")} in {plural(services.length, "service")}.
        {hiddenBuiltin > 0 &&
          ` Hiding ${plural(hiddenBuiltin, "built-in resource")} that Moto created by itself, such as sample AMIs and default VPCs.`}
      </p>

      <div className="mt-6">
        {services.map(({ service, label, models }) => (
          <section
            key={service}
            className="grid gap-x-6 border-t-2 border-ink pt-3 pb-3.5 md:grid-cols-[10.5rem_minmax(0,1fr)]"
          >
            <h2 className="mb-1.5 md:mb-0">
              <Link
                to={`/${service}`}
                className="font-display text-h3 leading-tight font-semibold wrap-anywhere hover:underline"
              >
                {label}
              </Link>
            </h2>
            <div>
              {models.map(({ model, label: typeLabel, resources }) => (
                <div
                  key={model}
                  className="grid gap-x-4 py-1 md:grid-cols-[11rem_minmax(0,1fr)]"
                >
                  <Link
                    to={`/${service}/${model}`}
                    className="self-start py-0.5 text-ink-soft hover:text-ink hover:underline"
                  >
                    {typeLabel} ({resources.length.toLocaleString()})
                  </Link>
                  <ul className="flex flex-wrap gap-x-1.5 gap-y-1">
                    {resources.slice(0, TOKENS_PER_TYPE).map((resource) => (
                      <li key={resource.uid} className="max-w-full">
                        <Link
                          to={openLink(resource.uid)}
                          data-uid={resource.uid}
                          title={resource.id ?? undefined}
                          className={`inline-block max-w-full rounded-[2px] bg-concrete px-1.75 py-px font-medium wrap-anywhere hover:bg-ink hover:text-sheet ${
                            fresh.has(resource.uid) ? "animate-flash motion-reduce:animate-none" : ""
                          }`}
                        >
                          {resource.name}
                        </Link>
                      </li>
                    ))}
                    {resources.length > TOKENS_PER_TYPE && (
                      <li className="self-center text-label text-ink-soft">
                        and {(resources.length - TOKENS_PER_TYPE).toLocaleString()} more
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-label text-ink-soft">
        Moto was created by{" "}
        <a className="underline" href="https://twitter.com/spulec" target="_blank" rel="noopener noreferrer">
          Steve Pulec
        </a>{" "}
        and{" "}
        <a
          className="underline"
          href="https://github.com/getmoto/moto/blob/master/AUTHORS.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          many other contributors
        </a>
        . Report problems on the{" "}
        <a
          className="underline"
          href="https://github.com/getmoto/moto/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          issue tracker
        </a>
        .
      </p>
    </>
  );
}
