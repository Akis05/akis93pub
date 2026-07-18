"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Input } from "@/core/components/ui/input";
import {
  Clock, Database, Hourglass, Loader2, Plug, RefreshCw, Search, Send, CheckCheck,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { listSmscStoreAction } from "@/core/actions/queue";

interface StoreMessage {
  id: string;
  sourceAddr: string;
  destinationAddr: string;
  content: string;
  segments: number;
  dlrStatus: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  connector: { id: string; name: string } | null;
}

interface ConnectorDepth {
  connectorId: string | null;
  connectorName: string;
  connectorStatus: string;
  depth: number;
}

export function StoreClient() {
  const [messages, setMessages] = useState<StoreMessage[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDepth[]>([]);
  const [stats, setStats] = useState({ total: 0, awaiting: 0, accepted: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const result = await listSmscStoreAction({ search: q });
    if (result.success) {
      setMessages(result.data as unknown as StoreMessage[]);
      setConnectors(result.connectors);
      if (result.stats) setStats(result.stats);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <>
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Dans le store SMSC</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Hourglass className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-lg font-bold">{stats.awaiting}</p>
              <p className="text-xs text-muted-foreground">En attente de DLR</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCheck className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-lg font-bold">{stats.accepted}</p>
              <p className="text-xs text-muted-foreground">Accepté (intermédiaire)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (destinataire, expéditeur, message_id)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => load(search)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualiser
          </Button>
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
                      <p className="text-[10px] text-muted-foreground">en transit</p>
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
            <Database className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Aucun message en attente dans le store SMSC.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">État</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Expéditeur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destinataire</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contenu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Message ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Connecteur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Soumis le</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => {
                    const accepted = m.dlrStatus === "ACCEPTD";
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          {accepted ? (
                            <Badge className="text-[9px] border-0 gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                              <CheckCheck className="h-2.5 w-2.5" /> Accepté
                            </Badge>
                          ) : (
                            <Badge className="text-[9px] border-0 gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                              <Hourglass className="h-2.5 w-2.5" /> En attente DLR
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono">{m.sourceAddr}</td>
                        <td className="px-4 py-2.5 text-sm font-mono">{m.destinationAddr}</td>
                        <td className="px-4 py-2.5 text-sm max-w-xs">
                          <p className="truncate text-muted-foreground">{m.content}</p>
                          <p className="text-[10px] text-muted-foreground">{m.segments} seg</p>
                        </td>
                        <td className="px-4 py-2.5 text-[10px] font-mono text-muted-foreground max-w-[160px]">
                          <span className="truncate block">{m.providerMessageId ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{m.connector?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {m.sentAt ? new Date(m.sentAt).toLocaleString("fr-FR") : new Date(m.createdAt).toLocaleString("fr-FR")}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
              <span>{messages.length} message{messages.length !== 1 ? "s" : ""} affiché{messages.length !== 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help banner */}
      <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        <Send className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Ces messages ont été <strong>acceptés par le SMSC</strong> mais n'ont pas encore reçu de DLR final. Ils quittent le store dès réception de <strong>DELIVRD</strong>, <strong>UNDELIV</strong>, <strong>EXPIRED</strong> ou <strong>REJECTD</strong>.
        </div>
      </div>
    </>
  );
}
