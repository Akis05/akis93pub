import { listUsersAction } from "@/core/actions/users";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { data, error } = await listUsersAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilisateurs &amp; Rôles</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les membres de votre organisation, leurs rôles et permissions.
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <UsersClient initialUsers={data ?? []} />
      )}
    </div>
  );
}
