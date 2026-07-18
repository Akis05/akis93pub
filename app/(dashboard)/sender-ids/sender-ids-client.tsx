"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import { CheckCircle, Plus, Trash2, XCircle } from "lucide-react";
import {
  approveSenderIdAction, createSenderIdAction, deleteSenderIdAction,
  rejectSenderIdAction,
} from "@/core/actions/sender-ids";

interface Row {
  id: string;
  name: string;
  type: string;
  status: string;
  approvedAt: string | null;
  rejectedReason: string | null;
  providerName: string | null;
  createdAt: string;
}

const TYPES = ["ALPHANUMERIC", "SHORT_CODE", "LONG_CODE"] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700 border-amber-200",
    APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    REJECTED: "bg-red-100 text-red-700 border-red-200",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

export function SenderIdsClient({ initial, isSuperAdmin }: { initial: Row[]; isSuperAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<typeof TYPES[number]>("ALPHANUMERIC");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() { window.location.reload(); }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createSenderIdAction({ name, type });
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setOpen(false); setName(""); setType("ALPHANUMERIC");
      refresh();
    });
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      const r = await approveSenderIdAction(id);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: "APPROVED" } : x)));
    });
  }

  function handleReject(id: string) {
    const reason = prompt("Raison du refus ?");
    if (reason === null) return;
    startTransition(async () => {
      const r = await rejectSenderIdAction(id, reason);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: "REJECTED", rejectedReason: reason } : x)));
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce sender ID ?")) return;
    startTransition(async () => {
      const r = await deleteSenderIdAction(id);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nouveau sender ID</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Demander un sender ID</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MYBRAND" /></div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof TYPES[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={handleCreate} disabled={pending || !name.trim()}>Demander</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Créé le</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucun sender ID.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono">{r.name}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">{r.providerName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {isSuperAdmin && r.status === "PENDING" && (
                      <>
                        <Button variant="ghost" size="icon" title="Approuver" className="text-emerald-600"
                          onClick={() => handleApprove(r.id)} disabled={pending}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Rejeter" className="text-red-600"
                          onClick={() => handleReject(r.id)} disabled={pending}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="text-red-600"
                      onClick={() => handleDelete(r.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
