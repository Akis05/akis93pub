import { listBlacklistedAction } from "@/core/actions/contacts";
import { BlacklistClient } from "./blacklist-client";
import { Ban } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlacklistPage() {
  const res = await listBlacklistedAction();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
            <Ban className="h-4 w-4 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Liste noire (opt-out)</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Contacts ayant demandé à ne plus recevoir de SMS (STOP/UNSUBSCRIBE/ARRET ou ajout manuel). Ils sont automatiquement exclus de tous les envois.
        </p>
      </div>
      {!res.success ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {res.error}
        </div>
      ) : (
        <BlacklistClient initialRows={res.data.map((c) => ({
          id: c.id, phone: c.phone, firstName: c.firstName, lastName: c.lastName,
          updatedAt: c.updatedAt.toISOString(), tags: c.tags,
        }))} />
      )}
    </div>
  );
}
