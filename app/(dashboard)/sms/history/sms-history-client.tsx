"use client";

import { useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type ColumnFiltersState,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Separator } from "@/core/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/core/components/ui/dialog";
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Download, Eye,
  FileSpreadsheet, FileText, Filter, MessageSquare, Search, X,
} from "lucide-react";
import { cn } from "@/core/lib/utils";

interface SerializedMessage {
  id: string;
  connectorId: string;
  campaignId?: string;
  direction: string;
  from: string;
  to: string;
  text: string;
  status: string;
  segments: number;
  providerMessageId?: string;
  errorCode?: string;
  dlrStatus?: string;
  dlrReceivedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  connectorName?: string | null;
  campaignName?: string | null;
}

interface Props {
  messages: SerializedMessage[];
  nextCursor?: string | null;
  statusCounts?: Record<string, number>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    sent: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    queued: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    sending: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
    failed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    expired: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
    rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", styles[status] ?? "")}>
      {status}
    </Badge>
  );
}

function DlrBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const styles: Record<string, string> = {
    DELIVRD: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    EXPIRED: "bg-gray-500/15 text-gray-600 border-gray-500/30",
    UNDELIV: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    REJECTD: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
    ACCEPTD: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    UNKNOWN: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  };
  return <Badge variant="outline" className={cn("text-[10px] font-mono", styles[status] ?? "")}>{status}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(iso));
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function SmsHistoryClient({ messages }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [selectedMessage, setSelectedMessage] = useState<SerializedMessage | null>(null);

  const filteredData = useMemo(() => {
    let data = messages;
    if (statusFilter !== "all") data = data.filter((m) => m.status === statusFilter);
    if (directionFilter !== "all") data = data.filter((m) => m.direction === directionFilter);
    return data;
  }, [messages, statusFilter, directionFilter]);

  const columns: ColumnDef<SerializedMessage>[] = useMemo(() => [
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <span className="text-xs font-mono tabular-nums">{formatShortDate(row.original.createdAt)}</span>,
    },
    {
      accessorKey: "direction",
      header: "Dir.",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px]">
          {row.original.direction === "outbound" ? "↑ OUT" : "↓ IN"}
        </Badge>
      ),
    },
    {
      accessorKey: "to",
      header: "Destinataire",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.to}</span>,
    },
    {
      accessorKey: "from",
      header: "Expéditeur",
      cell: ({ row }) => <span className="text-sm">{row.original.from}</span>,
    },
    {
      accessorKey: "text",
      header: "Message",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
          {row.original.text.length > 50 ? row.original.text.slice(0, 50) + "..." : row.original.text}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "dlrStatus",
      header: "DLR",
      cell: ({ row }) => <DlrBadge status={row.original.dlrStatus} />,
    },
    {
      accessorKey: "segments",
      header: "Seg.",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.segments}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedMessage(row.original)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  function exportCSV() {
    const rows = filteredData.map((m) => ({
      Date: formatDate(m.createdAt),
      Direction: m.direction,
      De: m.from,
      Vers: m.to,
      Message: m.text,
      Statut: m.status,
      DLR: m.dlrStatus ?? "",
      Segments: m.segments,
      "Envoyé le": formatDate(m.sentAt),
      "Livré le": formatDate(m.deliveredAt),
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    // Use xlsx library dynamically
    import("xlsx").then((XLSX) => {
      const rows = filteredData.map((m) => ({
        Date: formatDate(m.createdAt),
        Direction: m.direction,
        De: m.from,
        Vers: m.to,
        Message: m.text,
        Statut: m.status,
        DLR: m.dlrStatus ?? "",
        Segments: m.segments,
        "Envoyé le": formatDate(m.sentAt),
        "Livré le": formatDate(m.deliveredAt),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Historique SMS");
      XLSX.writeFile(wb, `sms-history-${new Date().toISOString().split("T")[0]}.xlsx`);
    });
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((m) => { counts[m.status] = (counts[m.status] ?? 0) + 1; });
    return counts;
  }, [messages]);

  return (
    <>
      {/* Stats bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {["delivered", "sent", "queued", "failed", "expired"].map((s) => (
          <Card key={s} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
            <CardContent className="flex items-center justify-between p-3">
              <span className="text-xs capitalize text-muted-foreground">{s}</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{statusCounts[s] ?? 0}</span>
                {statusFilter === s && <Badge variant="default" className="text-[9px] h-4 px-1">Filtré</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Export */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par numéro, message..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="outbound">Sortant</SelectItem>
                <SelectItem value="inbound">Entrant</SelectItem>
              </SelectContent>
            </Select>
            {(statusFilter !== "all" || directionFilter !== "all" || globalFilter) && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => { setStatusFilter("all"); setDirectionFilter("all"); setGlobalFilter(""); }}>
                <X className="h-3.5 w-3.5" /> Réinitialiser
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCSV}>
                <FileText className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/50">
                    {hg.headers.map((header) => (
                      <th key={header.id} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                      <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                      Aucun message trouvé
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedMessage(row.original)}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {filteredData.length} message{filteredData.length > 1 ? "s" : ""} • Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet (Dialog) */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => { if (!open) setSelectedMessage(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Détail du message
            </DialogTitle>
            <DialogDescription>Informations complètes et suivi DLR</DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              {/* Status + Direction */}
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedMessage.status} />
                <DlrBadge status={selectedMessage.dlrStatus} />
                <Badge variant="outline" className="text-[10px]">
                  {selectedMessage.direction === "outbound" ? "↑ Sortant" : "↓ Entrant"}
                </Badge>
              </div>

              {/* Message content */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm whitespace-pre-wrap">{selectedMessage.text}</p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Expéditeur</p>
                  <p className="font-medium">{selectedMessage.from}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Destinataire</p>
                  <p className="font-mono font-medium">{selectedMessage.to}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Segments</p>
                  <p className="font-mono">{selectedMessage.segments}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Connecteur</p>
                  <p className="font-mono text-xs">{selectedMessage.connectorId}</p>
                </div>
                {selectedMessage.providerMessageId && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Provider Message ID</p>
                    <p className="font-mono text-xs break-all">{selectedMessage.providerMessageId}</p>
                  </div>
                )}
                {selectedMessage.errorCode && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Code erreur</p>
                    <p className="font-mono text-xs text-red-600">{selectedMessage.errorCode}</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* DLR Timeline */}
              <div>
                <p className="text-sm font-medium mb-3">Timeline DLR</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium">Créé</p>
                      <p className="text-xs text-muted-foreground">{formatDate(selectedMessage.createdAt)}</p>
                    </div>
                  </div>
                  {selectedMessage.sentAt && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900">
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">2</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium">Envoyé</p>
                        <p className="text-xs text-muted-foreground">{formatDate(selectedMessage.sentAt)}</p>
                      </div>
                    </div>
                  )}
                  {selectedMessage.dlrReceivedAt && (
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        selectedMessage.dlrStatus === "DELIVRD" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-red-100 dark:bg-red-900"
                      )}>
                        <span className={cn(
                          "text-[10px] font-bold",
                          selectedMessage.dlrStatus === "DELIVRD" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        )}>3</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium">DLR reçu — {selectedMessage.dlrStatus}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(selectedMessage.dlrReceivedAt)}</p>
                      </div>
                    </div>
                  )}
                  {selectedMessage.deliveredAt && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium">Livré</p>
                        <p className="text-xs text-muted-foreground">{formatDate(selectedMessage.deliveredAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
