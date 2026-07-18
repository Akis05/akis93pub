import { BulkSmsClient } from "./bulk-sms-client";
import { MessageSquare } from "lucide-react";

export const metadata = {
  title: "SMS en masse — SMS Gateway Pro",
  description: "Envoyez des SMS en masse à plusieurs destinataires via SMPP.",
};

export default function BulkSmsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">SMS en masse</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Envoyez un même message à une liste de destinataires. Chaque SMS est enregistré dans l'historique et suivi via les DLR.
          </p>
        </div>
      </div>

      <BulkSmsClient />
    </div>
  );
}
