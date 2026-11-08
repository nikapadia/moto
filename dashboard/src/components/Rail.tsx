import { useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router";
import { DashboardContext, groupByService } from "../lib/dashboard";
import { useStoredState } from "../lib/hooks";

const linkClass =
  "flex justify-between gap-3 px-4 py-1.25 font-medium hover:bg-rail-hover aria-[current=page]:bg-rail-current aria-[current=page]:text-rail-current-ink -outline-offset-3 focus-visible:outline-current max-md:flex-none max-md:px-3 max-md:py-2";

function Marker() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6.5 flex-none md:size-8">
      <circle cx="12" cy="12" r="12" className="fill-marker-ring" />
      <path
        d="M12 12V1.5A10.5 10.5 0 0 1 22.5 12zM12 12v10.5A10.5 10.5 0 0 1 1.5 12z"
        className="fill-marker-fill"
      />
    </svg>
  );
}

function ThemeToggle() {
  const [stored, setStored] = useStoredState<"light" | "dark" | null>("moto-theme", null);
  const [systemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const isDark = stored ? stored === "dark" : systemDark;
  useEffect(() => {
    if (stored) document.documentElement.dataset.theme = stored;
  }, [stored]);
  return (
    <button
      type="button"
      onClick={() => setStored(isDark ? "light" : "dark")}
      className="cursor-pointer py-0.5 underline underline-offset-2"
    >
      {isDark ? "Use light theme" : "Use dark theme"}
    </button>
  );
}

export function Rail() {
  const dashboard = useContext(DashboardContext);
  const services = useMemo(
    () => (dashboard ? groupByService(dashboard.visible) : []),
    [dashboard],
  );
  const hasFresh = (service: string) =>
    dashboard?.visible.some(
      (resource) => resource.service === service && dashboard.fresh.has(resource.uid),
    );

  return (
    <header className="flex flex-col bg-rail text-rail-ink md:sticky md:top-0 md:h-screen">
      <Link
        to="/"
        aria-label="Moto, all resources"
        className="flex items-center gap-2.5 px-4 pt-3 pb-2 md:pt-4.5 md:pb-4"
      >
        <Marker />
        <span className="font-display text-h3 leading-none font-semibold md:text-h2">moto</span>
      </Link>
      <nav
        aria-label="Services"
        className="flex flex-1 overflow-x-auto overscroll-contain whitespace-nowrap md:block md:overflow-y-auto md:pb-2 md:whitespace-normal"
      >
        <NavLink
          to="/"
          end
          className={`${linkClass} border-current md:mb-2.5 md:border-y-2 md:py-2 md:aria-[current=page]:border-rail-current`}
        >
          <span>All resources</span>
          <span>{dashboard ? dashboard.visible.length.toLocaleString() : ""}</span>
        </NavLink>
        {services.map(({ service, label, count }) => (
          <NavLink key={service} to={`/${service}`} className={linkClass}>
            <span>{label}</span>
            <span
              className={
                hasFresh(service) ? "bg-rail-current px-1.25 text-rail-current-ink" : undefined
              }
            >
              {count.toLocaleString()}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="hidden flex-col items-start gap-0.5 border-t-2 border-current px-4 pt-2.5 pb-3.5 text-label md:flex">
        <ThemeToggle />
        <a
          className="py-0.5 underline underline-offset-2"
          href="https://docs.getmoto.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Documentation
        </a>
        <a
          className="py-0.5 underline underline-offset-2"
          href="https://github.com/getmoto/moto"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
