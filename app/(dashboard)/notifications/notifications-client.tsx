"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { AlertTriangle, Bell, CheckCircle2, Info, MailOpen, XCircle } from "lucide-react";
import {
  markAllNotificationsReadAction, markNotificationReadAction,
} from "@/core/actions/notifications";

interface Row {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function iconFor(type: string) {
  switch (type) {
    case "WARNING":
    case "CREDITS_LOW":
    case "DLR_ALERT":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "ERROR":
    case "CONNECTOR_DOWN":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "SUCCESS":
    case "CAMPAIGN_COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

export function NotificationsClient({ initial, unread }: { initial: Row[]; unread: number }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();

  const filtered = filter === "unread" ? rows.filter((r) => !r.isRead) : rows;

  function markOne(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isRead: true } : r)));
    });
  }
  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant={filter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilter("all")}>Toutes</Badge>
          <Badge variant={filter === "unread" ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilter("unread")}>
            Non lues ({unread})
          </Badge>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={markAll} disabled={pending || unread === 0}>
          <MailOpen className="h-3.5 w-3.5" /> Tout marquer comme lu
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto h-8 w-8 mb-3 text-muted-foreground/50" />
          Aucune notification.
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          {filtered.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 border-b last:border-0 p-4 ${!n.isRead ? "bg-primary/5" : ""}`}>
              <div className="mt-0.5">{iconFor(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("fr-FR")}</p>
              </div>
              {!n.isRead && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => markOne(n.id)} disabled={pending}>Marquer lu</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
