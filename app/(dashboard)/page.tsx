import {
  getKpisAction,
  getVolumeTimeseriesAction,
  getDlrBreakdownAction,
  getTopCampaignsAction,
  getRecentAuditAction,
  getConnectorStatusAction,
} from "@/core/actions/dashboard";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpis, volume, dlr, campaigns, audit, connectors] = await Promise.all([
    getKpisAction(),
    getVolumeTimeseriesAction(7),
    getDlrBreakdownAction(30),
    getTopCampaignsAction(5),
    getRecentAuditAction(8),
    getConnectorStatusAction(),
  ]);

  const firstError = [kpis, volume, dlr, campaigns, audit, connectors]
    .find((r) => !r.ok);
  if (firstError && !firstError.ok) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {firstError.error}
      </div>
    );
  }

  return (
    <DashboardClient
      kpis={kpis.ok ? kpis.data : null}
      volume={volume.ok ? volume.data : []}
      dlr={dlr.ok ? dlr.data : []}
      campaigns={campaigns.ok ? campaigns.data : []}
      audit={(audit.ok ? audit.data : []).map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
      connectors={(connectors.ok ? connectors.data : []).map((c) => ({
        ...c,
        lastConnectedAt: c.lastConnectedAt?.toISOString() ?? null,
        lastDisconnectedAt: c.lastDisconnectedAt?.toISOString() ?? null,
      }))}
    />
  );
}
