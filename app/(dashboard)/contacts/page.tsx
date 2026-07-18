import { ContactsClient } from "./contacts-client";
import { Users } from "lucide-react";

export const metadata = {
  title: "Contacts — SMS Gateway Pro",
  description: "Gérez vos contacts SMS avec validation E.164, import CSV et tags.",
};

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Gérez vos contacts, importez des fichiers CSV/Excel et organisez avec des tags.
        </p>
      </div>
      <ContactsClient />
    </div>
  );
}
