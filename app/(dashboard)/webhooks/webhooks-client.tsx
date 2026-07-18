"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import { Switch } from "@/core/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import { CheckCircle2, Play, Plus, Trash2, XCircle } from "lucide-react";
import {
  createWebhookAction, deleteWebhookAction, signTestPayloadAction, updateWebhookAction,
} from "@/core/actions/webhooks";

const EVENTS = [
  "sms.queued", "sms.sent", "sms.delivered", "sms.failed",
  "campaign.started", "campaign.completed",
  "contact.opt_out",
];

interface Row {
  id: string; name: string; url: string; events: string[];
  isActive: boolean; failureCount: number;
  lastTriggeredAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  deliveryCount: number;
  createdAt: string;
}

export function WebhooksClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleEvent(e: string) {
    setSelectedEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createWebhookAction({ name, url, events: selectedEvents, isActive: true });
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setOpen(false); setName(""); setUrl("https://"); setSelectedEvents([]);
      window.location.reload();
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const r = await updateWebhookAction(id, { isActive });
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, isActive } : x)));
    });
  }

  function handleTest(id: string) {
    startTransition(async () => {
      const r = await signTestPayloadAction(id);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      alert("Payload de test enfil\u00e9. Voir l'onglet livraisons.");
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce webhook ?")) return;
    startTransition(async () => {
      const r = await deleteWebhookAction(id);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nouveau webhook</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer un webhook</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Notif CRM" /></div>
              <div><Label>URL *</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" /></div>
              <div>
                <Label>Événements *</Label>
                <div className="mt-2 flex flex-wrap gap-1">
                  {EVENTS.map((e) => (
                    <Badge key={e} variant={selectedEvents.includes(e) ? "default" : "outline"}
                      className="cursor-pointer text-[10px]" onClick={() => toggleEvent(e)}>
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Un secret HMAC-SHA256 sera généré automatiquement. Header : <code>X-SMS-Gateway-Signature</code>.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={handleCreate} disabled={pending || !name.trim() || !url.trim() || selectedEvents.length === 0}>Créer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Événements</th>
              <th className="px-4 py-3">Dernier</th>
              <th className="px-4 py-3">Échecs</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Aucun webhook configuré.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs truncate max-w-xs">{r.url}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.events.map((e) => <Badge key={e} variant="outline" className="text-[9px] font-mono">{e}</Badge>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.lastSuccessAt && (
                    <div className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {new Date(r.lastSuccessAt).toLocaleString("fr-FR")}
                    </div>
                  )}
                  {r.lastFailureAt && (
                    <div className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-3 w-3" /> {new Date(r.lastFailureAt).toLocaleString("fr-FR")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono">{r.failureCount}</td>
                <td className="px-4 py-3">
                  <Switch checked={r.isActive} onCheckedChange={(v) => handleToggle(r.id, v)} disabled={pending} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Test" onClick={() => handleTest(r.id)} disabled={pending}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-600" title="Supprimer" onClick={() => handleDelete(r.id)} disabled={pending}>
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
