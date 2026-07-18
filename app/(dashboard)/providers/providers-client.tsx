"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import { Switch } from "@/core/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  createProviderAction, deleteProviderAction, updateProviderAction,
} from "@/core/actions/providers";

interface Row {
  id: string;
  name: string;
  type: string;
  country: string | null;
  isActive: boolean;
  connectorCount: number;
  messageCount: number;
  deliveryRate: number;
  createdAt: string;
}

const TYPES = ["SMPP", "HTTP_API"] as const;

export function ProvidersClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"SMPP" | "HTTP_API">("SMPP");
  const [country, setCountry] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() { window.location.reload(); }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createProviderAction({
        name, type, country: country || null, isActive: active,
      });
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setOpen(false); setName(""); setCountry("");
      refresh();
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const r = await updateProviderAction(id, { isActive });
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, isActive } : x)));
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce fournisseur ?")) return;
    startTransition(async () => {
      const r = await deleteProviderAction(id);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nouveau fournisseur</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer un fournisseur</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Pays (ISO)</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="DJ" /></div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Actif</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={handleCreate} disabled={pending || !name.trim()}>Créer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Pays</th>
              <th className="px-4 py-3">Connecteurs</th>
              <th className="px-4 py-3">Volume</th>
              <th className="px-4 py-3">Taux livr.</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Aucun fournisseur.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                <td className="px-4 py-3">{r.country ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{r.connectorCount}</td>
                <td className="px-4 py-3 font-mono">{r.messageCount}</td>
                <td className="px-4 py-3 font-mono text-emerald-600">{r.deliveryRate}%</td>
                <td className="px-4 py-3">
                  <Switch checked={r.isActive} onCheckedChange={(v) => handleToggle(r.id, v)} disabled={pending} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" className="text-red-600"
                    onClick={() => handleDelete(r.id)} disabled={pending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
