import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + "..." : str;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    delivered: "text-emerald-600 bg-emerald-50 border-emerald-200",
    sent: "text-blue-600 bg-blue-50 border-blue-200",
    queued: "text-amber-600 bg-amber-50 border-amber-200",
    sending: "text-sky-600 bg-sky-50 border-sky-200",
    failed: "text-red-600 bg-red-50 border-red-200",
    expired: "text-gray-600 bg-gray-50 border-gray-200",
    rejected: "text-rose-600 bg-rose-50 border-rose-200",
    bound: "text-emerald-600 bg-emerald-50 border-emerald-200",
    connecting: "text-amber-600 bg-amber-50 border-amber-200",
    disconnected: "text-gray-600 bg-gray-50 border-gray-200",
    error: "text-red-600 bg-red-50 border-red-200",
    draft: "text-gray-600 bg-gray-50 border-gray-200",
    scheduled: "text-purple-600 bg-purple-50 border-purple-200",
    running: "text-blue-600 bg-blue-50 border-blue-200",
    paused: "text-amber-600 bg-amber-50 border-amber-200",
    completed: "text-emerald-600 bg-emerald-50 border-emerald-200",
    cancelled: "text-gray-600 bg-gray-50 border-gray-200",
  };
  return colors[status] ?? "text-gray-600 bg-gray-50 border-gray-200";
}
