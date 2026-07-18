import { Key } from "lucide-react";
import { listTokensAction } from "@/core/actions/api-keys";
import { ApiKeysClient } from "./api-keys-client";

export const metadata = {
  title: "API Keys — SMS Gateway Pro",
  description: "Gérez vos clés d'API pour l'accès REST.",
};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const tokens = await listTokensAction();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Key className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Créez et gérez vos tokens d'authentification pour l'API REST.
            Utilisez-les avec Postman ou tout client HTTP.
          </p>
        </div>
      </div>

      <ApiKeysClient initialTokens={tokens} />
    </div>
  );
}
