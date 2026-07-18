"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs";
import { Card, CardContent } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Send, MessageSquare, Clock, Loader2, Plug, Terminal } from "lucide-react";
import { SendSmsSimpleTab } from "./send-sms-simple-tab";
import { BulkSmsForm } from "./bulk-sms-form";
import { ScheduledSmsForm } from "./scheduled-sms-form";
import { getConnectorsForSendAction } from "@/core/actions/connectors";
import Link from "next/link";
import { Button } from "@/core/components/ui/button";

interface DbConnector {
  id: string;
  name: string;
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType: string | null;
  bindMode: string;
  useTls: boolean;
  status: string;
  maxTps: number;
  organizationId: string;
  sourceAddr?: string;
  isEnv?: boolean;
}

function toSmppConnector(c: DbConnector) {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    systemId: c.systemId,
    password: c.password,
    systemType: c.systemType ?? "",
    sourceAddr: c.sourceAddr ?? c.systemId,
    bindMode: c.bindMode.toLowerCase() as "transceiver" | "transmitter" | "receiver",
    useTls: c.useTls,
    status: c.status === "BOUND" ? "bound" as const : c.status === "ERROR" ? "error" as const : "disconnected" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function SmsSendClient() {
  const [connectors, setConnectors] = useState<DbConnector[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getConnectorsForSendAction();
      if (result.success) {
        setConnectors(result.data as unknown as DbConnector[]);
        setDefaultId(result.defaultId ?? null);
      } else {
        console.error("[SMS Send] Erreur:", (result as { error?: string }).error);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (connectors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Plug className="h-8 w-8 text-muted-foreground" /></div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Aucun connecteur SMPP</h3>
            <p className="mt-1 text-sm text-muted-foreground">Configurez SMPP_HOST et SMPP_SYSTEM_ID dans votre fichier .env.</p>
          </div>
          <Link href="/connectors"><Button className="gap-1.5"><Plug className="h-4 w-4" /> Configurer</Button></Link>
        </CardContent>
      </Card>
    );
  }

  const adapted = connectors.map(toSmppConnector);
  if (defaultId) {
    const idx = adapted.findIndex((c) => c.id === defaultId);
    if (idx > 0) { const [def] = adapted.splice(idx, 1); if (def) adapted.unshift(def); }
  }

  const envConnector = connectors.find((c) => c.isEnv) ?? connectors[0];

  return (
    <>
      {/* Connector info banner */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs">
        {envConnector && (
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-violet-600" />
            <span className="text-muted-foreground">.env:</span>
            <span className="font-medium font-mono">{envConnector.systemId}@{envConnector.host}:{envConnector.port}</span>
            <Badge variant="outline" className="text-[9px] bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30">ENV</Badge>
          </div>
        )}
      </div>

      <Tabs defaultValue="simple" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="simple" className="gap-2"><Send className="h-4 w-4" /> SMS simple</TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2"><MessageSquare className="h-4 w-4" /> SMS en masse</TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2"><Clock className="h-4 w-4" /> SMS programmé</TabsTrigger>
        </TabsList>
        <TabsContent value="simple"><SendSmsSimpleTab connectors={adapted} /></TabsContent>
        <TabsContent value="bulk"><BulkSmsForm connectors={adapted} /></TabsContent>
        <TabsContent value="scheduled"><ScheduledSmsForm connectors={adapted} /></TabsContent>
      </Tabs>
    </>
  );
}
