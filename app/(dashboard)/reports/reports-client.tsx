"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Calendar, FileSpreadsheet, FileText, Plus, Trash2 } from "lucide-react";
import {
  exportReportCsvAction, exportReportPdfAction, getReportAction,
  scheduleReportAction, cancelScheduledReportAction,
} from "@/core/actions/reports";
import type { ReportFilters, Period, Dimension } from "@/core/features/reports/types";

interface ReportData {
  range: { from: string; to: string };
  total: number;
  timeseries: Array<{ date: string; sent: number; delivered: number; failed: number; cost: number }>;
  dlrBreakdown: Array<{ status: string; count: number }>;
  dimension: Dimension;
  dimensionBreakdown: Array<{ label: string; sent: number; delivered: number; failed: number; deliveryRate: number; cost: number }>;
  costCurve: Array<{ date: string; cost: number }>;
}

interface ScheduledRow { id: string; name: string; cron: string | null; next: number | null; key: string; }

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui", "7d": "7 jours", "30d": "30 jours",
  "90d": "90 jours", "365d": "1 an", custom: "Personnalis\u00e9",
};
const DLR_COLORS: Record<string, string> = {
  DELIVERED: "#10b981", SENT: "#3b82f6", PENDING: "#f59e0b",
  QUEUED: "#a855f7", FAILED: "#ef4444", EXPIRED: "#6b7280",
  REJECTED: "#f43f5e", CANCELLED: "#9ca3af",
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64(filename: string, base64: string, type: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  download(filename, arr as unknown as string, type);
  // ^ Blob accepts BlobPart so we re-wrap below
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ReportsClient({ initial, initialScheduled }: { initial: ReportData; initialScheduled: ScheduledRow[] }) {
  const [data, setData] = useState<ReportData>(initial);
  const [period, setPeriod] = useState<Period>("7d");
  const [dimension, setDimension] = useState<Dimension>("provider");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledRow[]>(initialScheduled);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedName, setSchedName] = useState("");
  const [schedCron, setSchedCron] = useState("0 8 * * 1");
  const [schedRecipients, setSchedRecipients] = useState("");

  function reload(p: Period = period, d: Dimension = dimension) {
    setError(null);
    const filters: ReportFilters = { period: p, dimension: d };
    if (p === "custom") { filters.from = from; filters.to = to; }
    startTransition(async () => {
      const r = await getReportAction(filters);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setData(r.data);
    });
  }

  function handleExportCsv() {
    startTransition(async () => {
      const filters: ReportFilters = { period, dimension };
      if (period === "custom") { filters.from = from; filters.to = to; }
      const r = await exportReportCsvAction(filters);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      download(`report-${Date.now()}.csv`, r.csv, "text/csv;charset=utf-8;");
    });
  }

  function handleExportPdf() {
    startTransition(async () => {
      const filters: ReportFilters = { period, dimension };
      if (period === "custom") { filters.from = from; filters.to = to; }
      const r = await exportReportPdfAction(filters);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      downloadBlob(r.filename, new Blob([arr], { type: "application/pdf" }));
    });
  }

  function handleSchedule() {
    startTransition(async () => {
      const r = await scheduleReportAction({
        name: schedName, cron: schedCron,
        recipients: schedRecipients.split(",").map((s) => s.trim()).filter(Boolean),
        filters: { period, dimension },
      });
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setScheduleOpen(false); setSchedName(""); setSchedRecipients("");
      window.location.reload();
    });
  }

  function handleCancelSchedule(key: string) {
    if (!confirm("Annuler ce rapport planifi\u00e9 ?")) return;
    startTransition(async () => {
      const r = await cancelScheduledReportAction(key);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setScheduled((prev) => prev.filter((x) => x.key !== key));
    });
  }

  const dlrPie = data.dlrBreakdown.map((d) => ({ name: d.status, value: d.count, fill: DLR_COLORS[d.status] ?? "#94a3b8" }));

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label className="text-xs">Période</Label>
            <Select value={period} onValueChange={(v) => { setPeriod(v as Period); reload(v as Period, dimension); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div><Label className="text-xs">Du</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">Au</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <Button variant="outline" onClick={() => reload()} disabled={pending}>Appliquer</Button>
            </>
          )}
          <div>
            <Label className="text-xs">Dimension</Label>
            <Select value={dimension} onValueChange={(v) => { setDimension(v as Dimension); reload(period, v as Dimension); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Fournisseur</SelectItem>
                <SelectItem value="country">Pays</SelectItem>
                <SelectItem value="campaign">Campagne</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="gap-1.5" onClick={handleExportCsv} disabled={pending}>
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={handleExportPdf} disabled={pending}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5"><Calendar className="h-4 w-4" /> Planifier</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Planifier un rapport</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nom</Label><Input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="Rapport hebdo" /></div>
                  <div><Label>Cron</Label><Input value={schedCron} onChange={(e) => setSchedCron(e.target.value)} placeholder="0 8 * * 1" /></div>
                  <div><Label>Destinataires (séparés par virgule)</Label><Input value={schedRecipients} onChange={(e) => setSchedRecipients(e.target.value)} placeholder="ops@example.com" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setScheduleOpen(false)}>Annuler</Button>
                  <Button onClick={handleSchedule} disabled={pending || !schedName.trim() || !schedRecipients.trim()}>Planifier</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Volume journalier</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeseries}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Legend />
                <Area type="monotone" dataKey="sent" name="Envoyés" stroke="#3b82f6" fill="url(#gSent)" strokeWidth={2} />
                <Area type="monotone" dataKey="delivered" name="Livrés" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
                <Area type="monotone" dataKey="failed" name="Échoués" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Répartition par statut</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dlrPie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {dlrPie.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                </Pie>
                <Legend />
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Taux de livraison par {data.dimension}</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dimensionBreakdown} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="sent" name="Envoyés" fill="#3b82f6" />
              <Bar dataKey="delivered" name="Livrés" fill="#10b981" />
              <Bar dataKey="failed" name="Échoués" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Coût cumulé</CardTitle></CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.costCurve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Line type="monotone" dataKey="cost" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rapports planifiés</CardTitle></CardHeader>
        <CardContent>
          {scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rapport planifié.</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((s) => (
                <div key={s.key} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-[10px]">{s.cron ?? "—"}</Badge>
                    <span className="text-sm font-medium">{s.name}</span>
                    {s.next && (
                      <span className="text-xs text-muted-foreground">prochain : {new Date(s.next).toLocaleString("fr-FR")}</span>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleCancelSchedule(s.key)} disabled={pending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
