"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/core/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Check, Clock, Loader2, Radio, Send, XCircle } from "lucide-react";

type Status = "PENDING" | "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "EXPIRED" | "REJECTED" | "CANCELLED";

interface MsgRow {
  id: string;
  status: Status;
  dlr_status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  dlr_received_at: string | null;
  cost: string | null;
}

interface Props {
  messageId: string;
  initialStatus?: Status;
}

const STEPS: { key: Status; label: string }[] = [
  { key: "QUEUED", label: "En file" },
  { key: "SENDING", label: "Envoi" },
  { key: "SENT", label: "Envoyé" },
  { key: "DELIVERED", label: "Livré" },
];

function stepIndex(status: Status): number {
  switch (status) {
    case "QUEUED":
    case "PENDING":
      return 0;
    case "SENDING":
      return 1;
    case "SENT":
      return 2;
    case "DELIVERED":
      return 3;
    default:
      return -1;
  }
}

export function SmsLiveStatus({ messageId, initialStatus = "QUEUED" }: Props) {
  const [row, setRow] = useState<MsgRow | null>({
    id: messageId,
    status: initialStatus,
    dlr_status: null,
    sent_at: null,
    delivered_at: null,
    dlr_received_at: null,
    cost: null,
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`sms:${messageId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "SmsMessage", filter: `id=eq.${messageId}` },
        (payload) => {
          setRow(payload.new as unknown as MsgRow);
        }
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => { void supabase.removeChannel(channel); };
  }, [messageId]);

  const idx = row ? stepIndex(row.status) : 0;
  const failed = row && ["FAILED", "EXPIRED", "REJECTED", "CANCELLED"].includes(row.status);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Radio className={`h-4 w-4 ${connected ? "text-emerald-500" : "text-muted-foreground"}`} />
          Suivi en direct
          <Badge variant="outline" className="text-[10px] font-mono">{row?.status ?? "\u2014"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = idx >= i;
            const current = idx === i && !failed;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    failed && i === idx
                      ? "border-red-500 bg-red-50 text-red-600"
                      : done
                      ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                      : current
                      ? "border-amber-500 bg-amber-50 text-amber-600"
                      : "border-muted bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {failed && i === idx ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : current ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : i === 0 ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </div>
                <span className={`text-xs font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-emerald-300" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>

        {(row?.sent_at || row?.delivered_at || row?.dlr_received_at) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {row.sent_at && (
              <div><p className="text-muted-foreground">Envoyé</p><p className="font-mono">{new Date(row.sent_at).toLocaleString("fr-FR")}</p></div>
            )}
            {row.delivered_at && (
              <div><p className="text-muted-foreground">Livré</p><p className="font-mono">{new Date(row.delivered_at).toLocaleString("fr-FR")}</p></div>
            )}
            {row.dlr_received_at && (
              <div><p className="text-muted-foreground">DLR</p><p className="font-mono">{new Date(row.dlr_received_at).toLocaleString("fr-FR")} • {row.dlr_status}</p></div>
            )}
            {row.cost && (
              <div><p className="text-muted-foreground">Coût</p><p className="font-mono">{row.cost} DJF</p></div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
