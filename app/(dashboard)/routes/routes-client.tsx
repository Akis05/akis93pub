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
import { ArrowRight, FlaskConical, Plus, Trash2 } from "lucide-react";
import {
  createRouteAction, deleteRouteAction, evaluateRouteAction, updateRouteAction,
} from "@/core/actions/routes";

interface RuleRow { destinationPrefix?: string; country?: string; tag?: string; }
interface Row {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  rules: unknown;
  connectorId: string | null;
  connectorName: string | null;
  connectorStatus: string | null;
  createdAt: string;
}

export function RoutesClient({ initial, connectors }: { initial: Row[]; connectors: Array<{ id: string; name: string }> }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Form state
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(10);
  const [isDefault, setIsDefault] = useState(false);
  const [connectorId, setConnectorId] = useState<string>(connectors[0]?.id ?? "");
  const [prefix, setPrefix] = useState("");
  const [country, setCountry] = useState("");

  // Test panel
  const [testNumber, setTestNumber] = useState("+253");
  const [testResult, setTestResult] = useState<{ routeId: string | null; connectorId: string | null } | null>(null);

  function refresh() { window.location.reload(); }

  function handleCreate() {
    setError(null);
    const rules: RuleRow[] = [];
    if (prefix) rules.push({ destinationPrefix: prefix });
    if (country) rules.push({ country });
    startTransition(async () => {
      const r = await createRouteAction({
        name, priority, isActive: true, isDefault,
        providerId: connectorId || null, rules,
      });
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setOpen(false); setName(""); setPrefix(""); setCountry(""); setIsDefault(false);
      refresh();
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const r = await updateRouteAction(id, { isActive });
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, isActive } : x)));
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer cette route ?")) return;
    startTransition(async () => {
      const r = await deleteRouteAction(id);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.filter((x) => x.id !== id));
    });
  }

  function handleTest() {
    startTransition(async () => {
      const r = await evaluateRouteAction(testNumber);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setTestResult({ routeId: r.routeId, connectorId: r.providerId });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Tester un numéro E.164</Label>
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="+25377123456" />
        </div>
        <Button variant="outline" className="gap-2" onClick={handleTest} disabled={pending}>
          <FlaskConical className="h-4 w-4" /> Tester
        </Button>
        {testResult && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="font-mono">
              {testResult.routeId ? `route ${testResult.routeId.slice(0, 8)}` : "aucune route"}
            </Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge variant="outline" className="font-mono">
              {testResult.connectorId ? `connecteur ${testResult.connectorId.slice(0, 8)}` : "aucun connecteur"}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle route</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer une route</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Priorité</Label><Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <Label className="text-xs">Route par défaut</Label>
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                </div>
              </div>
              <div>
                <Label>Connecteur</Label>
                <Select value={connectorId} onValueChange={setConnectorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {connectors.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Préfixe destination</Label>
                  <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="253" />
                </div>
                <div>
                  <Label>Pays (ISO)</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="DJ" />
                </div>
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
              <th className="px-4 py-3">Priorité</th>
              <th className="px-4 py-3">Règles</th>
              <th className="px-4 py-3">Connecteur</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucune route.</td></tr>
            ) : rows.map((r) => {
              const rules = Array.isArray(r.rules) ? (r.rules as RuleRow[]) : [];
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {r.name}
                    {r.isDefault && <Badge variant="outline" className="ml-2 text-[9px]">défaut</Badge>}
                  </td>
                  <td className="px-4 py-3 font-mono">{r.priority}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {rules.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                      {rules.map((rule, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] font-mono">
                          {rule.destinationPrefix ? `prefix:${rule.destinationPrefix}` : rule.country ? `country:${rule.country}` : `tag:${rule.tag}`}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.connectorName ?? "—"}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
