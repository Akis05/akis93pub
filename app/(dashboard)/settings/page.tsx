import { getOrganizationSettingsAction } from "@/core/actions/settings";
import { SettingsClient } from "./settings-client";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const res = await getOrganizationSettingsAction();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Informations générales de l'organisation, fuseau horaire, logo.
        </p>
      </div>
      {!res.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{res.error}</div>
      ) : (
        <SettingsClient initial={{
          name: res.data.name, slug: res.data.slug,
          logo: res.data.logo, timezone: res.data.timezone,
        }} />
      )}
    </div>
  );
}
