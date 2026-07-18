"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/core/components/ui/dialog";
import { FileSpreadsheet, Eye } from "lucide-react";
import { exportAuditCsvAction, listAuditLogsAction, type AuditFilters } from "@/core/actions/audit";

interface Row {
  id: string; action: string; entity: string;
  entityId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  details: unknown;
  createdAt: string;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function AuditClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyFilters() {
    setError(null);
    startTransition(async () => {
      const r = await listAuditLogsAction({ filters, limit: 200 });
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setRows(r.data.map((l) => ({
        ...l,
        ipAddress: l.ipAddress,
        createdAt: typeof l.createdAt === "string" ? l.createdAt : (l.createdAt as Date).toISOString(),
      })));
    });
  }
  function clearFilters() {
    setFilters({});
    startTransition(async () => {
      const r = await listAuditLogsAction({ limit: 200 });
      if (r.ok) setRows(r.data.map((l) => ({
        ...l,
        ipAddress: l.ipAddress,
        createdAt: typeof l.createdAt === "string" ? l.createdAt : (l.createdAt as Date).toISOString(),
      })));
    });
  }
  function handleExport() {
    startTransition(async () => {
      const r = await exportAuditCsvAction(filters);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      download(`audit-${Date.now()}.csv`, r.csv, "text/csv;charset=utf-8;");
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4">
        <div><Label className="text-xs">Utilisateur</Label><Input value={filters.userEmail ?? ""} onChange={(e) => setFilters({ ...filters, userEmail: e.target.value || undefined })} placeholder="email" /></div>
        <div><Label className="text-xs">Action</Label><Input value={filters.action ?? ""} onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined })} placeholder="create" /></div>
        <div><Label className="text-xs">Entité</Label><Input value={filters.entity ?? ""} onChange={(e) => setFilters({ ...filters, entity: e.target.value || undefined })} placeholder="sms" /></div>
        <div><Label className="text-xs">Du</Label><Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} /></div>
        <div><Label className="text-xs">Au</Label><Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} /></div>
        <Button variant="outline" onClick={applyFilters} disabled={pending}>Appliquer</Button>
        <Button variant="ghost" onClick={clearFilters} disabled={pending}>Reset</Button>
        <div className="ml-auto">
          <Button variant="outline" className="gap-1.5" onClick={handleExport} disabled={pending}>
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entité</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3 text-right">Détails</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucune entrée.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-xs font-mono">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-3 text-xs">{r.userEmail ?? "—"}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{r.action}</Badge></td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{r.entity}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.entityId?.slice(0, 8) ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => setSelected(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Détails de l'événement</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Date</span><p className="font-mono">{new Date(selected.createdAt).toLocaleString("fr-FR")}</p></div>
                <div><span className="text-muted-foreground">Utilisateur</span><p>{selected.userEmail ?? "—"}</p></div>
                <div><span className="text-muted-foreground">Action</span><p>{selected.action}</p></div>
                <div><span className="text-muted-foreground">Entité</span><p>{selected.entity}</p></div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Diff (avant / après)</p>
                <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-96">{JSON.stringify(selected.details, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
