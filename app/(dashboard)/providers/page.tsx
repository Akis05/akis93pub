import { listProvidersAction } from "@/core/actions/providers";
import { ProvidersClient } from "./providers-client";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const res = await listProvidersAction();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Fournisseurs SMS</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Gérez vos fournisseurs SMS (SMPP / HTTP API) et consultez leurs statistiques.
        </p>
      </div>
      {!res.success ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {res.error}
        </div>
      ) : (
        <ProvidersClient initial={res.data.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        }))} />
      )}
    </div>
  );
}
