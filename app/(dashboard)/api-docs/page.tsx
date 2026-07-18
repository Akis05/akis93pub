import { BookOpen } from "lucide-react";
import { ApiDocsClient } from "./api-docs-client";

export const metadata = {
  title: "API Documentation — SMS Gateway Pro",
  description: "Documentation complète de l'API REST SMS Gateway Pro.",
};

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Documentation complète de l'API REST. Utilisez ces endpoints avec Postman,
            cURL ou tout client HTTP.
          </p>
        </div>
      </div>

      <ApiDocsClient />
    </div>
  );
}
