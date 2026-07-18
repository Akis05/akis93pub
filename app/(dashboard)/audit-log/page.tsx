import { listAuditLogsAction } from "@/core/actions/audit";
import { AuditClient } from "./audit-client";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const res = await listAuditLogsAction({ limit: 100 });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ScrollText className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Journal d'audit</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Toutes les actions sont tracées de façon immuable. Filtres et export CSV disponibles.
        </p>
      </div>
      {!res.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{res.error}</div>
      ) : (
        <AuditClient initial={res.data.map((l) => ({
          id: l.id, action: l.action, entity: l.entity, entityId: l.entityId,
          userEmail: l.userEmail, ipAddress: l.ipAddress,
          details: l.details, createdAt: l.createdAt.toISOString(),
        }))} />
      )}
    </div>
  );
}
