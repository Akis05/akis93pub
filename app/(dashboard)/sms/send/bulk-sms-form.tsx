"use client";

import { useMemo, useState, useCallback, useTransition } from "react";
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
  AlertCircle, CheckCircle2, Loader2, Plug, Send,
  Trash2, Upload, Users, XCircle,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { sendSmsAction } from "@/core/actions/sms";
import type { SmppConnector } from "@/core/types";
import { useSmppLiveStatus, type SmppLiveSession } from "./use-smpp-live-status";

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
      if (!seen.has(normalized)) {
        seen.add(normalized);
        valid.push(normalized);
      }
    } else {
      invalid.push(line);
    }
  }
  return { valid, invalid };
}

// Status dot color, same colors as the header SMPP indicator.
function connectorStatusDot(status: SmppConnector["status"]): { color: string; pulse: boolean } {
  switch (status) {
    case "bound": return { color: "bg-emerald-500", pulse: true };
    case "binding": case "connecting": return { color: "bg-amber-500", pulse: true };
    case "error": return { color: "bg-red-500", pulse: false };
    default: return { color: "bg-gray-400", pulse: false };
  }
}

// Resolve a connector's LIVE state from the SMPP session snapshot, matching
// the header indicator (/api/smpp/status). Green = bound, red = disconnected.
function liveConnectorDot(connector: SmppConnector, sessions: SmppLiveSession[]): { color: string; pulse: boolean } {
  const match = sessions.find(
    (s) => s.host === connector.host && s.port === connector.port && (!connector.systemId || s.systemId === connector.systemId),
  );
  if (!match) return { color: "bg-red-500", pulse: false };
  if (match.state === "bound") return { color: "bg-emerald-500", pulse: true };
  if (match.state === "binding" || match.state === "connecting") return { color: "bg-amber-500", pulse: true };
  return { color: "bg-red-500", pulse: false };
}

interface BulkResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  errors: string[];
}

