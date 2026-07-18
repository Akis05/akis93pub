"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Progress } from "@/core/components/ui/progress";
import {
  Send, CheckCircle2, Plug, Megaphone, TrendingUp,
  ArrowUpRight, ArrowDownRight, Activity, DollarSign,
  ListOrdered, BarChart3, ScrollText, Wifi, WifiOff,
  Clock, AlertTriangle, Zap, Signal,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";

interface Kpis {
  sent24h: number;
  sent7d: number;
  sent30d: number;
  change24h: number;
  change7d: number;
  change30d: number;
  deliveryRate: number;
  cost30d: number;
  creditsBalance: number;
  creditsAlertThreshold: number;
  queueDepth: number;
  activeConnectors: number;
}

interface VolumePoint { date: string; sent: number; delivered: number; failed: number; }
interface DlrEntry { status: string; count: number; }
interface CampaignRow {
  id: string; name: string; status: string;
  totalRecipients: number; sentCount: number; deliveredCount: number; failedCount: number;
  deliveryRate: number;
}
interface AuditRow {
  id: string; action: string; entity: string; entityId: string | null;
  userEmail: string | null; createdAt: string;
}
interface ConnectorRow {
  id: string; name: string; host: string; port: number; status: string;
  lastConnectedAt: string | null; lastDisconnectedAt: string | null;
}

interface Props {
  kpis: Kpis | null;
  volume: VolumePoint[];
  dlr: DlrEntry[];
  campaigns: CampaignRow[];
  audit: AuditRow[];
  connectors: ConnectorRow[];
}

const DLR_COLORS: Record<string, string> = {
  DELIVERED: "#10b981",
  SENT: "#3b82f6",
  PENDING: "#f59e0b",
  QUEUED: "#a855f7",
  SENDING: "#0ea5e9",
  FAILED: "#ef4444",
  EXPIRED: "#6b7280",
  REJECTED: "#f43f5e",
  CANCELLED: "#9ca3af",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; darkBg: string }> = {
  DELIVERED: { label: "Livré", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100", darkBg: "dark:bg-emerald-900/40" },
  SENT: { label: "Envoyé", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100", darkBg: "dark:bg-blue-900/40" },
  PENDING: { label: "En attente", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100", darkBg: "dark:bg-amber-900/40" },
  QUEUED: { label: "File d'attente", color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-100", darkBg: "dark:bg-violet-900/40" },
  SENDING: { label: "En cours", color: "text-sky-700 dark:text-sky-400", bg: "bg-sky-100", darkBg: "dark:bg-sky-900/40" },
  FAILED: { label: "Échoué", color: "text-red-700 dark:text-red-400", bg: "bg-red-100", darkBg: "dark:bg-red-900/40" },
  EXPIRED: { label: "Expiré", color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100", darkBg: "dark:bg-gray-800/40" },
  REJECTED: { label: "Rejeté", color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-100", darkBg: "dark:bg-rose-900/40" },
  CANCELLED: { label: "Annulé", color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100", darkBg: "dark:bg-gray-800/40" },
};

function fmtNum(n: number): string { return n.toLocaleString("fr-FR"); }
function fmtDjf(n: number): string { return `${fmtNum(Math.round(n))} DJF`; }

function Change({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value}%
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const config = STATUS_CONFIG[s] ?? { label: status, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100", darkBg: "dark:bg-gray-800/40" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.color} ${config.bg} ${config.darkBg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s === "DELIVERED" || s === "BOUND" || s === "RUNNING" || s === "COMPLETED" ? "bg-emerald-500" : s === "FAILED" || s === "REJECTED" || s === "ERROR" ? "bg-red-500" : s === "PENDING" || s === "QUEUED" || s === "BINDING" ? "bg-amber-500" : "bg-gray-400"}`} />
      {config.label}
    </span>
  );
}

function ConnectorStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const isBound = s === "BOUND";
  const isError = s === "ERROR" || s === "DISCONNECTED";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${isBound ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : isError ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
      {isBound ? <Wifi className="h-3.5 w-3.5" /> : isError ? <WifiOff className="h-3.5 w-3.5" /> : <Signal className="h-3.5 w-3.5" />}
      {s === "BOUND" ? "Connecté" : s === "BINDING" ? "Connexion..." : s === "DISCONNECTED" ? "Déconnecté" : status.toLowerCase()}
    </span>
  );
}

function AuditIcon({ action }: { action: string }) {
  const a = action.toUpperCase();
  if (a.includes("CREATE") || a.includes("SEND")) return <Send className="h-3.5 w-3.5" />;
  if (a.includes("DELETE") || a.includes("REMOVE")) return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

function auditColor(action: string) {
  const a = action.toUpperCase();
  if (a.includes("CREATE") || a.includes("SEND")) return "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
  if (a.includes("DELETE") || a.includes("REMOVE")) return "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400";
  if (a.includes("UPDATE") || a.includes("EDIT")) return "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
  return "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400";
}

export function DashboardClient({ kpis, volume, dlr, campaigns, audit, connectors }: Props) {
  const k = kpis ?? {
    sent24h: 0, sent7d: 0, sent30d: 0,
    change24h: 0, change7d: 0, change30d: 0,
    deliveryRate: 0, cost30d: 0, creditsBalance: 0, creditsAlertThreshold: 0,
    queueDepth: 0, activeConnectors: 0,
  };

  const dlrChart = dlr.map((d) => ({ status: d.status, count: d.count, fill: DLR_COLORS[d.status] ?? "#94a3b8" }));
  const totalDlr = dlr.reduce((sum, d) => sum + d.count, 0);

  const creditsLow = k.creditsAlertThreshold > 0 && k.creditsBalance <= k.creditsAlertThreshold;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble en temps réel de votre passerelle SMS</p>
        </div>
        <div className="flex items-center gap-2">
          {connectors.length > 0 && connectors[0] && (
            <ConnectorStatusBadge status={connectors[0].status} />
          )}
        </div>
      </div>

      {/* KPI Cards - 4 colored cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* SMS Sent 24h */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30 dark:shadow-blue-900/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="border-0 bg-white/20 text-[11px] text-white backdrop-blur-sm hover:bg-white/30">24h</Badge>
              <div className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                {k.change24h >= 0 ? "+" : ""}{k.change24h}%
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner ring-4 ring-white/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <div className="relative inline-block">
                  <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-white/25 blur-xl" />
                  <p className="text-3xl font-bold leading-none">{fmtNum(k.sent24h)}</p>
                </div>
                <p className="mt-1.5 text-sm text-blue-100">SMS envoyés (24h)</p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
          </CardContent>
        </Card>

        {/* Delivery Rate */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 dark:shadow-emerald-900/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="border-0 bg-white/20 text-[11px] text-white backdrop-blur-sm hover:bg-white/30">30j</Badge>
              <CheckCircle2 className="h-4 w-4 text-emerald-100" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110"
                style={{ background: `conic-gradient(white ${Math.min(100, Math.max(0, k.deliveryRate)) * 3.6}deg, rgba(255,255,255,0.2) 0deg)` }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600">
                  <span className="text-[13px] font-bold">{k.deliveryRate}%</span>
                </div>
              </div>
              <div>
                <div className="relative inline-block">
                  <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-white/25 blur-xl" />
                  <p className="text-3xl font-bold leading-none">{k.deliveryRate}%</p>
                </div>
                <p className="mt-1.5 text-sm text-emerald-100">Taux de livraison</p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
          </CardContent>
        </Card>

        {/* Cost / Credits */}
        <Card className={`group relative overflow-hidden border-0 text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${creditsLow ? "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/20 hover:shadow-red-500/30 dark:shadow-red-900/30" : "bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20 hover:shadow-violet-500/30 dark:shadow-violet-900/30"}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="border-0 bg-white/20 text-[11px] text-white backdrop-blur-sm hover:bg-white/30">30j</Badge>
              <div className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                {k.change30d >= 0 ? "+" : ""}{k.change30d}%
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner ring-4 ring-white/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                {creditsLow ? <AlertTriangle className="h-6 w-6" /> : <DollarSign className="h-6 w-6" />}
              </div>
              <div>
                <div className="relative inline-block">
                  <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-white/25 blur-xl" />
                  <p className="text-3xl font-bold leading-none">{fmtDjf(k.cost30d)}</p>
                </div>
                <p className={`mt-1.5 text-sm ${creditsLow ? "text-red-100" : "text-violet-100"}`}>
                  Solde: {fmtDjf(k.creditsBalance)}
                </p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
          </CardContent>
        </Card>

        {/* Queue */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/30 dark:shadow-amber-900/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                <Zap className="h-3 w-3" /> {k.activeConnectors} actif
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner ring-4 ring-white/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                <ListOrdered className="h-6 w-6" />
              </div>
              <div>
                <div className="relative inline-block">
                  <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-white/25 blur-xl" />
                  <p className="text-3xl font-bold leading-none">{fmtNum(k.queueDepth)}</p>
                </div>
                <p className="mt-1.5 text-sm text-amber-100">File d'attente</p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
          </CardContent>
        </Card>
      </div>

      {/* Volume Summary - 3 period cards */}
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
              <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            Volume par période
          </CardTitle>
          <CardDescription>SMS envoyés sur les dernières périodes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "24 heures", value: k.sent24h, change: k.change24h, icon: Clock, color: "blue" },
              { label: "7 jours", value: k.sent7d, change: k.change7d, icon: TrendingUp, color: "emerald" },
              { label: "30 jours", value: k.sent30d, change: k.change30d, icon: BarChart3, color: "violet" },
            ].map((p) => (
              <div key={p.label} className={`rounded-xl border-2 p-4 transition-all hover:shadow-sm ${p.color === "blue" ? "border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20" : p.color === "emerald" ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20" : "border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">{p.label}</p>
                  <Change value={p.change} />
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${p.color === "blue" ? "bg-blue-500" : p.color === "emerald" ? "bg-emerald-500" : "bg-violet-500"}`}>
                    <p.icon className="h-4 w-4" />
                  </div>
                  <div className="relative inline-block">
                    <span className={`absolute inset-0 -z-10 scale-150 rounded-full blur-lg ${p.color === "blue" ? "bg-blue-200 dark:bg-blue-900/40" : p.color === "emerald" ? "bg-emerald-200 dark:bg-emerald-900/40" : "bg-violet-200 dark:bg-violet-900/40"}`} />
                    <p className="text-2xl font-bold">{fmtNum(p.value)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Area Chart - Volume */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Volume temporel (7 jours)
            </CardTitle>
            <CardDescription>Envois, livraisons et échecs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volume} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", fontSize: "12px" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Area type="monotone" dataKey="sent" name="Envoyés" stroke="#3b82f6" fill="url(#gradSent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="delivered" name="Livrés" stroke="#10b981" fill="url(#gradDelivered)" strokeWidth={2} />
                  <Area type="monotone" dataKey="failed" name="Échoués" stroke="#ef4444" fill="url(#gradFailed)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* DLR Breakdown - Pie + Bar combo */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              Répartition par statut (30j)
            </CardTitle>
            <CardDescription>{fmtNum(totalDlr)} messages au total</CardDescription>
          </CardHeader>
          <CardContent>
            {dlrChart.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée disponible.</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dlrChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", fontSize: "12px" }}
                    />
                    <Bar dataKey="count" name="Messages" radius={[6, 6, 0, 0]}>
                      {dlrChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Status Legend */}
            {dlrChart.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {dlrChart.map((d) => {
                  const cfg = STATUS_CONFIG[d.status];
                  return (
                    <span key={d.status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cfg?.bg ?? "bg-gray-100"} ${cfg?.darkBg ?? "dark:bg-gray-800/40"} ${cfg?.color ?? "text-gray-600"}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                      {cfg?.label ?? d.status} ({fmtNum(d.count)})
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaigns + Connectors */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Campaigns */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                <Megaphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              Top 5 campagnes
            </CardTitle>
            <CardDescription>Campagnes les plus actives par volume</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Megaphone className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">Aucune campagne</p>
                <p className="text-xs text-muted-foreground">Les campagnes actives apparaîtront ici</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c, i) => {
                  const progress = c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;
                  return (
                    <div key={c.id} className="rounded-xl border p-3.5 transition-colors hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : i === 1 ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" : i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" : "bg-muted text-muted-foreground"}`}>
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{fmtNum(c.deliveredCount)}/{fmtNum(c.sentCount)} livrés</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={c.status} />
                          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${c.deliveryRate >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : c.deliveryRate >= 70 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
                            {c.deliveryRate}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <Progress value={progress} className="h-1.5 bg-muted" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SMPP Connectors */}
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900/40">
                <Plug className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              Connecteurs SMPP
            </CardTitle>
            <CardDescription>État des connexions au SMSC</CardDescription>
          </CardHeader>
          <CardContent>
            {connectors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Plug className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">Aucun connecteur</p>
                <p className="text-xs text-muted-foreground">Configurez vos variables SMPP dans .env</p>
              </div>
            ) : (
              <div className="space-y-3">
                {connectors.map((c) => {
                  const isBound = c.status.toUpperCase() === "BOUND";
                  return (
                    <div key={c.id} className={`rounded-xl border-2 p-4 transition-all hover:shadow-sm ${isBound ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/30 dark:bg-emerald-950/10" : "border-red-200 bg-red-50/30 dark:border-red-800/30 dark:bg-red-950/10"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm ${isBound ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-400"}`}>
                            {isBound ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-semibold">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.host}:{c.port}</p>
                          </div>
                        </div>
                        <ConnectorStatusBadge status={c.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit Log */}
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800/60">
              <ScrollText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            Activité récente
          </CardTitle>
          <CardDescription>Journal d'audit (dernières actions)</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Activity className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">Aucune activité</p>
              <p className="text-xs text-muted-foreground">Les actions récentes apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${auditColor(a.action)}`}>
                      <AuditIcon action={a.action} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{a.action} {a.entity}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.userEmail ?? "—"}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
