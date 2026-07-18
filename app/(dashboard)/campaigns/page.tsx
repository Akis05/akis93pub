import { CampaignsClient } from "./campaigns-client";
import { Megaphone } from "lucide-react";

export const metadata = {
  title: "Campagnes — SMS Gateway Pro",
  description: "Gérez vos campagnes SMS avec un wizard en 5 étapes et suivi temps réel.",
};

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Campagnes</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Créez, planifiez et suivez vos campagnes SMS en temps réel.
        </p>
      </div>
      <CampaignsClient />
    </div>
  );
}
