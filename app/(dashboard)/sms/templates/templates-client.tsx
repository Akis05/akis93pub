"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Textarea } from "@/core/components/ui/textarea";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Switch } from "@/core/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/core/components/ui/dialog";
import {
  AlertCircle, Edit, Eye, FileText, Loader2, Plus, Search, Trash2, X,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  listTemplatesAction, createTemplateAction, updateTemplateAction,
  deleteTemplateAction, type TemplateFormInput,
} from "@/core/actions/templates";

type Category = "OTP" | "MARKETING" | "TRANSACTIONAL" | "ALERT" | "NOTIFICATION";

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
  category: Category;
  isActive: boolean;
  createdAt: string | Date;
}

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: "TRANSACTIONAL", label: "Transactionnel", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  { value: "MARKETING", label: "Marketing", color: "bg-pink-500/10 text-pink-700 dark:text-pink-400" },
  { value: "OTP", label: "OTP", color: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  { value: "ALERT", label: "Alerte", color: "bg-red-500/10 text-red-700 dark:text-red-400" },
  { value: "NOTIFICATION", label: "Notification", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
];

// Detect GSM-7 vs UCS-2 + segment count
const GSM_BASIC = /^[A-Za-z0-9 \r\n@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\u00d8\u00f8\u00c5\u00e5\u00c6\u00e6\u00df\u00c9!"#%&'()*+,\-./:;<=>?\u00a1\u00c4\u00d6\u00d1\u00dc\u00a7\u00bf\u00e4\u00f6\u00f1\u00fc\u00e0\u20ac^{}\\[\]~|]*$/;

function analyzeMessage(text: string): { encoding: "GSM7" | "UCS2"; length: number; segments: number; max: number } {
  const isGsm = GSM_BASIC.test(text);
  const length = text.length;
  if (isGsm) {
    if (length <= 160) return { encoding: "GSM7", length, segments: 1, max: 160 };
    return { encoding: "GSM7", length, segments: Math.ceil(length / 153), max: 153 };
  }
  if (length <= 70) return { encoding: "UCS2", length, segments: 1, max: 70 };
  return { encoding: "UCS2", length, segments: Math.ceil(length / 67), max: 67 };
}

function extractVariables(content: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) set.add(m[1]!);
  return Array.from(set);
}

function renderTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => values[k] ?? `{{${k}}}`);
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", content: "", category: "TRANSACTIONAL" as Category, isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  async function load() {
    setLoading(true);
    const result = await listTemplatesAction();
    if (result.success) setTemplates(result.data as unknown as Template[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = templates;
    if (categoryFilter !== "ALL") data = data.filter((t) => t.category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
    }
    return data;
  }, [templates, search, categoryFilter]);

  // Live analysis of the current draft
  const liveVars = useMemo(() => extractVariables(form.content), [form.content]);
  const liveAnalysis = useMemo(() => analyzeMessage(form.content), [form.content]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", content: "", category: "TRANSACTIONAL", isActive: true });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({ name: t.name, content: t.content, category: t.category, isActive: t.isActive });
    setFormError(null);
    setShowForm(true);
  }

  function openPreview(t: Template) {
    setPreviewing(t);
    const defaults: Record<string, string> = {};
    t.variables.forEach((v) => { defaults[v] = `[${v}]`; });
    setPreviewValues(defaults);
  }

  function handleSave() {
    setFormError(null);
    startSave(async () => {
      const input: TemplateFormInput = {
        name: form.name,
        content: form.content,
        category: form.category,
        isActive: form.isActive,
      };
      const result = editing
        ? await updateTemplateAction(editing.id, input)
        : await createTemplateAction(input);
      if (result.success) {
        setShowForm(false);
        await load();
      } else {
        setFormError(result.error ?? "Erreur");
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce template ?")) return;
    setDeletingId(id);
    await deleteTemplateAction(id);
    setDeletingId(null);
    await load();
  }

  const previewRendered = previewing ? renderTemplate(previewing.content, previewValues) : "";
  const previewAnalysis = previewing ? analyzeMessage(previewRendered) : null;

  return (
    <>
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher un template..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={categoryFilter === "ALL" ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setCategoryFilter("ALL")}>Tous</Badge>
              {CATEGORIES.map((c) => (
                <Badge key={c.value} variant={categoryFilter === c.value ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setCategoryFilter(c.value)}>{c.label}</Badge>
              ))}
            </div>
            <div className="ml-auto">
              <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Nouveau template
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
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{templates.length === 0 ? "Aucun template. Créez-en un." : "Aucun résultat."}</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const cat = CATEGORIES.find((c) => c.value === t.category)!;
            const analysis = analyzeMessage(t.content);
            return (
              <Card key={t.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.name}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Badge className={cn("text-[9px] border-0", cat.color)}>{cat.label}</Badge>
                        {!t.isActive && <Badge variant="outline" className="text-[9px]">Inactif</Badge>}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 font-mono bg-muted/30 rounded p-2 flex-1 min-h-[3.5rem]">{t.content}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.variables.slice(0, 4).map((v) => (
                      <Badge key={v} variant="secondary" className="text-[9px] font-mono">{`{{${v}}}`}</Badge>
                    ))}
                    {t.variables.length > 4 && <Badge variant="outline" className="text-[9px]">+{t.variables.length - 4}</Badge>}
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {analysis.encoding} • {analysis.segments} seg • {analysis.length} car
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openPreview(t)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(t)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}>
                        {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> {editing ? "Modifier le template" : "Nouveau template"}
            </DialogTitle>
            <DialogDescription>Utilisez {`{{variable}}`} pour insérer des champs dynamiques.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />{formError}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bienvenue OTP" />
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contenu *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Bonjour {{firstName}}, votre code est {{code}}. Valide 5 min."
                rows={5}
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-mono">{liveAnalysis.encoding}</span> •
                  <span className="ml-1">{liveAnalysis.length} car</span> •
                  <span className="ml-1 font-medium text-foreground">{liveAnalysis.segments} segment{liveAnalysis.segments > 1 ? "s" : ""}</span>
                </span>
                {liveVars.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {liveVars.map((v) => <Badge key={v} variant="secondary" className="text-[9px] font-mono">{`{{${v}}}`}</Badge>)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Template actif</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Désactivez pour le masquer dans les sélecteurs.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.name.trim() || !form.content.trim()} className="gap-1.5">
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> ...</> : <><Plus className="h-4 w-4" /> {editing ? "Mettre à jour" : "Créer"}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewing} onOpenChange={(o) => { if (!o) setPreviewing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Preview — {previewing?.name}</DialogTitle>
            <DialogDescription>Renseignez les variables pour prévisualiser le rendu.</DialogDescription>
          </DialogHeader>
          {previewing && (
            <div className="space-y-4">
              {previewing.variables.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {previewing.variables.map((v) => (
                    <div key={v} className="space-y-1">
                      <Label className="text-xs font-mono">{`{{${v}}}`}</Label>
                      <Input
                        value={previewValues[v] ?? ""}
                        onChange={(e) => setPreviewValues({ ...previewValues, [v]: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Rendu</p>
                <p className="whitespace-pre-wrap text-sm">{previewRendered}</p>
              </div>
              {previewAnalysis && (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <Badge variant="outline" className="font-mono">{previewAnalysis.encoding}</Badge>
                  <span className="text-muted-foreground">{previewAnalysis.length} / {previewAnalysis.max} car</span>
                  <span className="font-medium">{previewAnalysis.segments} segment{previewAnalysis.segments > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
