"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Textarea } from "@/core/components/ui/textarea";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Progress } from "@/core/components/ui/progress";
import { Separator } from "@/core/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/core/components/ui/dialog";
import {
  AlertCircle, ArrowLeft, ArrowRight, Calendar, Check, CheckCircle2, Eye, FileText,
  Loader2, Megaphone, Pause, Play, Plus, RefreshCw, Rocket, Search, Send, Trash2, Users, X, XCircle,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  listCampaignsAction, createCampaignAction, updateCampaignStatusAction,
  deleteCampaignAction, getCampaignMessagesAction, resendCampaignFailedAction,
  type CampaignFormInput,
} from "@/core/actions/campaigns";
import { listGroupsAction } from "@/core/actions/groups";
import { listTemplatesAction } from "@/core/actions/templates";

type Status = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  message: string | null;
  templateId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
  groups: { id: string; name: string }[];
  template: { id: string; name: string } | null;
}

interface Group { id: string; name: string; memberCount: number; color: string | null }
interface Template { id: string; name: string; content: string; variables: string[] }

interface CampaignMessageRow {
  id: string;
  destinationAddr: string;
  sourceAddr: string;
  content: string;
  status: string;
  dlrStatus: string | null;
  dlrErrorCode: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof Megaphone }> = {
  DRAFT: { label: "Brouillon", color: "bg-gray-500/10 text-gray-700 dark:text-gray-400", icon: FileText },
  SCHEDULED: { label: "Programmée", color: "bg-violet-500/10 text-violet-700 dark:text-violet-400", icon: Calendar },
  RUNNING: { label: "En cours", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: Play },
  PAUSED: { label: "En pause", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: Pause },
  COMPLETED: { label: "Terminée", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  CANCELLED: { label: "Annulée", color: "bg-red-500/10 text-red-700 dark:text-red-400", icon: XCircle },
};

const MSG_STATUS_COLOR: Record<string, string> = {
  DELIVERED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  SENT: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  SENDING: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  QUEUED: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  EXPIRED: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
  REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  CANCELLED: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const WIZARD_STEPS = [
  { id: 1, label: "Audience", icon: Users },
  { id: 2, label: "Message", icon: FileText },
  { id: 3, label: "Planification", icon: Calendar },
  { id: 4, label: "Relecture", icon: Check },
  { id: 5, label: "Lancement", icon: Rocket },
];

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wizard, setWizard] = useState({
    name: "", description: "", groupIds: [] as string[],
    templateId: "" as string, message: "",
    scheduleNow: true, scheduledAt: "",
  });
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  // Details dialog
  const [detailsCampaign, setDetailsCampaign] = useState<Campaign | null>(null);
  const [campaignMessages, setCampaignMessages] = useState<CampaignMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, startResend] = useTransition();

  async function load() {
    setLoading(true);
    const [c, g, t] = await Promise.all([
      listCampaignsAction(),
      listGroupsAction(),
      listTemplatesAction(),
    ]);
    if (c.success) setCampaigns(c.data as unknown as Campaign[]);
    if (g.success) setGroups(g.data as unknown as Group[]);
    if (t.success) setTemplates(t.data as unknown as Template[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Polling for running campaigns (real-time-ish)
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === "RUNNING");
    if (!hasRunning) return;
    const id = setInterval(async () => {
      const result = await listCampaignsAction();
      if (result.success) setCampaigns(result.data as unknown as Campaign[]);
    }, 5000);
    return () => clearInterval(id);
  }, [campaigns]);

  const filtered = useMemo(() => {
    let data = campaigns;
    if (statusFilter !== "ALL") data = data.filter((c) => c.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((c) => c.name.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q) ?? false));
    }
    return data;
  }, [campaigns, search, statusFilter]);

  function openWizard() {
    setStep(1);
    setWizard({ name: "", description: "", groupIds: [], templateId: "", message: "", scheduleNow: true, scheduledAt: "" });
    setWizardError(null);
    setShowWizard(true);
  }

  function toggleGroup(id: string) {
    setWizard((w) => ({
      ...w,
      groupIds: w.groupIds.includes(id) ? w.groupIds.filter((x) => x !== id) : [...w.groupIds, id],
    }));
  }

  const selectedTemplate = templates.find((t) => t.id === wizard.templateId);
  const audienceSize = useMemo(() => {
    return groups.filter((g) => wizard.groupIds.includes(g.id)).reduce((sum, g) => sum + g.memberCount, 0);
  }, [groups, wizard.groupIds]);

  function canGoNext(): boolean {
    if (step === 1) return wizard.name.trim().length > 0 && wizard.groupIds.length > 0;
    if (step === 2) return !!wizard.templateId || wizard.message.trim().length > 0;
    if (step === 3) return wizard.scheduleNow || wizard.scheduledAt.length > 0;
    return true;
  }

  function handleLaunch() {
    setWizardError(null);
    startSave(async () => {
      const input: CampaignFormInput = {
        name: wizard.name,
        description: wizard.description || undefined,
        templateId: wizard.templateId || null,
        message: wizard.message || null,
        scheduledAt: wizard.scheduleNow ? null : (wizard.scheduledAt || null),
        groupIds: wizard.groupIds,
      };
      const result = await createCampaignAction(input);
      if (!result.success) { setWizardError(result.error ?? "Erreur"); return; }
      // If immediate launch, switch to RUNNING
      if (wizard.scheduleNow && result.data) {
        await updateCampaignStatusAction(result.data.id, "RUNNING");
      }
      setShowWizard(false);
      await load();
    });
  }

  async function handleStatus(c: Campaign, status: Status) {
    await updateCampaignStatusAction(c.id, status);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette campagne ?")) return;
    setDeletingId(id);
    await deleteCampaignAction(id);
    setDeletingId(null);
    await load();
  }

  async function loadCampaignMessages(id: string) {
    setMessagesLoading(true);
    const res = await getCampaignMessagesAction(id);
    if (res.success) setCampaignMessages(res.data as unknown as CampaignMessageRow[]);
    setMessagesLoading(false);
  }

  function openDetails(c: Campaign) {
    setDetailsCampaign(c);
    setResendError(null);
    loadCampaignMessages(c.id);
  }

  // Keep the dialog's stats fresh as `campaigns` refreshes (e.g. after resend).
  const activeCampaign = detailsCampaign
    ? campaigns.find((c) => c.id === detailsCampaign.id) ?? detailsCampaign
    : null;

  function handleResend() {
    if (!detailsCampaign) return;
    setResendError(null);
    startResend(async () => {
      const res = await resendCampaignFailedAction(detailsCampaign.id);
      if (!res.success) { setResendError(res.error ?? "Erreur"); return; }
      await loadCampaignMessages(detailsCampaign.id);
      await load();
    });
  }

  return (
    <>
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={statusFilter === "ALL" ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setStatusFilter("ALL")}>Tous</Badge>
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <Badge key={s} variant={statusFilter === s ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setStatusFilter(s)}>{STATUS_META[s].label}</Badge>
              ))}
            </div>
            <div className="ml-auto">
              <Button size="sm" className="h-9 gap-1.5" onClick={openWizard}>
                <Plus className="h-3.5 w-3.5" /> Nouvelle campagne
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-4 py-12">
          <Megaphone className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{campaigns.length === 0 ? "Aucune campagne. Lancez-en une." : "Aucun résultat."}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const meta = STATUS_META[c.status];
            const Icon = meta.icon;
            const progress = c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;
            const deliveryRate = c.sentCount > 0 ? Math.round((c.deliveredCount / c.sentCount) * 100) : 0;
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{c.name}</p>
                        <Badge className={cn("text-[9px] border-0 gap-1", meta.color)}>
                          <Icon className="h-2.5 w-2.5" /> {meta.label}
                        </Badge>
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground mb-2">{c.description}</p>}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {c.groups.map((g) => (
                          <Badge key={g.id} variant="secondary" className="text-[9px]">{g.name}</Badge>
                        ))}
                        {c.template && <Badge variant="outline" className="text-[9px]"><FileText className="h-2.5 w-2.5 mr-1" />{c.template.name}</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => openDetails(c)}>
                        <Eye className="h-3.5 w-3.5" /> Détails
                      </Button>
                      {c.status === "DRAFT" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => handleStatus(c, "RUNNING")}>
                          <Rocket className="h-3.5 w-3.5" /> Lancer
                        </Button>
                      )}
                      {c.status === "RUNNING" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => handleStatus(c, "PAUSED")}>
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </Button>
                      )}
                      {c.status === "PAUSED" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => handleStatus(c, "RUNNING")}>
                          <Play className="h-3.5 w-3.5" /> Reprendre
                        </Button>
                      )}
                      {(c.status === "RUNNING" || c.status === "PAUSED" || c.status === "SCHEDULED") && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-red-600" onClick={() => handleStatus(c, "CANCELLED")}>
                          <X className="h-3.5 w-3.5" /> Annuler
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                        {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Progress */}
                  {(c.status === "RUNNING" || c.status === "PAUSED" || c.status === "COMPLETED") && c.totalRecipients > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Envoi {c.sentCount} / {c.totalRecipients}</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                      <div className="flex gap-4 text-xs">
                        <span className="text-emerald-600">✓ {c.deliveredCount} livrés</span>
                        <span className="text-red-600">✗ {c.failedCount} échoués</span>
                        {c.sentCount > 0 && <span className="text-muted-foreground">Taux: {deliveryRate}%</span>}
                      </div>
                    </div>
                  )}

                  {c.status === "SCHEDULED" && c.scheduledAt && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> Programmée pour le {new Date(c.scheduledAt).toLocaleString("fr-FR")}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 5-step wizard */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" /> Nouvelle campagne</DialogTitle>
            <DialogDescription>5 étapes : audience → message → planification → relecture → lancement.</DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center justify-between mb-4">
            {WIZARD_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      isActive && "bg-primary text-primary-foreground",
                      isDone && "bg-emerald-500 text-white",
                      !isActive && !isDone && "bg-muted text-muted-foreground"
                    )}>
                      {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className="text-[9px] font-medium text-center">{s.label}</span>
                  </div>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div className={cn("flex-1 h-0.5 mx-2 -mt-4", isDone ? "bg-emerald-500" : "bg-muted")} />
                  )}
                </div>
              );
            })}
          </div>

          {wizardError && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
              <AlertCircle className="h-4 w-4" />{wizardError}
            </div>
          )}

          {/* Step 1: Audience */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom de la campagne *</Label>
                <Input value={wizard.name} onChange={(e) => setWizard({ ...wizard, name: e.target.value })} placeholder="Promo été 2026" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={wizard.description} onChange={(e) => setWizard({ ...wizard, description: e.target.value })} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Groupes destinataires *</Label>
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center rounded-md border">Aucun groupe. Créez-en un d'abord.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto rounded-md border">
                    {groups.map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 hover:bg-muted/50 last:border-0">
                        <input type="checkbox" checked={wizard.groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} className="h-4 w-4" />
                        <div className="h-3 w-3 rounded" style={{ background: g.color ?? "#3B82F6" }} />
                        <span className="text-sm font-medium flex-1">{g.name}</span>
                        <span className="text-xs text-muted-foreground">{g.memberCount} membres</span>
                      </label>
                    ))}
                  </div>
                )}
                {wizard.groupIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">Audience estimée : <span className="font-bold text-foreground">{audienceSize}</span> destinataires</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Message */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template (optionnel)</Label>
                <Select value={wizard.templateId || "none"} onValueChange={(v) => setWizard({ ...wizard, templateId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Aucun template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun (message personnalisé) —</SelectItem>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplate ? (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">Contenu du template</p>
                  <p className="text-sm font-mono whitespace-pre-wrap">{selectedTemplate.content}</p>
                  {selectedTemplate.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.variables.map((v) => <Badge key={v} variant="secondary" className="text-[9px] font-mono">{`{{${v}}}`}</Badge>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Message personnalisé *</Label>
                  <Textarea value={wizard.message} onChange={(e) => setWizard({ ...wizard, message: e.target.value })} rows={5} placeholder="Votre message..." className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">{wizard.message.length} caractères</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWizard({ ...wizard, scheduleNow: true })}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors",
                    wizard.scheduleNow ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <Send className="h-5 w-5" />
                  <p className="text-sm font-semibold">Envoyer maintenant</p>
                  <p className="text-xs text-muted-foreground">La campagne démarre immédiatement.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setWizard({ ...wizard, scheduleNow: false })}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors",
                    !wizard.scheduleNow ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <Calendar className="h-5 w-5" />
                  <p className="text-sm font-semibold">Programmer</p>
                  <p className="text-xs text-muted-foreground">Choisissez date et heure d'envoi.</p>
                </button>
              </div>
              {!wizard.scheduleNow && (
                <div className="space-y-2">
                  <Label>Date et heure *</Label>
                  <Input type="datetime-local" value={wizard.scheduledAt} onChange={(e) => setWizard({ ...wizard, scheduledAt: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Campagne</p>
                <p className="text-sm font-bold">{wizard.name}</p>
                {wizard.description && <p className="text-xs text-muted-foreground">{wizard.description}</p>}
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Audience</p>
                <div className="flex flex-wrap gap-1">
                  {groups.filter((g) => wizard.groupIds.includes(g.id)).map((g) => (
                    <Badge key={g.id} variant="secondary" className="text-[10px]">{g.name} ({g.memberCount})</Badge>
                  ))}
                </div>
                <p className="text-sm">Total : <span className="font-bold">{audienceSize}</span> destinataires</p>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Message</p>
                <p className="text-sm font-mono whitespace-pre-wrap bg-muted/30 rounded p-2">
                  {selectedTemplate ? selectedTemplate.content : wizard.message}
                </p>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Planification</p>
                <p className="text-sm">
                  {wizard.scheduleNow ? "Envoi immédiat" : `Programmée le ${new Date(wizard.scheduledAt).toLocaleString("fr-FR")}`}
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Launch */}
          {step === 5 && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <p className="text-lg font-bold">{wizard.scheduleNow ? "Prêt à lancer ?" : "Prêt à programmer ?"}</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Cette campagne enverra <span className="font-bold text-foreground">{audienceSize}</span> messages
                {wizard.scheduleNow ? " immédiatement." : ` le ${new Date(wizard.scheduledAt).toLocaleString("fr-FR")}.`}
              </p>
            </div>
          )}

          <Separator />
          <DialogFooter className="flex sm:justify-between">
            <Button variant="outline" onClick={() => step === 1 ? setShowWizard(false) : setStep(step - 1)} disabled={isSaving} className="gap-1.5">
              {step === 1 ? "Annuler" : <><ArrowLeft className="h-4 w-4" /> Précédent</>}
            </Button>
            {step < 5 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canGoNext()} className="gap-1.5">
                Suivant <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleLaunch} disabled={isSaving} className="gap-1.5">
                {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> ...</> : <><Rocket className="h-4 w-4" /> {wizard.scheduleNow ? "Lancer" : "Programmer"}</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!detailsCampaign} onOpenChange={(open) => { if (!open) setDetailsCampaign(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {activeCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4" /> {activeCampaign.name}
                  <Badge className={cn("text-[9px] border-0 gap-1", STATUS_META[activeCampaign.status].color)}>
                    {STATUS_META[activeCampaign.status].label}
                  </Badge>
                </DialogTitle>
                {activeCampaign.description && <DialogDescription>{activeCampaign.description}</DialogDescription>}
              </DialogHeader>

              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold">{activeCampaign.totalRecipients}</p>
                    <p className="text-[10px] text-muted-foreground">Destinataires</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold">{activeCampaign.sentCount}</p>
                    <p className="text-[10px] text-muted-foreground">Envoyés</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600">{activeCampaign.deliveredCount}</p>
                    <p className="text-[10px] text-muted-foreground">Livrés</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{activeCampaign.failedCount}</p>
                    <p className="text-[10px] text-muted-foreground">Échoués</p>
                  </div>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground">Créée le</p><p className="font-medium">{fmtDate(activeCampaign.createdAt)}</p></div>
                  <div><p className="text-muted-foreground">Démarrée le</p><p className="font-medium">{fmtDate(activeCampaign.startedAt)}</p></div>
                  <div><p className="text-muted-foreground">Programmée pour</p><p className="font-medium">{fmtDate(activeCampaign.scheduledAt)}</p></div>
                  <div><p className="text-muted-foreground">Terminée le</p><p className="font-medium">{fmtDate(activeCampaign.completedAt)}</p></div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeCampaign.groups.map((g) => <Badge key={g.id} variant="secondary" className="text-[9px]">{g.name}</Badge>)}
                  {activeCampaign.template && <Badge variant="outline" className="text-[9px]"><FileText className="h-2.5 w-2.5 mr-1" />{activeCampaign.template.name}</Badge>}
                </div>

                <Separator />

                {/* Messages + resend */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Messages ({campaignMessages.length})</p>
                  {activeCampaign.failedCount > 0 && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleResend} disabled={isResending}>
                      {isResending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Réenvoyer les échecs
                    </Button>
                  )}
                </div>

                {resendError && (
                  <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" />{resendError}
                  </div>
                )}

                {messagesLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : campaignMessages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Aucun message pour cette campagne.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Destinataire</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Statut</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">DLR</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Envoyé le</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignMessages.map((m) => (
                          <tr key={m.id} className="border-t">
                            <td className="px-3 py-1.5 font-mono">{m.destinationAddr}</td>
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className={cn("text-[9px]", MSG_STATUS_COLOR[m.status] ?? "")}>{m.status}</Badge>
                            </td>
                            <td className="px-3 py-1.5">
                              {m.dlrStatus ? <Badge variant="outline" className="text-[9px] font-mono">{m.dlrStatus}</Badge> : "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono">{fmtDate(m.sentAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
