"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Badge } from "@/core/components/ui/badge";
import { RotateCcw } from "lucide-react";
import { toggleBlacklistAction } from "@/core/actions/contacts";

interface Row {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  updatedAt: string;
  tags: string[];
}

export function BlacklistClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.phone.includes(q) ||
      (r.firstName?.toLowerCase().includes(q) ?? false) ||
      (r.lastName?.toLowerCase().includes(q) ?? false)
    );
  });

  function handleUnblock(id: string) {
    if (!confirm("Retirer ce contact de la liste noire ?")) return;
    startTransition(async () => {
      const r = await toggleBlacklistAction(id, false);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setRows((prev) => prev.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Rechercher par numéro, nom..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Mis à jour</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun contact en liste noire.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono">{r.phone}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                      {r.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.updatedAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline" size="sm" className="gap-1.5"
                      onClick={() => handleUnblock(r.id)} disabled={pending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Débloquer
                    </Button>
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
