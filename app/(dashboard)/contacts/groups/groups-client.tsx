"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Textarea } from "@/core/components/ui/textarea";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Switch } from "@/core/components/ui/switch";
import { Separator } from "@/core/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/core/components/ui/dialog";
import {
  AlertCircle, Edit, FolderOpen, Loader2, Plus, Search, Trash2, Users, UserPlus, X, Filter, Sparkles,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import {
  listGroupsAction, createGroupAction, updateGroupAction, deleteGroupAction,
  getGroupMembersAction, addMembersToGroupAction, removeMembersFromGroupAction,
  type GroupFormInput,
} from "@/core/actions/groups";
import { listContactsAction } from "@/core/actions/contacts";

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isDynamic: boolean;
  dynamicRules: unknown;
  memberCount: number;
  createdAt: string | Date;
}

interface Contact {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  tags?: string[];
}

const PALETTE = ["#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#06B6D4"];

// Dynamic rule schema (simple): { tagsAny: string[], country?: string }
interface DynamicRules {
  tagsAny?: string[];
  country?: string;
}

export function GroupsClient() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Members dialog
  const [membersGroup, setMembersGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [membersSearch, setMembersSearch] = useState("");
  const [isUpdatingMembers, startMembers] = useTransition();

  // Form state
  const [form, setForm] = useState({
    name: "", description: "", color: PALETTE[0]!, isDynamic: false,
    rules: { tagsAny: "", country: "" } as { tagsAny: string; country: string },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  async function loadGroups() {
    setLoading(true);
    const result = await listGroupsAction();
    if (result.success) setGroups(result.data as unknown as Group[]);
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) =>
      g.name.toLowerCase().includes(q) || (g.description?.toLowerCase().includes(q) ?? false)
    );
  }, [groups, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: PALETTE[0]!, isDynamic: false, rules: { tagsAny: "", country: "" } });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(g: Group) {
    setEditing(g);
    const rules = (g.dynamicRules ?? {}) as DynamicRules;
    setForm({
      name: g.name,
      description: g.description ?? "",
      color: g.color ?? PALETTE[0]!,
      isDynamic: g.isDynamic,
      rules: {
        tagsAny: (rules.tagsAny ?? []).join(", "),
        country: rules.country ?? "",
      },
    });
    setFormError(null);
    setShowForm(true);
  }

  function handleSave() {
    setFormError(null);
    startSave(async () => {
      const dynamicRules: DynamicRules | null = form.isDynamic
        ? {
            tagsAny: form.rules.tagsAny ? form.rules.tagsAny.split(",").map((t) => t.trim()).filter(Boolean) : [],
            country: form.rules.country || undefined,
          }
        : null;
      const input: GroupFormInput = {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
        isDynamic: form.isDynamic,
        dynamicRules: dynamicRules as Record<string, unknown> | null,
      };
      const result = editing
        ? await updateGroupAction(editing.id, input)
        : await createGroupAction(input);
      if (result.success) {
        setShowForm(false);
        await loadGroups();
      } else {
        setFormError(result.error ?? "Erreur");
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce groupe ?")) return;
    setDeletingId(id);
    await deleteGroupAction(id);
    setDeletingId(null);
    await loadGroups();
  }

  async function openMembers(g: Group) {
    setMembersGroup(g);
    setSelectedIds(new Set());
    setMembersSearch("");
    const [m, c] = await Promise.all([getGroupMembersAction(g.id), listContactsAction()]);
    if (m.success) setMembers(m.data as unknown as Contact[]);
    if (c.success) setAllContacts(c.data as unknown as Contact[]);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const availableContacts = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    let pool = allContacts.filter((c) => !memberIds.has(c.id));
    if (membersSearch) {
      const q = membersSearch.toLowerCase();
      pool = pool.filter((c) =>
        c.phone.includes(q) ||
        (c.firstName?.toLowerCase().includes(q) ?? false) ||
        (c.lastName?.toLowerCase().includes(q) ?? false)
      );
    }
    return pool.slice(0, 200);
  }, [allContacts, members, membersSearch]);

  function handleAddMembers() {
    if (!membersGroup || selectedIds.size === 0) return;
    startMembers(async () => {
      await addMembersToGroupAction(membersGroup.id, Array.from(selectedIds));
      const m = await getGroupMembersAction(membersGroup.id);
      if (m.success) setMembers(m.data as unknown as Contact[]);
      setSelectedIds(new Set());
      await loadGroups();
    });
  }

  function handleRemoveMember(contactId: string) {
    if (!membersGroup) return;
    startMembers(async () => {
      await removeMembersFromGroupAction(membersGroup.id, [contactId]);
      const m = await getGroupMembersAction(membersGroup.id);
      if (m.success) setMembers(m.data as unknown as Contact[]);
      await loadGroups();
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
              <Input placeholder="Rechercher un groupe..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Nouveau groupe
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-4 py-12">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{groups.length === 0 ? "Aucun groupe. Créez-en un." : "Aucun résultat."}</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.id} className="group relative overflow-hidden">
              <div className="absolute left-0 top-0 h-1 w-full" style={{ background: g.color ?? "#3B82F6" }} />
              <CardContent className="p-4 pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: (g.color ?? "#3B82F6") + "22" }}>
                      <FolderOpen className="h-4 w-4" style={{ color: g.color ?? "#3B82F6" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{g.description ?? "—"}</p>
                    </div>
                  </div>
                  {g.isDynamic && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-[9px]">
                      <Sparkles className="h-2.5 w-2.5" /> Dynamique
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{g.memberCount}</span> membre{g.memberCount !== 1 ? "s" : ""}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openMembers(g)} disabled={g.isDynamic} title={g.isDynamic ? "Groupe dynamique" : "Gérer les membres"}>
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(g)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => handleDelete(g.id)} disabled={deletingId === g.id}>
                      {deletingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> {editing ? "Modifier le groupe" : "Nouveau groupe"}
            </DialogTitle>
            <DialogDescription>Définissez un nom, une couleur et, si besoin, des règles dynamiques.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />{formError}
              </div>
            )}
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VIP Clients" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description du groupe..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={cn(
                      "h-7 w-7 rounded-md border-2 transition-all",
                      form.color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Groupe dynamique</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Les membres sont calculés selon des règles.</p>
              </div>
              <Switch checked={form.isDynamic} onCheckedChange={(v) => setForm({ ...form, isDynamic: v })} />
            </div>
            {form.isDynamic && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Filter className="h-3.5 w-3.5" /> Règles de filtres
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tags (l'un de, séparés par virgule)</Label>
                  <Input value={form.rules.tagsAny} onChange={(e) => setForm({ ...form, rules: { ...form.rules, tagsAny: e.target.value } })} placeholder="premium, vip" className="h-8 text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Pays (code ISO)</Label>
                  <Input value={form.rules.country} onChange={(e) => setForm({ ...form, rules: { ...form.rules, country: e.target.value.toUpperCase() } })} placeholder="DJ" maxLength={2} className="h-8 text-xs" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.name.trim()} className="gap-1.5">
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> ...</> : <><Plus className="h-4 w-4" /> {editing ? "Mettre à jour" : "Créer"}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersGroup} onOpenChange={(o) => { if (!o) setMembersGroup(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Membres — {membersGroup?.name}
            </DialogTitle>
            <DialogDescription>{members.length} membre{members.length !== 1 ? "s" : ""} • Ajoutez ou retirez des contacts.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current members */}
            <div>
              <p className="text-xs font-medium mb-2">Membres actuels</p>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Aucun membre.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{m.phone}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleRemoveMember(m.id)} disabled={isUpdatingMembers}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Add contacts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium">Ajouter des contacts</p>
                <p className="text-xs text-muted-foreground">{selectedIds.size} sélectionné{selectedIds.size !== 1 ? "s" : ""}</p>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher un contact..." value={membersSearch} onChange={(e) => setMembersSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border">
                {availableContacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Aucun contact disponible.</p>
                ) : (
                  availableContacts.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 hover:bg-muted/50 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{c.phone}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersGroup(null)}>Fermer</Button>
            <Button onClick={handleAddMembers} disabled={isUpdatingMembers || selectedIds.size === 0} className="gap-1.5">
              {isUpdatingMembers ? <><Loader2 className="h-4 w-4 animate-spin" /> ...</> : <><UserPlus className="h-4 w-4" /> Ajouter ({selectedIds.size})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
