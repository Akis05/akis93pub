"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import {
  AlertCircle, Clock, Hourglass, ListOrdered, Loader2, Pause, Play,
  Plug, RefreshCw, RotateCw, Send, Trash, Trash2, Activity,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  listQueueAction, pauseQueueAction, resumeQueueAction,
  retryMessageAction, purgeQueueAction,
} from "@/core/actions/queue";

type Status = "PENDING" | "QUEUED" | "SENDING";
type FilterStatus = Status | "ALL";

interface QueueMessage {
  id: string;
  sourceAddr: string;
  destinationAddr: string;
  content: string;
  status: Status;
  segments: number;
  scheduledAt: string | null;
  createdAt: string;
  connector: { id: string; name: string } | null;
}

interface ConnectorDepth {
  connectorId: string | null;
  connectorName: string;
  connectorStatus: string;
  depth: number;
}

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof Hourglass }> = {
  PENDING: { label: "En attente", color: "bg-gray-500/10 text-gray-700 dark:text-gray-400", icon: Hourglass },
  QUEUED: { label: "Mis en file", color: "bg-violet-500/10 text-violet-700 dark:text-violet-400", icon: ListOrdered },
  SENDING: { label: "Envoi en cours", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: Send },
};

export function QueueClient() {
  const [messages, setMessages] = useState<QueueMessage[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDepth[]>([]);
  const [stats, setStats] = useState({ pending: 0, queued: 0, sending: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [isActing, startAction] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (status: FilterStatus) => {
    setLoading(true);
    const result = await listQueueAction({ status });
    if (result.success) {
      setMessages(result.data as unknown as QueueMessage[]);
      setConnectors(result.connectors);
      if (result.stats) setStats(result.stats);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  function handlePause() {
    startAction(async () => {
      await pauseQueueAction();
      await load(filter);
    });
  }
  function handleResume() {
    startAction(async () => {
      await resumeQueueAction();
      await load(filter);
    });
  }
  function handlePurge() {
    if (!confirm("Purger TOUS les messages en attente ? Cette action est irr\u00e9versible.")) return;
    startAction(async () => {
      await purgeQueueAction();
      await load(filter);
    });
  }
  async function handleRetry(id: string) {
    setRetryingId(id);
    await retryMessageAction(id);
    setRetryingId(null);
    await load(filter);
  }

  const total = stats.pending + stats.queued + stats.sending;
  const hasPaused = stats.pending > 0;

  return (
    <>
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Total dans la file</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Hourglass className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-lg font-bold">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListOrdered className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-lg font-bold">{stats.queued}</p>
              <p className="text-xs text-muted-foreground">Mis en file</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Send className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-lg font-bold">{stats.sending}</p>
              <p className="text-xs text-muted-foreground">Envoi en cours</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar with actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="flex flex-wrap gap-1">
            <Badge variant={filter === "ALL" ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setFilter("ALL")}>Tous</Badge>
            {(Object.keys(STATUS_META) as Status[]).map((s) => (
              <Badge key={s} variant={filter === s ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setFilter(s)}>
                {STATUS_META[s].label}
              </Badge>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => load(filter)} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualiser
            </Button>
            {hasPaused ? (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleResume} disabled={isActing}>
                <Play className="h-3.5 w-3.5" /> Reprendre
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handlePause} disabled={isActing || stats.queued === 0}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-600" onClick={handlePurge} disabled={isActing || total === 0}>
              <Trash className="h-3.5 w-3.5" /> Purger
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Depth per connector */}
      {connectors.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Profondeur par connecteur</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {connectors.map((c) => {
                const isBound = c.connectorStatus === "BOUND";
                return (
                  <div key={c.connectorId ?? "none"} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Plug className={cn("h-4 w-4 shrink-0", isBound ? "text-emerald-500" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.connectorName}</p>
                        <Badge variant="outline" className="text-[9px] mt-0.5">{c.connectorStatus}</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{c.depth}</p>
                      <p className="text-[10px] text-muted-foreground">en file</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages list */}
      {loading && messages.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <ListOrdered className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">File vide.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Statut</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Exp\u00e9diteur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destinataire</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contenu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Connecteur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cr\u00e9\u00e9 le</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => {
                    const meta = STATUS_META[m.status];
                    const Icon = meta.icon;
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <Badge className={cn("text-[9px] border-0 gap-1", meta.color)}>
                            <Icon className="h-2.5 w-2.5" /> {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono">{m.sourceAddr}</td>
                        <td className="px-4 py-2.5 text-sm font-mono">{m.destinationAddr}</td>
                        <td className="px-4 py-2.5 text-sm max-w-xs">
                          <p className="truncate text-muted-foreground">{m.content}</p>
                          <p className="text-[10px] text-muted-foreground">{m.segments} seg</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{m.connector?.name ?? "\u2014"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(m.createdAt).toLocaleTimeString("fr-FR")}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRetry(m.id)} disabled={retryingId === m.id} title="Retry">
                            {retryingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
              <span>{messages.length} message{messages.length !== 1 ? "s" : ""} affich\u00e9{messages.length !== 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help banner */}
      <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <strong>Pause</strong> retire les messages QUEUED de la file (\u2192 PENDING). <strong>Reprendre</strong> les remet en file. <strong>Retry</strong> remet un message en QUEUED. <strong>Purger</strong> annule tous les messages en attente.
        </div>
      </div>
    </>
  );
}
