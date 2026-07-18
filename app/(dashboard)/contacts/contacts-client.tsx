"use client";

import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Separator } from "@/core/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/core/components/ui/dialog";
import {
  AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2,
  Plus, Search, Tag, Trash2, Upload, UserPlus, Users, X, XCircle, Edit,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  listContactsAction, createContactAction, deleteContactAction,
  importContactsAction, type ContactFormInput,
} from "@/core/actions/contacts";

interface Contact {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  tags: string[];
  isBlacklisted: boolean;
  createdAt: string;
}

export function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", tags: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();

  // Import state
  const [importData, setImportData] = useState<string[][]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMapping, setImportMapping] = useState({ phone: 0, firstName: 1, lastName: 2 });
  const [importResult, setImportResult] = useState<{ created: number; duplicates: number; errors: number } | null>(null);
  const [isImporting, startImport] = useTransition();

  async function loadContacts() {
    setLoading(true);
    const result = await listContactsAction();
    if (result.success) setContacts(result.data as unknown as Contact[]);
    setLoading(false);
  }

  useEffect(() => { loadContacts(); }, []);

  // All tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered contacts
  const filtered = useMemo(() => {
    let data = contacts;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((c) =>
        c.phone.includes(q) ||
        (c.firstName?.toLowerCase().includes(q)) ||
        (c.lastName?.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (tagFilter) data = data.filter((c) => c.tags.includes(tagFilter));
    return data;
  }, [contacts, search, tagFilter]);

  // Phone validation
  const phoneNormalized = form.phone.replace(/[\s\-().]/g, "");
  const phoneWithPlus = phoneNormalized.startsWith("+") ? phoneNormalized : `+${phoneNormalized}`;
  const phoneValid = /^\+[1-9]\d{6,14}$/.test(phoneWithPlus);

  // Duplicate detection
  const isDuplicate = useMemo(() => {
    if (!phoneValid) return false;
    return contacts.some((c) => c.phone === phoneWithPlus);
  }, [contacts, phoneWithPlus, phoneValid]);

  function handleCreate() {
    setCreateError(null);
    startCreate(async () => {
      const input: ContactFormInput = {
        phone: phoneWithPlus,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      const result = await createContactAction(input);
      if (result.success) {
        setShowCreate(false);
        setForm({ firstName: "", lastName: "", phone: "", tags: "" });
        await loadContacts();
      } else {
        setCreateError(result.error ?? "Erreur");
      }
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteContactAction(id);
    setDeletingId(null);
    await loadContacts();
  }

  // CSV/Excel file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      // Excel import
      import("xlsx").then((XLSX) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]!]!;
          const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
          setImportData(data.filter((row) => row.length > 0));
        };
        reader.readAsBinaryString(file);
      });
    } else {
      // CSV import
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const rows = text.split("\n").map((line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, "")));
        setImportData(rows.filter((row) => row.some((c) => c.length > 0)));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  }, []);

  function handleImport() {
    startImport(async () => {
      const rows = importData.slice(1); // skip header
      const contactsToImport = rows.map((row) => ({
        phone: row[importMapping.phone] ?? "",
        firstName: row[importMapping.firstName] ?? undefined,
        lastName: row[importMapping.lastName] ?? undefined,
      })).filter((c) => c.phone.length > 0);

      const result = await importContactsAction(contactsToImport);
      setImportResult(result);
      if (result.created > 0) await loadContacts();
    });
  }

  return (
    <>
      {/* Stats bar */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-lg font-bold">{contacts.length}</p><p className="text-xs text-muted-foreground">Total contacts</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Tag className="h-5 w-5 text-muted-foreground" /><div><p className="text-lg font-bold">{allTags.length}</p><p className="text-xs text-muted-foreground">Tags</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-lg font-bold">{contacts.filter((c) => !c.isBlacklisted).length}</p><p className="text-xs text-muted-foreground">Actifs</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><XCircle className="h-5 w-5 text-red-600" /><div><p className="text-lg font-bold">{contacts.filter((c) => c.isBlacklisted).length}</p><p className="text-xs text-muted-foreground">Blacklistés</p></div></CardContent></Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher par nom, téléphone, tag..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allTags.slice(0, 8).map((t) => (
                  <Badge key={t} variant={tagFilter === t ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setTagFilter(tagFilter === t ? null : t)}>{t}</Badge>
                ))}
              </div>
            )}
            {(search || tagFilter) && (
              <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => { setSearch(""); setTagFilter(null); }}><X className="h-3.5 w-3.5" /> Reset</Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowImport(true)}>
                <Upload className="h-3.5 w-3.5" /> Importer
              </Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowCreate(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Nouveau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-4 py-12">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{contacts.length === 0 ? "Aucun contact. Ajoutez-en ou importez un fichier." : "Aucun résultat pour cette recherche."}</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Nom</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Téléphone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tags</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Pays</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {(c.firstName?.[0] ?? "").toUpperCase()}{(c.lastName?.[0] ?? "").toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm">{c.phone}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] font-mono">{c.country ?? "—"}</Badge></td>
                      <td className="px-4 py-2.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                          {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              {filtered.length} contact{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Nouveau contact</DialogTitle>
            <DialogDescription>Ajoutez un contact avec validation E.164 automatique.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {createError && <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"><AlertCircle className="h-4 w-4" />{createError}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Prénom</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Ahmed" /></div>
              <div className="space-y-2"><Label>Nom</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Mohamed" /></div>
            </div>
            <div className="space-y-2">
              <Label>Téléphone (E.164)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+25377635543" inputMode="tel" className={cn(form.phone && !phoneValid && "border-red-500")} />
              {form.phone && !phoneValid && <p className="text-xs text-red-600">Format E.164 invalide (ex: +25377635543)</p>}
              {isDuplicate && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Ce numéro existe déjà dans vos contacts</p>}
            </div>
            <div className="space-y-2">
              <Label>Tags (séparés par des virgules)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="premium, vip, marketing" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={isCreating || !phoneValid || isDuplicate} className="gap-1.5">
              {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" /> Création...</> : <><Plus className="h-4 w-4" /> Créer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o) { setShowImport(false); setImportData([]); setImportResult(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Importer des contacts</DialogTitle>
            <DialogDescription>Importez un fichier CSV ou Excel. Mappez les colonnes puis validez.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 hover:bg-muted/50 transition-colors">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{importFileName || "Cliquez pour sélectionner un fichier CSV ou Excel"}</span>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
            </label>

            {importData.length > 0 && (
              <>
                <Separator />
                <p className="text-sm font-medium">Mapping des colonnes ({importData.length - 1} lignes)</p>
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium mb-1">En-têtes détectées :</p>
                  <div className="flex flex-wrap gap-1">
                    {importData[0]?.map((h, i) => <Badge key={i} variant="outline" className="text-[9px] font-mono">{i}: {h}</Badge>)}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["phone", "firstName", "lastName"] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">{field === "phone" ? "Téléphone *" : field === "firstName" ? "Prénom" : "Nom"}</Label>
                      <Input type="number" min={0} max={20} value={importMapping[field]} onChange={(e) => setImportMapping({ ...importMapping, [field]: parseInt(e.target.value) || 0 })} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Aperçu (3 premières lignes) :</p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50">
                      <th className="px-2 py-1 text-left">Tél.</th><th className="px-2 py-1 text-left">Prénom</th><th className="px-2 py-1 text-left">Nom</th>
                    </tr></thead>
                    <tbody>
                      {importData.slice(1, 4).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 font-mono">{row[importMapping.phone] ?? ""}</td>
                          <td className="px-2 py-1">{row[importMapping.firstName] ?? ""}</td>
                          <td className="px-2 py-1">{row[importMapping.lastName] ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {importResult && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <p className="text-sm font-medium">Résultat de l'import</p>
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-600">✓ {importResult.created} créés</span>
                  <span className="text-amber-600">↻ {importResult.duplicates} doublons</span>
                  <span className="text-red-600">✗ {importResult.errors} erreurs</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportData([]); setImportResult(null); }}>Fermer</Button>
            <Button onClick={handleImport} disabled={isImporting || importData.length < 2} className="gap-1.5">
              {isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Import...</> : <><Download className="h-4 w-4" /> Importer {importData.length > 1 ? `${importData.length - 1} contacts` : ""}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
