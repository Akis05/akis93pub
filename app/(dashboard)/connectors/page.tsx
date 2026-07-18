import { ConnectorsClient } from "./connectors-client";
import { Plug } from "lucide-react";

export const metadata = {
  title: "Connecteurs SMPP — SMS Gateway Pro",
  description: "Connecteur SMPP reflétant la configuration .env (lecture seule).",
};

export default function ConnectorsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Plug className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Connecteurs SMPP</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Le connecteur SMPP reflète la configuration .env utilisée pour la connexion. Cette page est en lecture seule.
          </p>
        </div>
      </div>

      <ConnectorsClient />
    </div>
  );
}
