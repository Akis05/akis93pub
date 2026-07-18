import { listRoutesAction } from "@/core/actions/routes";
import { listConnectorsAction } from "@/core/actions/connectors";
import { RoutesClient } from "./routes-client";
import { Route as RouteIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const [routes, connectors] = await Promise.all([
    listRoutesAction(),
    listConnectorsAction(),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <RouteIcon className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Routage SMS</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Routes SMS par préfixe / pays / connecteur. La route active la plus prioritaire décide du connecteur.
        </p>
      </div>
      {!routes.success ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{routes.error}</div>
      ) : (
        <RoutesClient
          initial={routes.data.map((r) => ({
            id: r.id, name: r.name, priority: r.priority,
            isActive: r.isActive, isDefault: r.isDefault,
            rules: r.rules,
            connectorId: r.providerId,
            connectorName: r.provider?.name ?? null,
            connectorStatus: null,
            createdAt: r.createdAt.toISOString(),
          }))}
          connectors={(connectors.success ? connectors.data : []).map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
    </div>
  );
}
