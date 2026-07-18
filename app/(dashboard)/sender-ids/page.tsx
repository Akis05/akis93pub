import { listSenderIdsAction } from "@/core/actions/sender-ids";
import { SenderIdsClient } from "./sender-ids-client";
import { Tag } from "lucide-react";
import { orgGuard } from "@/core/lib/auth/org-guard";

export const dynamic = "force-dynamic";

export default async function SenderIdsPage() {
  const [res, ctx] = await Promise.all([
    listSenderIdsAction(),
    orgGuard(),
  ]);
  const role = ctx.ok ? ctx.ctx.role : "VIEWER";
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Sender IDs</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Gérez vos identifiants d'émetteur. L'approbation est réservée aux SUPER_ADMIN.
        </p>
      </div>
      {!res.success ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{res.error}</div>
      ) : (
        <SenderIdsClient
          isSuperAdmin={role === "SUPER_ADMIN"}
          initial={res.data.map((s) => ({
            id: s.id, name: s.name, type: s.type, status: s.status,
            approvedAt: s.approvedAt?.toISOString() ?? null,
            rejectedReason: s.rejectedReason,
            providerName: s.provider?.name ?? null,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
