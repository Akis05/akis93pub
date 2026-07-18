import { GroupsClient } from "./groups-client";
import { FolderOpen } from "lucide-react";

export const metadata = {
  title: "Groupes de contacts — SMS Gateway Pro",
  description: "Gérez vos groupes de contacts, statiques ou dynamiques avec règles de filtres.",
};

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Groupes de contacts</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Organisez vos contacts en groupes (statiques ou dynamiques) pour cibler vos campagnes.
        </p>
      </div>
      <GroupsClient />
    </div>
  );
}
