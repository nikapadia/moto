import { createContext, useContext } from "react";
import { modelLabel, serviceLabel } from "./labels";
import type { Inventory, Resource } from "./resources";

export interface Dashboard {
  inventory: Inventory;
  /** Resources left after the built-in, region and account filters. */
  visible: Resource[];
  /** Resources that appeared in the latest refresh. */
  fresh: Set<string>;
  hiddenBuiltin: number;
}

export const DashboardContext = createContext<Dashboard | null>(null);

export function useDashboard(): Dashboard {
  const dashboard = useContext(DashboardContext);
  if (!dashboard) throw new Error("useDashboard needs a DashboardContext");
  return dashboard;
}

export interface ModelGroup {
  model: string;
  label: string;
  resources: Resource[];
}

export interface ServiceGroup {
  service: string;
  label: string;
  count: number;
  models: ModelGroup[];
}

export function groupByService(resources: Resource[]): ServiceGroup[] {
  const services = new Map<string, Map<string, Resource[]>>();
  for (const resource of resources) {
    let models = services.get(resource.service);
    if (!models) services.set(resource.service, (models = new Map()));
    const rows = models.get(resource.model);
    if (rows) rows.push(resource);
    else models.set(resource.model, [resource]);
  }
  return [...services.entries()]
    .map(([service, models]) => ({
      service,
      label: serviceLabel(service),
      count: [...models.values()].reduce((total, rows) => total + rows.length, 0),
      models: [...models.entries()]
        .map(([model, rows]) => ({
          model,
          label: modelLabel(service, model),
          resources: rows,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
