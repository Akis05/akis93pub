"use client";

import { useState, useTransition } from "react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Save } from "lucide-react";
import { updateOrganizationSettingsAction } from "@/core/actions/settings";

const TIMEZONES = [
  "Africa/Djibouti", "Africa/Nairobi", "Africa/Addis_Ababa",
  "Europe/Paris", "Europe/London", "America/New_York",
  "Asia/Dubai", "Asia/Riyadh", "UTC",
];

interface Init { name: string; slug: string; logo: string | null; timezone: string; }

export function SettingsClient({ initial }: { initial: Init }) {
  const [name, setName] = useState(initial.name);
  const [logo, setLogo] = useState(initial.logo ?? "");
  const [timezone, setTimezone] = useState(initial.timezone);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateOrganizationSettingsAction({ name, logo: logo || null, timezone });
      if (!r.ok) setMsg({ error: r.error });
      else setMsg({ ok: "Param\u00e8tres enregistr\u00e9s." });
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Organisation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Slug</Label><Input value={initial.slug} disabled /></div>
        </div>
        <div><Label>Logo (URL)</Label><Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://..." /></div>
        <div>
          <Label>Fuseau horaire</Label>
          <select className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={timezone}
            onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        {msg?.error && <p className="text-sm text-destructive">{msg.error}</p>}
        {msg?.ok && <p className="text-sm text-emerald-600">{msg.ok}</p>}
        <div className="pt-2">
          <Button onClick={handleSave} disabled={pending || !name.trim()} className="gap-2">
            <Save className="h-4 w-4" /> Sauvegarder
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
