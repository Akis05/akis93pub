"use client";

import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Textarea } from "@/core/components/ui/textarea";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Switch } from "@/core/components/ui/switch";
import { Separator } from "@/core/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  AlertCircle, Calendar, CheckCircle2, Clock, FileUp, Globe,
  Loader2, Plug, Send, Trash2, Upload, Users, XCircle,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import type { SmppConnector } from "@/core/types";

interface Props {
  connectors: SmppConnector[];
}

const GSM_REGEX =
  /^[A-Za-z0-9@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !"#\u00a4%&'()*+,\-./:;<=>?\u00a1\u00c4\u00d6\u00d1\u00dc\u00a7\u00bf\u00e4\u00f6\u00f1\u00fc\u00e0^{}\\[~\]|\u20ac\r]*$/;

function computeEncoding(text: string) {
  const unicode = !GSM_REGEX.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const length = text.length;
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  const capacity = segments <= 1 ? single : multi * segments;
  return { unicode, encoding: unicode ? "UCS-2" : "GSM-7", length, segments, capacity, remaining: Math.max(0, capacity - length) };
}

function parsePhoneNumbers(raw: string): { valid: string[]; invalid: string[] } {
  const lines = raw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cleaned = line.replace(/[\s\-().]/g, "");
    const normalized = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
    if (/^\+[1-9]\d{6,14}$/.test(normalized)) {
      if (!seen.has(normalized)) { seen.add(normalized); valid.push(normalized); }
    } else { invalid.push(line); }
  }
  return { valid, invalid };
}

const TIMEZONES = [
  "Africa/Djibouti", "Africa/Nairobi", "Africa/Addis_Ababa",
  "Europe/Paris", "Europe/London", "America/New_York",
  "Asia/Dubai", "Asia/Riyadh", "UTC",
];

function connectorStatusVariant(status: SmppConnector["status"]) {
  switch (status) {
    case "bound": return { label: "Bound", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };
    case "binding": case "connecting": return { label: status, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" };
    case "error": return { label: "Error", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" };
    default: return { label: "Disconnected", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function ScheduledSmsForm({ connectors }: Props) {
  const firstBound = connectors.find((c) => c.status === "bound") ?? connectors[0];

  const [connectorId, setConnectorId] = useState(firstBound?.id ?? "");
  const [from, setFrom] = useState(firstBound?.sourceAddr ?? "");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [text, setText] = useState("");
  const [requestDlr, setRequestDlr] = useState(true);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [timezone, setTimezone] = useState("Africa/Djibouti");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; scheduledAt?: string; error?: string } | null>(null);

  const parsed = useMemo(() => parsePhoneNumbers(recipientsRaw), [recipientsRaw]);
  const counter = useMemo(() => computeEncoding(text), [text]);
  const estimatedCost = parsed.valid.length * counter.segments * 0.035;

  const isScheduleValid = scheduledDate && scheduledTime;
  const canSubmit = !isSending && connectorId && parsed.valid.length > 0 && text.length > 0 && text.length <= 306 && isScheduleValid;

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const lines = content.split(/\n/).slice(1).map((line) => {
        const cols = line.split(/[,;\t]/);
        return cols[0]?.trim() ?? "";
      }).filter(Boolean);
      setRecipientsRaw((prev) => (prev ? prev + "\n" : "") + lines.join("\n"));
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSending(true);
    setResult(null);
    const scheduledAt = `${scheduledDate}T${scheduledTime}:00`;
    setTimeout(() => {
      setResult({ success: true, scheduledAt });
      setIsSending(false);
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Routing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Routage</CardTitle>
            <CardDescription>Connecteur SMPP et identifiant expéditeur</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Connecteur SMPP</Label>
              <Select value={connectorId} onValueChange={(v) => {
                setConnectorId(v);
                const c = connectors.find((x) => x.id === v);
                if (c) setFrom(c.sourceAddr);
              }}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {connectors.map((c) => {
                    const v = connectorStatusVariant(c.status);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{c.name}</span>
                          <Badge variant="outline" className={cn("ml-2 h-5 px-1.5 text-[10px]", v.className)}>{v.label}</Badge>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sender ID</Label>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="MYBRAND" maxLength={11} />
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Planification
            </CardTitle>
            <CardDescription>Définissez la date et l'heure d'envoi</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-2">
              <Label>Heure</Label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fuseau horaire</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        {tz}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destinataires</CardTitle>
            <CardDescription>Collez les numéros ou importez un fichier CSV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                <Upload className="h-4 w-4" /> Importer CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
              </label>
              {recipientsRaw && (
                <Button type="button" variant="outline" size="sm" onClick={() => setRecipientsRaw("")} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Effacer
                </Button>
              )}
            </div>
            <Textarea value={recipientsRaw} onChange={(e) => setRecipientsRaw(e.target.value)} placeholder={"25377635543\n+25377123456\n..."} rows={5} className="font-mono text-sm" />
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {parsed.valid.length} valides</span>
              {parsed.invalid.length > 0 && (
                <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" /> {parsed.invalid.length} invalides</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Texte du message</Label>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="font-mono">{counter.encoding}</Badge>
                  <span className="font-mono tabular-nums text-muted-foreground">{counter.length} / {counter.capacity || (counter.unicode ? 70 : 160)}</span>
                  <Badge variant="secondary" className="font-mono">{counter.segments} seg.</Badge>
                </div>
              </div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tapez votre message ici..." rows={5} maxLength={306} />
            </div>
            <Separator />
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Accusé de réception (DLR)</Label>
                <p className="text-xs text-muted-foreground">Demander un rapport de livraison</p>
              </div>
              <Switch checked={requestDlr} onCheckedChange={setRequestDlr} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => { setText(""); setRecipientsRaw(""); setResult(null); setScheduledDate(""); setScheduledTime(""); }}>Réinitialiser</Button>
          <Button type="submit" disabled={!canSubmit} className="min-w-[180px]">
            {isSending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Planification...</>
            ) : (
              <><Clock className="mr-2 h-4 w-4" /> Programmer l'envoi</>
            )}
          </Button>
        </div>
      </div>

      {/* Side panel */}
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Résumé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Destinataires</span>
                <span className="font-bold">{parsed.valid.length}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</span>
                <span className="font-mono text-xs">{scheduledDate || "--"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Heure</span>
                <span className="font-mono text-xs">{scheduledTime || "--"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Fuseau</span>
                <span className="text-xs">{timezone}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total segments</span>
                <span className="font-mono font-bold">{parsed.valid.length * counter.segments}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Coût estimé</span>
                <span className="font-bold text-primary">{estimatedCost.toFixed(2)} DJF</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card className={cn("border-2", result.success ? "border-emerald-500/40" : "border-red-500/40")}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                {result.success ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Programmé</>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-red-600" /> Échec</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {result.success ? (
                <p className="text-emerald-700 dark:text-emerald-400">Envoi programmé pour le {result.scheduledAt} ({timezone})</p>
              ) : (
                <p className="text-red-700 dark:text-red-400">{result.error}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conseils</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>• L'envoi sera déclenché automatiquement à l'heure programmée.</p>
            <p>• Le fuseau horaire par défaut est Africa/Djibouti (UTC+3).</p>
            <p>• Vous pouvez annuler un envoi programmé depuis la file d'attente.</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
