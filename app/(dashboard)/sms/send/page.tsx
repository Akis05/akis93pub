import { SmsSendClient } from "./sms-send-client";
import { Send } from "lucide-react";

export const metadata = {
  title: "Envoi SMS — SMS Gateway Pro",
  description: "Envoyez des SMS simples, en masse ou programmés via SMPP.",
};

export default function SendSmsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Envoi SMS</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Envoyez un SMS simple, en masse ou programmez un envoi différé via vos connecteurs SMPP.
          </p>
        </div>
      </div>

      <SmsSendClient />
    </div>
  );
}
