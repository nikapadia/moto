import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useSearchParams } from "react-router";
import { Inspector } from "./components/Inspector";
import { Overview } from "./components/Overview";
import { Rail } from "./components/Rail";
import { SearchResults } from "./components/SearchResults";
import { ServicePage } from "./components/ServicePage";
import { Toolbar } from "./components/Toolbar";
import { type Dashboard, DashboardContext } from "./lib/dashboard";
import { useStoredState } from "./lib/hooks";
import { buildInventory, type ModelData } from "./lib/resources";

const AUTO_REFRESH_MS = 5000;

async function fetchResources(): Promise<ModelData> {
  const response = await fetch("/moto-api/data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered with status ${response.status}`);
  return response.json();
}

export function App() {
  const [showBuiltin, setShowBuiltin] = useStoredState("moto-show-builtin", false);
  const [autoRefresh, setAutoRefresh] = useStoredState("moto-auto-refresh", false);
  const [region, setRegion] = useState("");
  const [account, setAccount] = useState("");
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const openUid = params.get("open");

  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["resources"],
    queryFn: fetchResources,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
    refetchOnWindowFocus: false,
    retry: 1,
    // The payload can be megabytes, and every refresh replaces all of it anyway
    structuralSharing: false,
  });

  const inventory = useMemo(() => (data ? buildInventory(data) : null), [data]);

  const previousUids = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!inventory) return;
    const uids = new Set(inventory.byUid.keys());
    const previous = previousUids.current;
    if (previous) setFresh(new Set([...uids].filter((uid) => !previous.has(uid))));
    previousUids.current = uids;
  }, [inventory]);

  const dashboard = useMemo<Dashboard | null>(() => {
    if (!inventory) return null;
    const matchesPlace = (resource: { region: string | null; account: string | null }) =>
      (!region || resource.region === region) && (!account || resource.account === account);
    const placed = inventory.resources.filter(matchesPlace);
    return {
      inventory,
      fresh,
      visible: showBuiltin ? placed : placed.filter((resource) => !resource.builtin),
      hiddenBuiltin: showBuiltin ? 0 : placed.filter((resource) => resource.builtin).length,
    };
  }, [inventory, fresh, showBuiltin, region, account]);

  const options = useMemo(() => {
    const deployed = inventory?.resources.filter((resource) => !resource.builtin) ?? [];
    const distinct = (values: (string | null)[]) =>
      [...new Set(values.filter((value): value is string => !!value))].sort();
    return {
      regions: distinct(deployed.map((resource) => resource.region)),
      accounts: distinct(deployed.map((resource) => resource.account)),
    };
  }, [inventory]);

  const builtinCount = useMemo(
    () => inventory?.resources.filter((resource) => resource.builtin).length ?? 0,
    [inventory],
  );

  const inspected = openUid ? inventory?.byUid.get(openUid) : undefined;

  const toolbar = (
    <Toolbar
      regions={options.regions}
      region={region}
      onRegionChange={setRegion}
      accounts={options.accounts}
      account={account}
      onAccountChange={setAccount}
      builtinCount={builtinCount}
      showBuiltin={showBuiltin}
      onShowBuiltinChange={setShowBuiltin}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      refreshing={isFetching}
      onRefresh={() => refetch()}
      updatedAt={dataUpdatedAt}
    />
  );

  const failure = error && (
    <p className="mb-5 max-w-2xl border-l-4 border-bad bg-concrete px-4 py-3" role="alert">
      Can't load resources from {window.location.origin}: {error.message}. Check that Moto is still
      running, then refresh.
      {dashboard && " The list below is from the last successful refresh."}
    </p>
  );

  return (
    <div
      className={`min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)] ${
        openUid ? "xl:grid-cols-[15rem_minmax(0,1fr)_minmax(24rem,36rem)]" : ""
      }`}
    >
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="absolute -top-16 left-3 z-40 bg-sheet px-3 py-2 focus:top-3"
      >
        Skip to resources
      </a>
      <DashboardContext.Provider value={dashboard}>
        <Rail />
        <div className="min-w-0">
          {toolbar}
          <main id="main" tabIndex={-1} className="px-4 pt-5 pb-16 outline-none md:px-8 md:pt-6">
            {failure}
            {!dashboard && !error && <p className="text-ink-soft">Loading resources</p>}
            {dashboard &&
              (query ? (
                <SearchResults query={query} />
              ) : (
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/:service" element={<ServicePage />} />
                  <Route path="/:service/:model" element={<ServicePage />} />
                </Routes>
              ))}
          </main>
        </div>
        {dashboard && openUid && <Inspector key={openUid} uid={openUid} resource={inspected} />}
      </DashboardContext.Provider>
    </div>
  );
}
