import { getReportAction, listScheduledReportsAction } from "@/core/actions/reports";
import { ReportsClient } from "./reports-client";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [report, scheduled] = await Promise.all([
    getReportAction({ period: "7d", dimension: "provider" }),
    listScheduledReportsAction(),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Rapports &amp; Statistiques</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Analyses multi-dimensions, export CSV/PDF et rapports planifiés par email.
        </p>
      </div>
      {!report.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{report.error}</div>
      ) : (
        <ReportsClient initial={report.data} initialScheduled={scheduled.ok ? scheduled.data : []} />
      )}
    </div>
  );
}
