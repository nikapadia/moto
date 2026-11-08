import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

const controlHeight = "h-9.5 rounded-[3px]";
const SEARCH_DELAY_MS = 120;

interface ToolbarProps {
  regions: string[];
  region: string;
  onRegionChange: (region: string) => void;
  accounts: string[];
  account: string;
  onAccountChange: (account: string) => void;
  builtinCount: number;
  showBuiltin: boolean;
  onShowBuiltinChange: (show: boolean) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (auto: boolean) => void;
  refreshing: boolean;
  onRefresh: () => void;
  updatedAt: number;
}

function Search() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  // The input owns its text. URL updates are asynchronous, so driving the input
  // from the URL directly would drop characters typed between them.
  const [text, setText] = useState(urlQuery);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Changed from elsewhere, such as by following a link
    if (document.activeElement !== input.current) setText(urlQuery);
  }, [urlQuery]);

  const setQuery = (value: string, delay: number) => {
    setText(value);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set("q", value);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, delay);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-w-[min(18rem,100%)] flex-[1_1_18rem]">
      <label htmlFor="search" className="sr-only">
        Search all resources
      </label>
      <input
        id="search"
        ref={input}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => setQuery(event.target.value, SEARCH_DELAY_MS)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.stopPropagation();
            setQuery("", 0);
          }
        }}
        placeholder="Search names, IDs, ARNs and tags"
        className={`peer w-full bg-concrete pr-9 pl-3 placeholder:text-ink-soft focus:outline-2 focus:outline-offset-0 focus:outline-ink ${controlHeight}`}
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 w-5.5 -translate-y-1/2 rounded-[3px] border border-ink-soft text-center font-mono text-label leading-tight text-ink-soft peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden"
      >
        /
      </kbd>
    </div>
  );
}

function Picker({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  // One region or account means there is nothing to choose between
  if (options.length < 2 && !value) return null;
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`max-w-52 border border-rule bg-sheet px-1.5 ${controlHeight}`}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label title={title} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-ink"
      />
      {children}
    </label>
  );
}

export function Toolbar(props: ToolbarProps) {
  const updated = props.updatedAt
    ? `Updated ${new Date(props.updatedAt).toLocaleTimeString()}`
    : "";
  return (
    <div className="z-20 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-rule bg-sheet px-4 py-3 md:sticky md:top-0 md:px-8">
      <Search />
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <Picker
          label="Filter by region"
          allLabel="All regions"
          options={props.regions}
          value={props.region}
          onChange={props.onRegionChange}
        />
        <Picker
          label="Filter by account"
          allLabel="All accounts"
          options={props.accounts}
          value={props.account}
          onChange={props.onAccountChange}
        />
        <Check
          checked={props.showBuiltin}
          onChange={props.onShowBuiltinChange}
          title="Sample AMIs, default VPCs and internal records that Moto creates by itself"
        >
          Built-in ({props.builtinCount.toLocaleString()})
        </Check>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span role="status" className="whitespace-nowrap text-label text-ink-soft">
          {updated}
        </span>
        <Check
          checked={props.autoRefresh}
          onChange={props.onAutoRefreshChange}
          title="Fetches all resources every 5 seconds. Moto's recorder captures these requests while it is on."
        >
          Auto-refresh
        </Check>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.refreshing}
          className={`cursor-pointer whitespace-nowrap bg-ink px-3.5 font-medium text-sheet hover:bg-ink-soft disabled:cursor-progress disabled:opacity-65 ${controlHeight}`}
        >
          {props.refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
