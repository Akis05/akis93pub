import {
  getBillingOverviewAction, listTransactionsAction, consumptionBreakdownAction,
} from "@/core/actions/billing";
import { BillingClient } from "./billing-client";
import { CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const [overview, transactions, breakdown] = await Promise.all([
    getBillingOverviewAction(),
    listTransactionsAction({ limit: 50 }),
    consumptionBreakdownAction({ days: 30 }),
  ]);

  if (!overview.ok) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {overview.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Facturation</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Solde, transactions, alertes de seuil et factures mensuelles.
        </p>
      </div>

      <BillingClient
        overview={overview.data}
        transactions={(transactions.ok ? transactions.data : []).map((t) => ({
          id: t.id, type: t.type, amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
          description: t.description, reference: t.reference,
          createdAt: t.createdAt.toISOString(),
        }))}
        breakdown={breakdown.ok ? breakdown.data : { campaigns: [], connectors: [] }}
      />
    </div>
  );
}
