import "server-only";
import { logger } from "@/core/lib/logger";
import type { ReportFilters } from "@/core/features/reports/types";

/**
 * HTTP client for the SMPP Bridge (see smpp-bridge/). All SMPP + BullMQ
 * logic lives in that separate, persistently-running service (required
 * because Vercel serverless functions cannot hold a long-lived SMPP TCP
 * bind or run BullMQ workers). This module is the only place in the
 * frontend that talks to the bridge.
 */

export class BridgeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BridgeError";
  }
}

function bridgeUrl(path: string): string {
  const base = process.env.BRIDGE_URL;
  if (!base) throw new Error("BRIDGE_URL is not configured");
  return `${base.replace(/\/$/, "")}${path}`;
}

async function bridgeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.BRIDGE_API_KEY;
  if (!apiKey) throw new Error("BRIDGE_API_KEY is not configured");

  const res = await fetch(bridgeUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `Bridge request failed (${res.status})`;
    logger.warn({ path, status: res.status, message }, "Bridge request failed");
    throw new BridgeError(message, res.status);
  }

  return body as T;
}

// --- SMS ---

export interface BridgeSendSmsParams {
  to: string;
  text: string;
  from?: string;
  scheduledAt?: number;
  organizationId: string;
  requestDeliveryReceipt?: boolean;
  externalId?: string;
}

export interface BridgeSendSmsResult {
  jobId: string;
  segments: number;
  encoding: "GSM7" | "UCS2";
  scheduled: boolean;
}

export function sendSmsViaBridge(params: BridgeSendSmsParams): Promise<BridgeSendSmsResult> {
  return bridgeFetch("/api/v1/sms/send", { method: "POST", body: JSON.stringify(params) });
}

export interface BridgeBulkSmsParams {
  messages: Array<{ to: string; text: string; from?: string; externalId?: string }>;
  organizationId: string;
  scheduledAt?: number;
  requestDeliveryReceipt?: boolean;
}

export interface BridgeBulkSmsResult {
  total: number;
  enqueued: number;
  failed: number;
  results: Array<{ to: string; jobId: string; error?: string }>;
}

export function sendBulkSmsViaBridge(params: BridgeBulkSmsParams): Promise<BridgeBulkSmsResult> {
  return bridgeFetch("/api/v1/sms/bulk", { method: "POST", body: JSON.stringify(params) });
}

// --- SMPP session ---

export interface BridgeSmppSession {
  key: string;
  state: string;
  connected: boolean;
  host: string;
  port: number;
  systemId: string;
  bindMode: string;
  sourceAddr: string;
  tls: boolean;
}

export interface BridgeSmppStatus {
  sessions: BridgeSmppSession[];
  metrics: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalErrors: number;
    disconnections: number;
    sessionState: string;
  };
  healthy: boolean;
  reason?: string;
}

export function getSmppStatusFromBridge(): Promise<BridgeSmppStatus> {
  return bridgeFetch("/api/v1/smpp/status");
}

export function smppConnectViaBridge(): Promise<{ message: string; state: string }> {
  return bridgeFetch("/api/v1/smpp/connect", { method: "POST" });
}

export function smppDisconnectViaBridge(): Promise<{ message: string; disconnected: boolean }> {
  return bridgeFetch("/api/v1/smpp/disconnect", { method: "POST" });
}

export function smppRestartViaBridge(): Promise<{ message: string; state: string }> {
  return bridgeFetch("/api/v1/smpp/restart", { method: "POST" });
}

export interface BridgeQuerySmResult {
  messageId: string;
  messageStateCode: number | null;
  messageState: string;
  delivered: boolean;
  errorCode: number | null;
  finalDate: string | null;
  supported: boolean;
}

export function smppQueryViaBridge(messageId: string, from?: string): Promise<{ success: boolean; data: BridgeQuerySmResult }> {
  const params = new URLSearchParams({ id: messageId, ...(from ? { from } : {}) });
  return bridgeFetch(`/api/v1/smpp/query?${params.toString()}`);
}

export interface BridgeTestBindParams {
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType?: string;
  bindMode?: string;
  useTls?: boolean;
}

export interface BridgeTestBindResult {
  success: boolean;
  status: "bound" | "error" | "timeout";
  latencyMs: number;
  error?: string;
}

export function smppTestBindViaBridge(params: BridgeTestBindParams): Promise<BridgeTestBindResult> {
  return bridgeFetch("/api/v1/smpp/test-bind", { method: "POST", body: JSON.stringify(params) });
}

// --- Queue ---

export interface BridgeQueueStats {
  sms: Record<string, number>;
  campaign: Record<string, number>;
}

export function getQueueStatsFromBridge(): Promise<BridgeQueueStats> {
  return bridgeFetch("/api/v1/queue/stats");
}

export function retryQueueJobViaBridge(jobId: string): Promise<{ message: string; jobId: string }> {
  return bridgeFetch(`/api/v1/queue/retry/${encodeURIComponent(jobId)}`, { method: "POST" });
}

export function pauseQueueViaBridge(): Promise<{ message: string }> {
  return bridgeFetch("/api/v1/queue/pause", { method: "POST" });
}

export function resumeQueueViaBridge(): Promise<{ message: string }> {
  return bridgeFetch("/api/v1/queue/resume", { method: "POST" });
}

export function purgeQueueViaBridge(): Promise<{ message: string }> {
  return bridgeFetch("/api/v1/queue/purge", { method: "POST" });
}

// --- Campaigns ---

export interface BridgeCampaignChunk {
  campaignId: string;
  organizationId: string;
  message: string;
  sourceAddr: string;
  connectorId: string | null;
  recipients: Array<{ contactId: string; phone: string }>;
}

export function launchCampaignViaBridge(chunks: BridgeCampaignChunk[]): Promise<{ enqueuedChunks: number; totalChunks: number }> {
  return bridgeFetch("/api/v1/campaigns/launch", { method: "POST", body: JSON.stringify({ chunks }) });
}

export function cancelCampaignJobsViaBridge(campaignId: string): Promise<{ removed: number }> {
  return bridgeFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/cancel-jobs`, { method: "POST" });
}

// --- Webhooks ---

export function testWebhookDeliveryViaBridge(params: {
  webhookId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}): Promise<{ message: string }> {
  return bridgeFetch("/api/v1/webhooks/test-delivery", { method: "POST", body: JSON.stringify(params) });
}

// --- Scheduled reports ---

export interface BridgeScheduleReportParams {
  name: string;
  filters: ReportFilters;
  cron: string;
  recipients: string[];
  organizationId: string;
  userEmail: string;
}

export function scheduleReportViaBridge(params: BridgeScheduleReportParams): Promise<{ jobId: string }> {
  return bridgeFetch("/api/v1/reports/schedule", { method: "POST", body: JSON.stringify(params) });
}

export interface BridgeScheduledReport {
  id: string;
  name: string;
  cron: string | null;
  next: number | null;
  key: string;
}

export function listScheduledReportsFromBridge(): Promise<{ data: BridgeScheduledReport[] }> {
  return bridgeFetch("/api/v1/reports/scheduled");
}

export function cancelScheduledReportViaBridge(key: string): Promise<{ message: string }> {
  return bridgeFetch(`/api/v1/reports/scheduled/${encodeURIComponent(key)}`, { method: "DELETE" });
}
