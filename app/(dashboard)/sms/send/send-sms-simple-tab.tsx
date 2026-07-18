"use client";

import { SendSmsForm } from "./send-sms-form";
import { useSmppLiveStatus } from "./use-smpp-live-status";
import { Badge } from "@/core/components/ui/badge";
import { cn } from "@/core/lib/utils";
import { Plug, Loader2 } from "lucide-react";
import type { SmppConnector } from "@/core/types";

interface Props {
  connectors: SmppConnector[];
}

type StateStyle = { dot: string; pulse: boolean; label: string; text: string };

const DISCONNECTED_STYLE: StateStyle = { dot: "bg-gray-400", pulse: false, label: "SMPP D\u00e9connect\u00e9", text: "text-muted-foreground" };

const STATE_STYLE: Record<string, StateStyle> = {
  bound: { dot: "bg-emerald-500", pulse: true, label: "SMPP Connect\u00e9", text: "text-emerald-700 dark:text-emerald-400" },
  binding: { dot: "bg-amber-500", pulse: true, label: "Binding...", text: "text-amber-700 dark:text-amber-400" },
  connecting: { dot: "bg-amber-500", pulse: true, label: "Connexion...", text: "text-amber-700 dark:text-amber-400" },
  unbinding: { dot: "bg-amber-500", pulse: false, label: "D\u00e9connexion...", text: "text-amber-700 dark:text-amber-400" },
  disconnected: DISCONNECTED_STYLE,
  error: { dot: "bg-red-500", pulse: false, label: "SMPP Erreur", text: "text-red-700 dark:text-red-400" },
};

/**
 * Wrapper that passes DB-loaded connectors to the existing SendSmsForm and
 * displays the live SMPP connection state (same source of truth as the
 * header indicator: /api/smpp/status).
 */
export function SendSmsSimpleTab({ connectors }: Props) {
  const status = useSmppLiveStatus();
  const style = STATE_STYLE[status.state] ?? DISCONNECTED_STYLE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-xs">
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="relative flex h-2.5 w-2.5">
          {style.pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                style.dot,
              )}
            />
          )}
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", style.dot)} />
        </div>
        <span className={cn("font-medium", style.text)}>{style.label}</span>
        {status.host && (
          <span className="font-mono text-muted-foreground">
            {status.host}:{status.port}
          </span>
        )}
        {status.count > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono tabular-nums">
            {status.boundCount}/{status.count} sessions
          </Badge>
        )}
        {status.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-[10px] text-muted-foreground">
          Synchronis\u00e9 avec l'indicateur de l'en-t\u00eate
        </span>
      </div>

      <SendSmsForm connectors={connectors} />
    </div>
  );
}
