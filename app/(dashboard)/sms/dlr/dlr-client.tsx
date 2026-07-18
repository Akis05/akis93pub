"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Separator } from "@/core/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/core/components/ui/dialog";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, HelpCircle,
  Search, MessageSquare, TrendingUp, Globe, Building2, Hourglass,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

interface Msg {
  id: string;
  direction: string;
  from: string;
  to: string;
  text: string;
  status: string;
  segments: number;
  dlrStatus?: string;
  dlrReceivedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  providerMessageId?: string;
  errorCode?: string;
}

interface Props { messages: Msg[]; }

const DLR_STATUSES = [
  { key: "DELIVRD", label: "Livr\u00e9", icon: CheckCircle2, color: "#10b981", bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { key: "ACCEPTD", label: "Accept\u00e9", icon: Clock, color: "#3b82f6", bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  { key: "UNDELIV", label: "Non livr\u00e9", icon: XCircle, color: "#ef4444", bg: "bg-red-500/10 text-red-700 dark:text-red-400" },
  { key: "REJECTD", label: "Rejet\u00e9", icon: AlertTriangle, color: "#f43f5e", bg: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  { key: "EXPIRED", label: "Expir\u00e9", icon: Clock, color: "#6b7280", bg: "bg-gray-500/10 text-gray-700 dark:text-gray-400" },
  { key: "UNKNOWN", label: "Inconnu", icon: HelpCircle, color: "#a855f7", bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

// Simulate operator/country from phone prefix
function getOperatorInfo(phone: string): { operator: string; country: string } {
  if (phone.startsWith("+253")) return { operator: "Djibouti Telecom", country: "DJ" };
  if (phone.startsWith("+33")) return { operator: "Orange FR", country: "FR" };
  if (phone.startsWith("+251")) return { operator: "Ethio Telecom", country: "ET" };
  if (phone.startsWith("+254")) return { operator: "Safaricom", country: "KE" };
  if (phone.startsWith("+1")) return { operator: "AT&T", country: "US" };
  return { operator: "Autre", country: "??" };
}

export function DlrClient({ messages }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<Msg | null>(null);

  const outbound = useMemo(() => messages.filter((m) => m.direction === "outbound"), [messages]);

  // DLR counts
  const dlrCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    DLR_STATUSES.forEach((s) => { counts[s.key] = 0; });
    let noDlr = 0;
    outbound.forEach((m) => {
      const current = m.dlrStatus ? counts[m.dlrStatus] : undefined;
      if (m.dlrStatus && current !== undefined) counts[m.dlrStatus] = current + 1;
      else noDlr++;
    });
    return { ...counts, NO_DLR: noDlr };
  }, [outbound]);

  // Messages sent but still awaiting a delivery receipt (no dlrStatus yet).
  // Common when the recipient is temporarily unreachable (airplane mode): the
  // operator network keeps the SMS in store and sends the DLR later.
  const pendingDlr = dlrCounts.NO_DLR ?? 0;

  // Pie chart data
  const pieData = useMemo(() =>
    DLR_STATUSES.map((s) => ({ name: s.label, value: dlrCounts[s.key] ?? 0, color: s.color })).filter((d) => d.value > 0),
  [dlrCounts]);

  // Delivery rate by operator/country
  const operatorStats = useMemo(() => {
    const map = new Map<string, { operator: string; country: string; total: number; delivered: number }>();
    outbound.forEach((m) => {
      const info = getOperatorInfo(m.to);
      const key = info.operator;
      const existing = map.get(key) ?? { ...info, total: 0, delivered: 0 };
      existing.total++;
      if (m.dlrStatus === "DELIVRD" || m.status === "delivered") existing.delivered++;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [outbound]);

  // Filtered messages
  const filtered = useMemo(() => {
    let data = outbound;
    if (filter) data = data.filter((m) => m.dlrStatus === filter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((m) => m.to.includes(q) || m.from.toLowerCase().includes(q) || m.text.toLowerCase().includes(q));
    }
    return data.slice(0, 100);
  }, [outbound, filter, search]);

  const totalWithDlr = outbound.filter((m) => m.dlrStatus).length;
  const deliveredCount = dlrCounts["DELIVRD"] ?? 0;
  const deliveryRate = totalWithDlr > 0 ? ((deliveredCount / totalWithDlr) * 100).toFixed(1) : "0.0";

  return (
    <>
      {/* DLR Status Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Hourglass className="h-4 w-4" />
              </div>
              <span className="text-2xl font-bold">{pendingDlr}</span>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">En attente</p>
            <p className="text-[10px] font-mono text-muted-foreground">NO_DLR</p>
          </CardContent>
        </Card>
        {DLR_STATUSES.map((s) => {
          const count = dlrCounts[s.key] ?? 0;
          const isActive = filter === s.key;
          return (
            <Card key={s.key} className={cn("cursor-pointer transition-all hover:border-primary/30", isActive && "border-primary ring-1 ring-primary/20")} onClick={() => setFilter(isActive ? null : s.key)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", s.bg)}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <span className="text-2xl font-bold">{count}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{s.key}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              R\u00e9partition DLR
            </CardTitle>
            <CardDescription>Taux de livraison global : <span className="font-bold text-emerald-600">{deliveryRate}%</span></CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun DLR re\u00e7u</p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}: {d.value}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Delivery rate by operator/country */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Taux par op\u00e9rateur / pays
            </CardTitle>
            <CardDescription>Taux de livraison par destination</CardDescription>
          </CardHeader>
          <CardContent>
            {operatorStats.length > 0 ? (
              <div className="space-y-3">
                {operatorStats.map((op) => {
                  const rate = op.total > 0 ? ((op.delivered / op.total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={op.operator} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{op.country}</Badge>
                        <span className="text-sm font-medium truncate">{op.operator}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-sm font-bold w-14 text-right">{rate}%</span>
                        <span className="text-xs text-muted-foreground w-16 text-right">{op.delivered}/{op.total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune donn\u00e9e</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Message Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Timeline des messages</CardTitle>
              <CardDescription>{filtered.length} message{filtered.length !== 1 ? "s" : ""}{filter ? ` (filtr\u00e9: ${filter})` : ""}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 w-[200px]" />
              </div>
              {(filter || search) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilter(null); setSearch(""); }}>R\u00e9initialiser</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-50" />
              <p className="text-sm">Aucun message trouv\u00e9</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => {
                const dlrInfo = DLR_STATUSES.find((s) => s.key === m.dlrStatus);
                const opInfo = getOperatorInfo(m.to);
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedMsg(m)}>
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", dlrInfo?.bg ?? "bg-muted")}>
                      {dlrInfo ? <dlrInfo.icon className="h-4 w-4" /> : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{m.to}</span>
                        <Badge variant="outline" className="text-[9px]">{opInfo.country}</Badge>
                        {m.dlrStatus && <Badge variant="outline" className={cn("text-[9px] font-mono", dlrInfo?.bg)}>{m.dlrStatus}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{m.text}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums">{formatDate(m.sentAt)}</p>
                      {m.dlrReceivedAt && <p className="text-[10px] text-muted-foreground">DLR: {formatDate(m.dlrReceivedAt)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMsg} onOpenChange={(o) => { if (!o) setSelectedMsg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>D\u00e9tail DLR</DialogTitle>
            <DialogDescription>Timeline compl\u00e8te du message</DialogDescription>
          </DialogHeader>
          {selectedMsg && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">{selectedMsg.text}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Destinataire</p><p className="font-mono">{selectedMsg.to}</p></div>
                <div><p className="text-xs text-muted-foreground">Exp\u00e9diteur</p><p>{selectedMsg.from}</p></div>
                <div><p className="text-xs text-muted-foreground">Op\u00e9rateur</p><p>{getOperatorInfo(selectedMsg.to).operator}</p></div>
                <div><p className="text-xs text-muted-foreground">Pays</p><p>{getOperatorInfo(selectedMsg.to).country}</p></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium">Timeline</p>
                {[{ label: "Cr\u00e9\u00e9", time: selectedMsg.createdAt, color: "bg-blue-100 dark:bg-blue-900", text: "text-blue-600 dark:text-blue-400" },
                  { label: "Envoy\u00e9", time: selectedMsg.sentAt, color: "bg-sky-100 dark:bg-sky-900", text: "text-sky-600 dark:text-sky-400" },
                  { label: `DLR: ${selectedMsg.dlrStatus ?? "\u2014"}`, time: selectedMsg.dlrReceivedAt, color: selectedMsg.dlrStatus === "DELIVRD" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-red-100 dark:bg-red-900", text: selectedMsg.dlrStatus === "DELIVRD" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
                  { label: "Livr\u00e9", time: selectedMsg.deliveredAt, color: "bg-emerald-100 dark:bg-emerald-900", text: "text-emerald-600 dark:text-emerald-400" },
                ].filter((s) => s.time).map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", step.color)}>
                      <span className={cn("text-[10px] font-bold", step.text)}>{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(step.time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
