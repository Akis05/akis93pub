"use client";

import { Bell, Search, Moon, Sun, Plug, LogOut, Power, PowerOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Badge } from "@/core/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/core/components/ui/tooltip";
import { useState, useEffect } from "react";
import { cn } from "@/core/lib/utils";
import { useSmppStatusStore, type SmppState } from "@/core/lib/smpp/smpp-status-store";
import { useShallow } from "zustand/react/shallow";

// Reads the shared Zustand SMPP status store (single app-wide polling
// interval, see core/lib/smpp/smpp-status-store.ts) instead of running its
// own setInterval — avoids duplicate /api/smpp/status polling alongside the
// send-page hooks.
function useSmppStatus() {
  const subscribe = useSmppStatusStore((s) => s.subscribe);
  const fetchStatus = useSmppStatusStore((s) => s.fetchStatus);
  const status = useSmppStatusStore(
    useShallow((s) => ({
      state: s.state,
      connected: s.connected,
      host: s.host,
      port: s.port,
      systemId: s.systemId,
      bindMode: s.bindMode,
      sourceAddr: s.sourceAddr,
      sessions: s.sessions,
      count: s.count,
      boundCount: s.boundCount,
    }))
  );

  useEffect(() => subscribe(), [subscribe]);

  return { status, refresh: fetchStatus };
}

function SmppIndicator() {
  const { status, refresh } = useSmppStatus();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const stateConfig: Record<SmppState, { color: string; pulse: boolean; label: string }> = {
    bound: { color: "bg-emerald-500", pulse: true, label: "Connect\u00e9" },
    binding: { color: "bg-amber-500", pulse: true, label: "Binding..." },
    connecting: { color: "bg-amber-500", pulse: true, label: "Connexion..." },
    unbinding: { color: "bg-amber-500", pulse: false, label: "D\u00e9connexion..." },
    disconnected: { color: "bg-gray-400", pulse: false, label: "D\u00e9connect\u00e9" },
    error: { color: "bg-red-500", pulse: false, label: "Erreur" },
  };

  const config = stateConfig[status.state] ?? stateConfig.disconnected;

  async function handleAction(action: "connect" | "disconnect" | "restart") {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/smpp/${action}`, { method: "POST" });
      const data = await res.json();
      console.log(`[SMPP Header] ${action}:`, data);
      await refresh();
    } catch (err) {
      console.error(`[SMPP Header] ${action} failed:`, err);
    }
    setActionLoading(null);
  }

  async function handleDisconnectOne(key: string) {
    setActionLoading(`disconnect:${key}`);
    try {
      const res = await fetch(`/api/smpp/disconnect/${encodeURIComponent(key)}`, { method: "POST" });
      const data = await res.json();
      console.log(`[SMPP Header] disconnect ${key}:`, data);
      await refresh();
    } catch (err) {
      console.error(`[SMPP Header] disconnect ${key} failed:`, err);
    }
    setActionLoading(null);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 hover:bg-muted/50 transition-colors"
      >
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="relative flex h-2.5 w-2.5">
          {config.pulse && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", config.color)} />
          )}
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", config.color)} />
        </div>
        <span className="hidden text-xs font-medium sm:inline">SMPP</span>
        {status.count > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono tabular-nums">
            {status.boundCount}/{status.count}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-card p-3 shadow-lg">
          <div className="space-y-3">
            {/* Status info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative flex h-3 w-3">
                  {config.pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", config.color)} />}
                  <span className={cn("relative inline-flex h-3 w-3 rounded-full", config.color)} />
                </div>
                <span className="text-sm font-medium">{config.label}</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">{status.state}</Badge>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">Sessions ouvertes</span>
              <span className="font-mono font-medium tabular-nums">
                {status.boundCount} bound / {status.count} total
              </span>
            </div>

            {status.host && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Serveur</span>
                  <span className="font-mono">{status.host}:{status.port}</span>
                </div>
                {status.systemId && (
                  <div className="flex justify-between">
                    <span>System ID</span>
                    <span className="font-mono">{status.systemId}</span>
                  </div>
                )}
                {status.bindMode && (
                  <div className="flex justify-between">
                    <span>Mode</span>
                    <span className="capitalize">{status.bindMode}</span>
                  </div>
                )}
              </div>
            )}

            {/* Per-session list with targeted disconnect */}
            {status.sessions.length > 0 && (
              <div className="space-y-1 border-t pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sessions actives
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {status.sessions.map((s) => {
                    const sc = stateConfig[s.state] ?? stateConfig.disconnected;
                    const busy = actionLoading === `disconnect:${s.key}`;
                    return (
                      <div key={s.key} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1 text-xs">
                        <span className={cn("inline-flex h-2 w-2 rounded-full flex-shrink-0", sc.color)} />
                        <span className="font-mono truncate flex-1" title={`${s.systemId}@${s.host}:${s.port}`}>
                          {s.systemId}@{s.host}:{s.port}
                        </span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">{s.state}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => handleDisconnectOne(s.key)}
                          disabled={!!actionLoading}
                          title={`Fermer la session ${s.key}`}
                        >
                          {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Global action buttons */}
            <div className="flex gap-1.5 pt-1 border-t">
              {status.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 h-8 text-xs"
                  onClick={() => handleAction("disconnect")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "disconnect" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3 w-3" />}
                  D\u00e9connecter
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 h-8 text-xs"
                  onClick={() => handleAction("connect")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "connect" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                  Connecter
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => handleAction("restart")}
                disabled={!!actionLoading}
              >
                {actionLoading === "restart" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Restart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {expanded && <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />}
    </div>
  );
}

export function Header() {
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  const handleLogout = async () => {
    try {
      const { logoutAction } = await import("@/core/actions/auth");
      await logoutAction();
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher messages, contacts, campagnes..." className="w-[320px] pl-9 lg:w-[400px]" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SmppIndicator />
        <Button variant="ghost" size="icon" className="relative" onClick={toggleTheme}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">3</span>
        </Button>
        <div className="ml-2 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">A</div>
          <div className="hidden flex-col md:flex">
            <span className="text-sm font-medium">Admin</span>
            <span className="text-xs text-muted-foreground">admin@gateway.pro</span>
          </div>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>D\u00e9connexion</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
}
