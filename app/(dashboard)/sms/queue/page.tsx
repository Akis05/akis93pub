import { QueueClient } from "./queue-client";
import { ListOrdered } from "lucide-react";

export const metadata = {
  title: "File d'attente \u2014 SMS Gateway Pro",
  description: "Monitoring de la file d'attente SMS avec actions pause / reprise / retry / purger.",
};

export default function QueuePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ListOrdered className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">File d'attente</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Messages en attente, en cours d'envoi et profondeur de file par connecteur.
        </p>
      </div>
      <QueueClient />
    </div>
  );
}
