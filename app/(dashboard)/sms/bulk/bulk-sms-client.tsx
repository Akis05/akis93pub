"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Loader2, Plug } from "lucide-react";
import Link from "next/link";
import { BulkSmsForm } from "../send/bulk-sms-form";
import { getConnectorsForSendAction } from "@/core/actions/connectors";

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
    status:
      c.status === "BOUND"
        ? ("bound" as const)
        : c.status === "ERROR"
          ? ("error" as const)
          : ("disconnected" as const),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function BulkSmsClient() {
  const [connectors, setConnectors] = useState<DbConnector[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getConnectorsForSendAction();
      if (result.success) {
        setConnectors(result.data as unknown as DbConnector[]);
        setDefaultId(result.defaultId ?? null);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connectors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Plug className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Aucun connecteur SMPP</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configurez SMPP_HOST dans .env ou enregistrez un connecteur sur /connectors.
            </p>
          </div>
          <Link href="/connectors">
            <Button className="gap-1.5">
              <Plug className="h-4 w-4" /> Configurer
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const adapted = connectors.map(toSmppConnector);
  if (defaultId) {
    const idx = adapted.findIndex((c) => c.id === defaultId);
    if (idx > 0) {
      const [def] = adapted.splice(idx, 1);
      if (def) adapted.unshift(def);
    }
  }

  return <BulkSmsForm connectors={adapted} />;
}
