import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { groupByService, useDashboard } from "../lib/dashboard";
import { serviceLabel } from "../lib/labels";
import { ResourceTable } from "./ResourceTable";

export function ServicePage() {
  const { service = "", model } = useParams();
  const { visible, inventory } = useDashboard();
  const group = useMemo(
    () =>
      groupByService(visible.filter((resource) => resource.service === service))[0],
    [visible, service],
  );

  if (!group) {
    const exists = inventory.resources.some((resource) => resource.service === service);
    return (
      <div className="max-w-2xl pt-12">
        <h1 className="font-display text-h2 leading-tight font-semibold">
          {serviceLabel(service)} has nothing to show
        </h1>
        <p className="mt-3">
          {exists
            ? "Its resources are built-in ones, which are hidden, or the region and account filters exclude them."
            : "Its resources may have been removed since the last refresh."}{" "}
          <Link to="/" className="text-reference underline">
            See all resources
          </Link>
        </p>
      </div>
    );
  }

  const active = group.models.find((entry) => entry.model === model) ?? group.models[0];

  return (
    <>
      <h1 className="font-display text-h2 leading-tight font-semibold wrap-anywhere md:text-h1">
        {group.label}
      </h1>
      <nav
        aria-label={`${group.label} resource types`}
        className="mt-5 flex flex-wrap gap-x-5 gap-y-0.5 border-b-2 border-ink"
      >
        {group.models.map(({ model: name, label, resources }) => (
          <Link
            key={name}
            to={`/${service}/${name}`}
            aria-current={name === active.model ? "page" : undefined}
            className="-mb-0.5 border-b-5 border-transparent pt-1.5 pb-1.75 text-ink-soft hover:text-ink aria-[current=page]:border-marker aria-[current=page]:font-medium aria-[current=page]:text-ink"
          >
            {label} <span className="ml-0.5">{resources.length.toLocaleString()}</span>
          </Link>
        ))}
      </nav>
      <ResourceTable
        key={`${service}/${active.model}`}
        service={service}
        model={active.model}
        label={active.label}
        rows={active.resources}
      />
    </>
  );
}
