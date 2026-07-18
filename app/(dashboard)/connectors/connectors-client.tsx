"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import {
  AlertCircle, CheckCircle2, Loader2, Plug, Wifi, WifiOff,
  Zap, Clock, Shield, Server,
  Play, Square, RefreshCw, Activity,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { listConnectorsAction, testConnectorAction } from "@/core/actions/connectors";

interface Connector {
  id: string;
  name: string;
  host: string;
  port: number;
  systemId: string;
  systemType: string | null;
  bindMode: string;
  useTls: boolean;
  enquireLinkInterval: number;
  reconnectDelay: number;
  maxTps: number;
  windowSize: number;
  sourceAddr: string;
  status: string;
}

interface TestResult {
  success: boolean;
  status: "bound" | "error" | "timeout";
  latencyMs: number;
  error?: string;
}

function statusVariant(status: string) {
  switch (status) {
    case "BOUND": return { label: "Connecté", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" };
    case "BINDING": case "CONNECTING": return { label: status, color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", dot: "bg-amber-500" };
    case "ERROR": return { label: "Erreur", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", dot: "bg-red-500" };
    default: return { label: "Déconnecté", color: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30", dot: "bg-gray-400" };
  }
}

export function ConnectorsClient() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);

  async function loadConnectors() {
    setLoading(true);
    const result = await listConnectorsAction();
    if (result.success) setConnectors(result.data as unknown as Connector[]);
    setLoading(false);
  }

  useEffect(() => {
    loadConnectors();
    const id = setInterval(loadConnectors, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleTest(connectorId: string) {
    setTestingId(connectorId);
    setTestResults((prev) => { const next = { ...prev }; delete next[connectorId]; return next; });
    const result = await testConnectorAction(connectorId);
    setTestResults((prev) => ({ ...prev, [connectorId]: result }));
    setTestingId(null);
    await loadConnectors();
  }

  async function handleSmppAction(connectorId: string, action: "connect" | "disconnect" | "restart") {
    setActionId(connectorId);
    setActionType(action);
    try {
      const res = await fetch(`/api/smpp/${action}`, { method: "POST" });
      const data = await res.json();
      console.log(`[Connectors] SMPP ${action}:`, data);
      await loadConnectors();
    } catch (err) {
      console.error(`[Connectors] SMPP ${action} failed:`, err);
    }
    setActionId(null);
    setActionType(null);
  }

  async function handleSmppStatus(connectorId: string) {
    setActionId(connectorId);
    setActionType("status");
    try {
      const res = await fetch("/api/smpp/status");
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [connectorId]: {
          success: data.connected,
          status: data.connected ? "bound" : "error",
          latencyMs: 0,
          error: data.connected ? undefined : `État: ${data.state}`,
        },
      }));
    } catch {}
    setActionId(null);
    setActionType(null);
  }

  const isActionLoading = (id: string, type: string) => actionId === id && actionType === type;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Connecteur configuré via .env (lecture seule)
        </p>
      </div>

      {loading && connectors.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : connectors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Plug className="h-8 w-8 text-muted-foreground" /></div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">Aucune configuration SMPP</h3>
              <p className="mt-1 text-sm text-muted-foreground">Définissez SMPP_HOST et SMPP_SYSTEM_ID dans votre fichier .env.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {connectors.map((c) => {
            const sv = statusVariant(c.status);
            const test = testResults[c.id];
            const isTesting = testingId === c.id;

            return (
              <Card key={c.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                        c.status === "BOUND" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                      )}>
                        <Plug className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold truncate">{c.name}</h3>
                          <Badge variant="outline" className={cn("text-[10px] gap-1", sv.color)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", sv.dot)} />
                            {sv.label}
                          </Badge>
                          <Badge variant="secondary" className="text-[9px] h-4">.env</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono"><Server className="h-3 w-3" />{c.host}:{c.port}</span>
                          <span className="flex items-center gap-1"><Shield className="h-3 w-3" />{c.systemId}</span>
                          <span className="capitalize">{c.bindMode.toLowerCase()}</span>
                          {c.useTls && <Badge variant="secondary" className="text-[9px] h-4">TLS</Badge>}
                          <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{c.maxTps} TPS</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Heartbeat {c.enquireLinkInterval / 1000}s</span>
                          <span className="font-mono">source: {c.sourceAddr}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950" onClick={() => handleSmppAction(c.id, "connect")} disabled={!!actionId}>
                        {isActionLoading(c.id, "connect") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Start
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => handleSmppAction(c.id, "disconnect")} disabled={!!actionId}>
                        {isActionLoading(c.id, "disconnect") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />} Stop
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => handleSmppAction(c.id, "restart")} disabled={!!actionId}>
                        {isActionLoading(c.id, "restart") ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Restart
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => handleSmppStatus(c.id)} disabled={!!actionId}>
                        {isActionLoading(c.id, "status") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />} Status
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => handleTest(c.id)} disabled={isTesting}>
                        {isTesting ? <><Loader2 className="h-3 w-3 animate-spin" /> Test...</> : <><Wifi className="h-3 w-3" /> Tester</>}
                      </Button>
                    </div>
                  </div>

                  {test && (
                    <div className={cn("mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs", test.success ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400")}>
                      {test.success ? <><CheckCircle2 className="h-4 w-4" /> Connexion réussie (bound) {test.latencyMs > 0 ? `— ${test.latencyMs}ms` : ""}</> : <><WifiOff className="h-4 w-4" /> {test.error ?? "Échec"} {test.latencyMs > 0 ? `— ${test.latencyMs}ms` : ""}</>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Pour modifier le connecteur, éditez les variables <strong>SMPP_*</strong> dans le fichier <strong>.env</strong> puis redémarrez l'application. <strong>Start / Stop / Restart</strong> pilotent la session SMPP en cours.
        </div>
      </div>
    </>
  );
}
