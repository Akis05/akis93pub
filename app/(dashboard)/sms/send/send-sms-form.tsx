"use client";

import { useMemo, useState, useTransition } from "react";
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
  AlertCircle, CheckCircle2, Loader2, Plug, Send, Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { sendSmsAction, checkSmppConnectionAction, type SendSmsActionResult, type CheckConnectionResult } from "@/core/actions/sms";
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
  return {
    unicode,
    encoding: unicode ? "UCS-2" : "GSM-7",
    length,
    segments,
    capacity,
    remaining: Math.max(0, capacity - length),
  };
}

// Status dot color, same source of truth/colors as the header SMPP indicator.
function connectorStatusDot(status: SmppConnector["status"]): { color: string; pulse: boolean; label: string } {
  switch (status) {
    case "bound":
      return { color: "bg-emerald-500", pulse: true, label: "Connect\u00e9" };
    case "binding":
    case "connecting":
      return { color: "bg-amber-500", pulse: true, label: status };
    case "error":
      return { color: "bg-red-500", pulse: false, label: "Erreur" };
    default:
      return { color: "bg-gray-400", pulse: false, label: "D\u00e9connect\u00e9" };
  }
}

/**
 * Resolve a connector's LIVE state from the SMPP session snapshot
 * (same source as the header indicator: /api/smpp/status). A connector is
 * matched to a session by host:port (and systemId when available).
 * Returns green when bound, amber while (re)binding, red otherwise.
 */
function liveConnectorDot(
  connector: SmppConnector,
  sessions: SmppLiveSession[],
): { color: string; pulse: boolean; label: string } {
  const match = sessions.find(
    (s) =>
      s.host === connector.host &&
      s.port === connector.port &&
      (!connector.systemId || s.systemId === connector.systemId),
  );
  if (!match) return { color: "bg-red-500", pulse: false, label: "D\u00e9connect\u00e9" };
  if (match.state === "bound") return { color: "bg-emerald-500", pulse: true, label: "Connect\u00e9" };
  if (match.state === "binding" || match.state === "connecting")
    return { color: "bg-amber-500", pulse: true, label: match.state };
  if (match.state === "error") return { color: "bg-red-500", pulse: false, label: "Erreur" };
  return { color: "bg-red-500", pulse: false, label: "D\u00e9connect\u00e9" };
}

