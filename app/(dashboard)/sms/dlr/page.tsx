import { listMessagesAction } from "@/core/actions/messages";
import { DlrClient } from "./dlr-client";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Suivi DLR \u2014 SMS Gateway Pro",
  description: "Suivez les accus\u00e9s de r\u00e9ception (Delivery Reports) de vos SMS.",
};

export default async function DlrPage() {
  const res = await listMessagesAction({ limit: 200 });
  if (!res.ok) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {res.error}
      </div>
    );
  }
  const serialized = res.data.map((m) => ({
    id: m.id,
    direction: m.direction === "OUTBOUND" ? "outbound" : "inbound",
    from: m.sourceAddr,
    to: m.destinationAddr,
    text: m.content,
    status: m.status.toLowerCase(),
    segments: m.segments,
    dlrStatus: m.dlrStatus ?? undefined,
    dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
    sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    providerMessageId: m.providerMessageId ?? undefined,
    errorCode: m.dlrErrorCode ?? undefined,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Suivi DLR</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Accus\u00e9s de r\u00e9ception, taux de livraison et timeline par message.
        </p>
      </div>
      <DlrClient messages={serialized} />
    </div>
  );
}
