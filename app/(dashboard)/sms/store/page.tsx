import { StoreClient } from "./store-client";
import { Database } from "lucide-react";

export const metadata = {
  title: "SMSC Store \u2014 SMS Gateway Pro",
  description: "Messages soumis au SMSC en attente d'un accus\u00e9 de r\u00e9ception final (store-and-forward).",
};

export default function StorePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SMSC Store</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Messages remis au SMSC et en attente d'un DLR final (store-and-forward). Un message reste ici tant que le SMSC ne renvoie pas DELIVRD, UNDELIV, EXPIRED ou REJECTD.
        </p>
      </div>
      <StoreClient />
    </div>
  );
}