export function SendSmsForm({ connectors }: Props) {
  const live = useSmppLiveStatus();
  const firstBound = connectors.find((c) => c.status === "bound") ?? connectors[0];

  const [connectorId, setConnectorId] = useState<string>(firstBound?.id ?? "");
  const [from, setFrom] = useState<string>(firstBound?.sourceAddr ?? "");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [requestDlr, setRequestDlr] = useState(true);

  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SendSmsActionResult | null>(null);
  const [connCheck, setConnCheck] = useState<CheckConnectionResult | null>(null);
  const [isChecking, startCheckTransition] = useTransition();

  function handleCheckConnection() {
    setConnCheck(null);
    startCheckTransition(async () => {
      const res = await checkSmppConnectionAction(connectorId);
      setConnCheck(res);
    });
  }

  const selectedConnector = useMemo(
    () => connectors.find((c) => c.id === connectorId),
    [connectors, connectorId]
  );

  // Normalise le numéro pour la validation live (ajoute '+' si absent)
  const normalizedTo = to.startsWith("+") ? to : to.length > 0 ? `+${to}` : "";
  const e164Valid = /^\+[1-9]\d{6,14}$/.test(normalizedTo);
  const counter = useMemo(() => computeEncoding(text), [text]);

  const canSubmit =
    !isPending && !!connectorId && e164Valid && text.length > 0 && text.length <= 306;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setResult(null);

    startTransition(async () => {
      const res = await sendSmsAction({
        connectorId,
        to,
        text,
        from: from.trim() || undefined,
        requestDlr,
      });
      setResult(res);
      if (res.success) {
        setText("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* --- Main column --- */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Routing</CardTitle>
            <CardDescription>
              Choose the SMPP connector and the sender ID to use for this submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="connector">SMPP Connector</Label>
              <Select value={connectorId} onValueChange={(v) => {
                setConnectorId(v);
                const c = connectors.find((x) => x.id === v);
                if (c) setFrom(c.sourceAddr);
              }}>
                <SelectTrigger id="connector">
                  <SelectValue placeholder="Select a connector" />
                </SelectTrigger>
                <SelectContent>
                  {connectors.map((c) => {
                    // Live dot synced with the header (falls back to DB status
                    // while the first /api/smpp/status poll is loading).
                    const dot = live.loading
                      ? connectorStatusDot(c.status)
                      : liveConnectorDot(c, live.sessions);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5" title={dot.label}>
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
              {selectedConnector && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {selectedConnector.host}:{selectedConnector.port} • {selectedConnector.bindMode}
                    {selectedConnector.useTls ? " • TLS" : ""}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCheckConnection}
                    disabled={isChecking || !connectorId}
                    className="h-7 gap-1.5 text-xs"
                  >
                    {isChecking ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Vérification…</>
                    ) : (
                      <><Wifi className="h-3 w-3" /> Vérifier connexion</>
                    )}
                  </Button>
                </div>
              )}
              {connCheck && (
                <div className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                  connCheck.success
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                )}>
                  {connCheck.success ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Connecté (bound) — {connCheck.latencyMs}ms</>
                  ) : (
                    <><WifiOff className="h-3.5 w-3.5" /> {connCheck.error ?? "Non connecté"}{connCheck.latencyMs !== undefined ? ` — ${connCheck.latencyMs}ms` : ""}</>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="from">Sender ID</Label>
              <Input
                id="from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="MYBRAND"
                maxLength={11}
              />
              <p className="text-xs text-muted-foreground">
                Alphanumeric (max 11 chars) or numeric short/long code.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
            <CardDescription>
              Entrez le numéro avec ou sans <code>+</code> (ex: <code>25377635543</code> ou <code>+25377635543</code>).
              L'encodage et le nombre de segments sont calculés en temps réel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="to">Numéro destinataire</Label>
              <Input
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
                placeholder="25377635543"
                inputMode="tel"
                className={cn(
                  to.length > 0 && !e164Valid && "border-red-500 focus-visible:ring-red-500/30"
                )}
              />
              {to.length > 0 && !e164Valid && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" /> Numéro invalide. Entrez ex: 33612345678 ou +33612345678
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="text">Message text</Label>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="font-mono">
                    {counter.encoding}
                  </Badge>
                  <span className={cn(
                    "font-mono tabular-nums",
                    counter.length > 306 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {counter.length} / {counter.capacity || (counter.unicode ? 70 : 160)}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {counter.segments} {counter.segments <= 1 ? "segment" : "segments"}
                  </Badge>
                </div>
              </div>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your message here…"
                rows={6}
                maxLength={306}
              />
              <p className="text-xs text-muted-foreground">
                {counter.unicode
                  ? "Unicode characters detected — UCS-2 encoding: 70 chars / segment (67 when concatenated)."
                  : "GSM-7 encoding: 160 chars / segment (153 when concatenated)."}
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="dlr" className="text-sm">Request delivery receipt (DLR)</Label>
                <p className="text-xs text-muted-foreground">
                  Sets <code>registered_delivery=1</code> on the <code>submit_sm</code> PDU.
                </p>
              </div>
              <Switch id="dlr" checked={requestDlr} onCheckedChange={setRequestDlr} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setText(""); setTo(""); setResult(null); }}
            disabled={isPending}
          >
            Reset
          </Button>
          <Button type="submit" disabled={!canSubmit} className="min-w-[140px]">
            {isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Send SMS</>
            )}
          </Button>
        </div>
      </div>

      {/* --- Side panel --- */}
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/0 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                From {from || "—"}
              </p>
              <div className="min-h-[80px] max-w-full overflow-hidden rounded-xl bg-card px-3 py-2 text-sm shadow-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                {text || <span className="text-muted-foreground">Your message will appear here.</span>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-card px-2 py-1.5">
                  <div className="font-mono text-sm tabular-nums">{counter.length}</div>
                  <div className="text-[10px] text-muted-foreground">chars</div>
                </div>
                <div className="rounded-md bg-card px-2 py-1.5">
                  <div className="font-mono text-sm tabular-nums">{counter.segments}</div>
                  <div className="text-[10px] text-muted-foreground">segments</div>
                </div>
                <div className="rounded-md bg-card px-2 py-1.5">
                  <div className="font-mono text-sm">{counter.encoding}</div>
                  <div className="text-[10px] text-muted-foreground">encoding</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card className={cn(
            "border-2",
            result.success ? "border-emerald-500/40" : "border-red-500/40"
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                {result.success ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Submitted</>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-red-600" /> Failed</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {result.success ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Statut</span>
                    <Badge variant="secondary">File d'attente (BullMQ)</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Message ID</span>
                    <code className="truncate font-mono text-[11px]">{result.messageId}</code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Segments</span>
                    <span className="font-mono">{result.segments}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Encoding</span>
                    <span className="font-mono">{result.encoding}</span>
                  </div>
                  {result.error && (
                    <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      {result.error}
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-red-700 dark:text-red-400">
                  {result.error}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>• Le numéro peut être saisi avec ou sans <code>+</code> (ex: <code>25377635543</code>).</p>
            <p>• A single GSM-7 segment fits 160 chars, UCS-2 only 70.</p>
            <p>• Long messages are concatenated (153 / 67 per segment).</p>
            <p>• Every send is queued through BullMQ; the SMPP worker delivers it as soon as the session is bound.</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
