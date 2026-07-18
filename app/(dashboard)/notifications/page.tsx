import { listNotificationsAction } from "@/core/actions/notifications";
import { NotificationsClient } from "./notifications-client";
import { Bell } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const res = await listNotificationsAction({ limit: 100 });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Notifications in-app. Filtres : non lues / toutes. Marquer comme lu en un clic.
        </p>
      </div>
      {!res.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{res.error}</div>
      ) : (
        <NotificationsClient initial={res.data.map((n) => ({
          id: n.id, type: n.type, title: n.title, message: n.message,
          isRead: n.isRead, createdAt: n.createdAt.toISOString(),
        }))} unread={res.unread} />
      )}
    </div>
  );
}
