import { TemplatesClient } from "./templates-client";
import { FileText } from "lucide-react";

export const metadata = {
  title: "Templates SMS — SMS Gateway Pro",
  description: "Gérez vos templates SMS avec variables dynamiques et preview en temps réel.",
};

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Templates SMS</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Templates réutilisables avec variables {`{{var}}`} et calcul de segments en direct.
        </p>
      </div>
      <TemplatesClient />
    </div>
  );
}
