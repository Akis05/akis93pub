"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Bell, DollarSign, Download, Plus, TrendingDown } from "lucide-react";
import {
  creditAccountAction, setAlertThresholdAction,
  generateMonthlyInvoiceAction,
} from "@/core/actions/billing";

interface Overview {
  balance: number;
  alertThreshold: number;
  alert: boolean;
  last90d: { credit: number; debit: number; refund: number; adjustment: number };
  daily: Array<{ date: string; amount: number }>;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  reference: string | null;
  createdAt: string;
}

interface Breakdown {
  campaigns: Array<{ label: string; messages: number; cost: number }>;
  connectors: Array<{ label: string; messages: number; cost: number }>;
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function downloadBase64(base64: string, filename: string, type: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function BillingClient({ overview, transactions, breakdown }: {
  overview: Overview;
  transactions: Transaction[];
  breakdown: Breakdown;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("1000");
  const [rechargeRef, setRechargeRef] = useState("");
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [threshold, setThreshold] = useState(String(overview.alertThreshold ?? 500));
  const [invoiceMonth, setInvoiceMonth] = useState(String(new Date().getUTCMonth() + 1).padStart(2, "0"));
  const [invoiceYear, setInvoiceYear] = useState(String(new Date().getUTCFullYear()));

  function handleRecharge() {
    setError(null);
    startTransition(async () => {
      const r = await creditAccountAction({
        amount: Number(rechargeAmount),
        description: "Rechargement manuel",
        reference: rechargeRef || undefined,
      });
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setRechargeOpen(false); setRechargeAmount("1000"); setRechargeRef("");
      window.location.reload();
    });
  }

  function handleThreshold() {
    setError(null);
    startTransition(async () => {
      const r = await setAlertThresholdAction(Number(threshold));
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setThresholdOpen(false);
      window.location.reload();
    });
  }

  function handleInvoice() {
    setError(null);
    startTransition(async () => {
      const r = await generateMonthlyInvoiceAction(Number(invoiceYear), Number(invoiceMonth));
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      downloadBase64(r.base64, r.filename, "application/pdf");
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={overview.alert ? "border-red-500/40" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
                <DollarSign className="h-5 w-5" />
              </div>
              {overview.alert && (
                <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 gap-1">
                  <AlertTriangle className="h-3 w-3" /> Sous le seuil
                </Badge>
              )}
            </div>
            <p className="mt-3 text-2xl font-bold">{fmt(overview.balance)} DJF</p>
            <p className="text-xs text-muted-foreground">Solde de crédits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950">
              <TrendingDown className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold">{fmt(Math.abs(overview.last90d.debit))} DJF</p>
            <p className="text-xs text-muted-foreground">Débit (90j)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950">
              <Plus className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold">{fmt(overview.last90d.credit)} DJF</p>
            <p className="text-xs text-muted-foreground">Crédits ajoutés (90j)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950">
              <Bell className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold">{fmt(overview.alertThreshold)} DJF</p>
            <p className="text-xs text-muted-foreground">Seuil d'alerte</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Recharger</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créditer le compte</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Montant (DJF) *</Label><Input type="number" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} /></div>
              <div><Label>Référence (virement, facture, ...)</Label><Input value={rechargeRef} onChange={(e) => setRechargeRef(e.target.value)} placeholder="VIR-2026-001" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={handleRecharge} disabled={pending || Number(rechargeAmount) <= 0}>Créditer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={thresholdOpen} onOpenChange={setThresholdOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2"><Bell className="h-4 w-4" /> Seuil d'alerte</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Définir le seuil d'alerte</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Seuil (DJF)</Label><Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setThresholdOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={handleThreshold} disabled={pending || Number(threshold) < 0}>Sauvegarder</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="ml-auto flex items-end gap-2">
          <div><Label className="text-xs">Année</Label><Input className="w-24" value={invoiceYear} onChange={(e) => setInvoiceYear(e.target.value)} /></div>
          <div><Label className="text-xs">Mois</Label><Input className="w-16" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} /></div>
          <Button variant="outline" className="gap-2" onClick={handleInvoice} disabled={pending}>
            <Download className="h-4 w-4" /> Facture PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Consommation (90j)</CardTitle></CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={overview.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Area type="monotone" dataKey="amount" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Par campagne (30j)</CardTitle></CardHeader>
          <CardContent>
            {breakdown.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Aucune consommation par campagne.</p>
            ) : (
              <div className="space-y-2">
                {breakdown.campaigns.slice(0, 10).map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{b.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{b.messages} msg</span>
                      <span className="font-mono">{fmt(b.cost)} DJF</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Par connecteur (30j)</CardTitle></CardHeader>
          <CardContent>
            {breakdown.connectors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Aucune consommation par connecteur.</p>
            ) : (
              <div className="space-y-2">
                {breakdown.connectors.slice(0, 10).map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{b.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{b.messages} msg</span>
                      <span className="font-mono">{fmt(b.cost)} DJF</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions récentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Réf.</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-right">Solde après</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucune transaction.</td></tr>
                ) : transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-xs font-mono">{new Date(t.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{t.type}</Badge></td>
                    <td className="px-4 py-3">{t.description ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{t.reference ?? "\u2014"}</td>
                    <td className={`px-4 py-3 text-right font-mono ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {t.amount >= 0 ? "+" : ""}{fmt(t.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(t.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