export function BulkSmsForm({ connectors }: Props) {
  const live = useSmppLiveStatus();
  const firstBound = connectors.find((c) => c.status === "bound") ?? connectors[0];

  const [connectorId, setConnectorId] = useState(firstBound?.id ?? "");
  const [from, setFrom] = useState(firstBound?.sourceAddr ?? "");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [text, setText] = useState("");
  const [requestDlr, setRequestDlr] = useState(true);
  const [deduplicate, setDeduplicate] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(() => parsePhoneNumbers(recipientsRaw), [recipientsRaw]);
  const counter = useMemo(() => computeEncoding(text), [text]);
  const estimatedCost = parsed.valid.length * counter.segments * 0.035;

  const canSubmit = !isPending && connectorId && parsed.valid.length > 0 && text.length > 0 && text.length <= 306;

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
    setResult(null);

    const recipients = deduplicate ? Array.from(new Set(parsed.valid)) : parsed.valid;
    setProgress({ done: 0, total: recipients.length });

    startTransition(async () => {
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      const trimmedFrom = from.trim() || undefined;

      // Sequential send to respect SMSC rate limit & give real feedback.
      for (let i = 0; i < recipients.length; i++) {
        const to = recipients[i]!;
        try {
          const res = await sendSmsAction({
            connectorId,
            to,
            text,
            from: trimmedFrom,
            requestDlr,
          });
          if (res.success) {
            sent++;
          } else {
            failed++;
            if (errors.length < 5 && res.error) errors.push(`${to}: ${res.error}`);
          }
        } catch (err) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${to}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        setProgress({ done: i + 1, total: recipients.length });
      }

      setResult({
        success: failed === 0,
        total: recipients.length,
        sent,
        failed,
        errors,
      });
      setProgress(null);
    });
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
              <Label htmlFor="bulk-connector">Connecteur SMPP</Label>
              <Select value={connectorId} onValueChange={(v) => {
                setConnectorId(v);
                const c = connectors.find((x) => x.id === v);
                if (c) setFrom(c.sourceAddr);
              }}>
                <SelectTrigger id="bulk-connector">
                  <SelectValue placeholder="Sélectionner un connecteur" />
                </SelectTrigger>
                <SelectContent>
                  {connectors.map((c) => {
                    const dot = live.loading ? connectorStatusDot(c.status) : liveConnectorDot(c, live.sessions);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            {dot.pulse && (
                              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dot.color)} />
                            )}
                            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dot.color)} />
                          </span>
                          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{c.name}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-from">Sender ID</Label>
              <Input id="bulk-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="MYBRAND" maxLength={11} />
              <p className="text-xs text-muted-foreground">Alphanumérique (max 11 chars) ou numéro court/long.</p>
            </div>
          </CardContent>
        </Card>

        {/* Recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destinataires</CardTitle>
            <CardDescription>Collez les numéros (un par ligne) ou importez un fichier CSV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                <Upload className="h-4 w-4" />
                Importer CSV
                <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={handleFileUpload} />
              </label>
              {recipientsRaw && (
                <Button type="button" variant="outline" size="sm" onClick={() => setRecipientsRaw("")} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Effacer
                </Button>
              )}
            </div>
            <Textarea
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder={"25377635543\n+25377123456\n33612345678\n..."}
              rows={6}
              className="font-mono text-sm"
            />
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> {parsed.valid.length} valides
              </span>
              {parsed.invalid.length > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-3.5 w-3.5" /> {parsed.invalid.length} invalides
                </span>
              )}
            </div>
            {parsed.invalid.length > 0 && (
              <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-400">
                <p className="font-medium">Numéros invalides :</p>
                <p className="mt-1 font-mono">{parsed.invalid.slice(0, 5).join(", ")}{parsed.invalid.length > 5 ? ` et ${parsed.invalid.length - 5} autres...` : ""}</p>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Dédupliquer les numéros</Label>
                <p className="text-xs text-muted-foreground">Supprime automatiquement les doublons</p>
              </div>
              <Switch checked={deduplicate} onCheckedChange={setDeduplicate} />
            </div>
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
            <CardDescription>Composez le message à envoyer à tous les destinataires</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-text">Texte du message</Label>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="font-mono">{counter.encoding}</Badge>
                  <span className={cn("font-mono tabular-nums", counter.length > 306 ? "text-red-600" : "text-muted-foreground")}>
                    {counter.length} / {counter.capacity || (counter.unicode ? 70 : 160)}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {counter.segments} {counter.segments <= 1 ? "segment" : "segments"}
                  </Badge>
                </div>
              </div>
              <Textarea id="bulk-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tapez votre message ici..." rows={6} maxLength={306} />
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Accusé de réception (DLR)</Label>
                <p className="text-xs text-muted-foreground">Demander un rapport de livraison pour chaque SMS</p>
              </div>
              <Switch checked={requestDlr} onCheckedChange={setRequestDlr} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => { setText(""); setRecipientsRaw(""); setResult(null); }}>Réinitialiser</Button>
          <Button type="submit" disabled={!canSubmit} className="min-w-[200px]">
            {isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi {progress ? `${progress.done}/${progress.total}` : "..."}</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Envoyer ({parsed.valid.length} SMS)</>
            )}
          </Button>
        </div>
      </div>

      {/* Side panel */}
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Résumé de l'envoi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Destinataires</span>
                <span className="font-bold">{parsed.valid.length}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Segments / SMS</span>
                <span className="font-mono">{counter.segments}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total segments</span>
                <span className="font-mono font-bold">{parsed.valid.length * counter.segments}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Encodage</span>
                <Badge variant="outline" className="font-mono">{counter.encoding}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Coût estimé</span>
                <span className="font-bold text-primary">{estimatedCost.toFixed(2)} DJF</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {progress && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Progression</span>
                <span className="font-mono">{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className={cn("border-2", result.success ? "border-emerald-500/40" : "border-red-500/40")}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                {result.success ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Envoi terminé</>
                ) : result.sent > 0 ? (
                  <><AlertCircle className="h-4 w-4 text-amber-600" /> Envoi partiel</>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-red-600" /> Échec</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Envoyés</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">{result.sent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Échoués</span>
                <span className="font-mono text-red-700 dark:text-red-400">{result.failed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono">{result.total}</span>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-400 space-y-1">
                  <p className="font-medium">Premières erreurs :</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="font-mono break-all">• {err}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conseils</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>• Collez les numéros séparés par des retours à la ligne, virgules ou points-virgules.</p>
            <p>• Importez un fichier CSV avec les numéros dans la première colonne.</p>
            <p>• Les doublons sont automatiquement supprimés si l'option est activée.</p>
            <p>• Chaque SMS est envoyé via le connecteur sélectionné et apparaît dans l'historique.</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
