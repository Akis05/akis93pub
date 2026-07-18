import "server-only";
import { sendSmsSchema, normalizePhone, type SendSmsInput } from "@/core/lib/validations";
import { requiresUnicode, computeSegments } from "@/core/lib/sms-encoding";
import { logger } from "@/core/lib/logger";
import prisma from "@/core/lib/prisma";
import { orgGuard } from "@/core/lib/auth/org-guard";
import { sendSmsViaBridge, getSmppStatusFromBridge, BridgeError } from "@/core/lib/bridge-client";
import type { SendSmsActionResult, CheckConnectionResult } from "../types";

/**
 * Read-only SMPP session check, proxied to the SMPP Bridge (the bridge holds
 * the actual SMPP session; this app never binds directly).
 */
export async function checkSmppConnection(connectorId: string): Promise<CheckConnectionResult> {
  const start = Date.now();
  try {
    const status = await getSmppStatusFromBridge();
    const latencyMs = Date.now() - start;

    if (!status.healthy || status.metrics.sessionState !== "bound") {
      return {
        success: false,
        status: "error",
        latencyMs,
        error: status.reason || `Session SMPP en état: ${status.metrics.sessionState}`,
      };
    }

    return { success: true, status: "bound", latencyMs };
  } catch (e) {
    return { success: false, status: "error", latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendSmsArgs extends SendSmsInput {
  connectorId: string;
  requestDlr: boolean;
}

/**
 * Enqueues an SMS through the SMPP Bridge (see smpp-bridge/), the same path
 * used by the public API (/api/sms/send). This form never sends directly
 * over SMPP, so the dashboard "send" page gets the same retry,
 * rate-limiting and dead-letter guarantees as the API, with a single
 * SmsMessage row per message.
 */
export async function sendSmsViaSmpp(input: SendSmsArgs): Promise<SendSmsActionResult> {
  const parsed = sendSmsSchema.safeParse({ to: normalizePhone(input.to), text: input.text, from: input.from });
  if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };

  const { to, text, from } = parsed.data;
  const unicode = requiresUnicode(text);
  const encoding = unicode ? "UCS2" : "GSM7";
  const segments = computeSegments(text, unicode);
  const sourceAddr = from?.trim() || process.env.SMPP_SOURCE_ADDR || process.env.SMPP_SYSTEM_ID || "GATEWAY";

  // Resolve the organization. Prefer the authenticated context; if it is
  // unavailable (e.g. cookie/session edge cases) fall back to the first
  // organization, consistent with the /api/sms/send route, so the message
  // is never silently dropped.
  const g = await orgGuard();
  let organizationId: string | null = g.ok ? g.ctx.organizationId : null;
  if (!organizationId) {
    logger.warn({ err: g.ok ? undefined : g.error }, "sendSmsViaSmpp: no auth context, falling back to first organization");
    const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
    organizationId = firstOrg?.id ?? null;
  }
  if (!organizationId) {
    return { success: false, error: "Aucune organisation configurée: impossible d'enregistrer le SMS." };
  }

  // Reject blacklisted destinations (opt-out), mirroring /api/sms/send.
  const optedOut = await prisma.contact.findFirst({
    where: { organizationId, phone: to, isBlacklisted: true, deletedAt: null },
    select: { id: true },
  });
  if (optedOut) {
    return { success: false, error: "Ce destinataire s'est désinscrit (blacklisté)." };
  }

  const msg = await prisma.smsMessage.create({
    data: {
      direction: "OUTBOUND",
      sourceAddr,
      destinationAddr: to,
      content: text,
      encoding,
      segments,
      status: "QUEUED",
      organizationId,
    },
    select: { id: true },
  });

  try {
    await sendSmsViaBridge({
      to,
      text,
      from: sourceAddr,
      requestDeliveryReceipt: input.requestDlr,
      externalId: msg.id,
      organizationId,
    });
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : (err as Error).message;
    logger.error({ err: message, messageId: msg.id }, "sendSmsViaSmpp: bridge enqueue failed");
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { status: "FAILED", dlrErrorCode: "ENQUEUE_FAILED" },
    });
    return { success: false, error: "Échec de la mise en file du SMS." };
  }

  logger.info({ messageId: msg.id, to, segments }, "SMS enqueued via dashboard send form");

  return {
    success: true,
    messageId: msg.id,
    segments,
    encoding,
    mode: "queued",
  };
}
