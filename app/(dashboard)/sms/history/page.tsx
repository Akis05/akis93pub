import { listMessagesAction, getMessageStatusCountsAction } from "@/core/actions/messages";
import { SmsHistoryClient } from "./sms-history-client";
import { History } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Historique SMS \u2014 SMS Gateway Pro",
  description: "Historique complet de vos SMS envoy\u00e9s et re\u00e7us (Prisma).",
};

export default async function SmsHistoryPage() {
  const [list, counts] = await Promise.all([
    listMessagesAction({ limit: 100 }),
    getMessageStatusCountsAction(),
  ]);

  if (!list.ok) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {list.error}
      </div>
    );
  }

  const serialized = list.data.map((m) => ({
    id: m.id,
    connectorId: m.providerId ?? "",
    campaignId: m.campaignId ?? undefined,
    direction: m.direction === "OUTBOUND" ? "outbound" : "inbound",
    from: m.sourceAddr,
    to: m.destinationAddr,
    text: m.content,
    status: m.status.toLowerCase(),
    segments: m.segments,
    providerMessageId: m.providerMessageId ?? undefined,
    errorCode: m.dlrErrorCode ?? undefined,
    dlrStatus: m.dlrStatus ?? undefined,
    dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
    sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    connectorName: m.provider?.name ?? null,
    campaignName: m.campaign?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <History className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Historique SMS</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Consultez, filtrez et exportez l'historique complet de vos messages SMS.
          </p>
        </div>
      </div>

      <SmsHistoryClient messages={serialized} nextCursor={list.nextCursor ?? null} statusCounts={counts.ok ? counts.counts : {}} />
    </div>
  );
}
