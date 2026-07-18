"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import { UserPlus, Shield, Ban, RotateCcw, Trash2 } from "lucide-react";
import {
  inviteUserAction, updateUserRoleAction, suspendUserAction,
  reactivateUserAction, deleteUserAction, type UserRow,
} from "@/core/actions/users";

const ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "DEVELOPER", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

function StatusBadge({ status }: { status: UserRow["status"] }) {
  const map = {
    ACTIVE: { label: "Actif", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    INVITED: { label: "Invité", className: "bg-amber-100 text-amber-700 border-amber-200" },
    SUSPENDED: { label: "Suspendu", className: "bg-red-100 text-red-700 border-red-200" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

export function UsersClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [openInvite, setOpenInvite] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("OPERATOR");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.email.toLowerCase().includes(q) ||
      (u.name?.toLowerCase().includes(q) ?? false) ||
      u.role.toLowerCase().includes(q)
    );
  });

  function refresh() { window.location.reload(); }

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const r = await inviteUserAction({ email: inviteEmail, name: inviteName, role: inviteRole });
      if (r.error) { setError(r.error); return; }
      setOpenInvite(false);
      setInviteEmail(""); setInviteName(""); setInviteRole("OPERATOR");
      refresh();
    });
  }

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      const r = await updateUserRoleAction({ userId, role });
      if (r.error) { setError(r.error); return; }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    });
  }

  function handleSuspend(userId: string) {
    startTransition(async () => {
      const r = await suspendUserAction(userId);
      if (r.error) { setError(r.error); return; }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: "SUSPENDED" } : u)));
    });
  }

  function handleReactivate(userId: string) {
    startTransition(async () => {
      const r = await reactivateUserAction(userId);
      if (r.error) { setError(r.error); return; }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: "ACTIVE" } : u)));
    });
  }

  function handleDelete(userId: string) {
    if (!confirm("Supprimer définitivement cet utilisateur ?")) return;
    startTransition(async () => {
      const r = await deleteUserAction(userId);
      if (r.error) { setError(r.error); return; }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Rechercher par email, nom, rôle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={openInvite} onOpenChange={setOpenInvite}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Inviter un utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un utilisateur</DialogTitle>
              <DialogDescription>
                Un email d&apos;invitation sera envoyé avec un lien valide 48h.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="invite-email">Email *</Label>
                <Input id="invite-email" type="email" value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div>
                <Label htmlFor="invite-name">Nom (optionnel)</Label>
                <Input id="invite-name" value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)} />
              </div>
              <div>
                <Label>Rôle</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenInvite(false)} disabled={pending}>
                Annuler
              </Button>
              <Button onClick={handleInvite} disabled={pending || !inviteEmail}>
                {pending ? "Envoi..." : "Envoyer l'invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && !openInvite && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Créé le</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun utilisateur.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{u.name ?? u.email}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)} disabled={pending}>
                      <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {u.status === "SUSPENDED" ? (
                        <Button variant="ghost" size="icon" title="Réactiver"
                          onClick={() => handleReactivate(u.id)} disabled={pending}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Suspendre"
                          onClick={() => handleSuspend(u.id)} disabled={pending}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Permissions" disabled>
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Supprimer"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(u.id)} disabled={pending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
