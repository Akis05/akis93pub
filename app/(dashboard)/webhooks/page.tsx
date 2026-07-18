import { listWebhooksAction } from "@/core/actions/webhooks";
import { WebhooksClient } from "./webhooks-client";
import { Webhook } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const res = await listWebhooksAction();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Webhook className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Endpoints HTTP notifiés en temps réel avec signature HMAC-SHA256 et retry exponentiel.
        </p>
      </div>
      {!res.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{res.error}</div>
      ) : (
        <WebhooksClient initial={res.data.map((w) => ({
          ...w,
          createdAt: w.createdAt.toISOString(),
          lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
          lastSuccessAt: w.lastSuccessAt?.toISOString() ?? null,
          lastFailureAt: w.lastFailureAt?.toISOString() ?? null,
        }))} />
      )}
    </div>
  );
}
