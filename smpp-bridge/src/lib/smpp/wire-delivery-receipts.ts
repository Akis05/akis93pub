import { getSmppClient } from "./instance.js";
import { handleIncomingDeliverSm } from "./delivery-receipt.js";
import prisma from "../prisma.js";
import { logger } from "../logger.js";
import type { DlrStatus, MessageStatus } from "../../generated/prisma/client.js";

function dlrToMessageStatus(dlr: string): MessageStatus | null {
  switch (dlr) {
    case "DELIVRD": return "DELIVERED";
    case "UNDELIV": return "FAILED";
    case "EXPIRED": return "EXPIRED";
    case "REJECTD": return "REJECTED";
    case "ACCEPTD": return null;
    case "ENROUTE": return null;
    default: return null;
  }
}

const FINAL_DLR_STATES = new Set(["DELIVRD", "UNDELIV", "EXPIRED", "REJECTD"]);

function isFinalDlr(status: string): boolean {
  return FINAL_DLR_STATES.has(status);
}

function toStoredDlrStatus(status: string): DlrStatus {
  if (status === "ENROUTE") return "ACCEPTD" as DlrStatus;
  return status as DlrStatus;
}

const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "ARRET", "ARRÊT"];

function isOptOutMessage(text: string): boolean {
  const trimmed = text.trim().toUpperCase();
  return OPT_OUT_KEYWORDS.some((k) => trimmed === k || trimmed.startsWith(`${k} `));
}

function normalizeE164(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

let _wired = false;

export function wireDeliveryReceiptHandling(): void {
  if (_wired) return;
  const client = getSmppClient();
  _wired = true;
  logger.info("DLR handling wired on SMPP client");

  client.on("deliver_sm", (pdu) => {
    handleIncomingDeliverSm(
      pdu,
      () => {},
      async (dlr) => {
        try {
          const dlrId = dlr.messageId.trim();
          let target = await prisma.smsMessage.findFirst({
            where: {
              providerMessageId: { equals: dlrId, mode: "insensitive" },
            },
            select: { id: true, organizationId: true },
          });
          if (!target) {
            const stripped = dlrId.replace(/^0+/, "");
            if (stripped && stripped !== dlrId) {
              target = await prisma.smsMessage.findFirst({
                where: {
                  providerMessageId: { endsWith: stripped, mode: "insensitive" },
                },
                select: { id: true, organizationId: true },
              });
            }
          }
          if (!target) {
            logger.warn({ providerMessageId: dlrId, status: dlr.status }, "DLR received for unknown message");
            return;
          }

          const existing = await prisma.smsMessage.findUnique({
            where: { id: target.id },
            select: { dlrStatus: true, metadata: true },
          });
          const alreadyFinal = existing?.dlrStatus ? isFinalDlr(existing.dlrStatus) : false;
          const incomingFinal = isFinalDlr(dlr.status);
          const advance = incomingFinal || !alreadyFinal;

          const prevMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
          const prevHistory = Array.isArray((prevMeta as { dlrHistory?: unknown }).dlrHistory)
            ? ((prevMeta as { dlrHistory: Record<string, unknown>[] }).dlrHistory)
            : [];
          const dlrHistory: Record<string, unknown>[] = [
            ...prevHistory,
            { status: dlr.status, errorCode: dlr.errorCode ?? null, doneDate: dlr.doneDate, at: new Date().toISOString() },
          ];

          const newStatus = advance ? dlrToMessageStatus(dlr.status) : null;
          await prisma.smsMessage.update({
            where: { id: target.id },
            data: {
              ...(advance ? { dlrStatus: toStoredDlrStatus(dlr.status), dlrErrorCode: dlr.errorCode ?? null } : {}),
              dlrReceivedAt: new Date(),
              metadata: JSON.parse(JSON.stringify({ ...prevMeta, dlrHistory })),
              ...(newStatus ? { status: newStatus } : {}),
              ...(dlr.status === "DELIVRD" ? { deliveredAt: new Date() } : {}),
            },
          });
          logger.info(
            { messageId: target.id, dlrStatus: dlr.status, advanced: advance, final: incomingFinal },
            "DLR persisted"
          );
        } catch (err) {
          logger.error({ err: (err as Error).message }, "Failed to persist DLR");
        }
      },
      async (from, to, text) => {
        try {
          const senderId = await prisma.senderId.findFirst({
            where: { name: to, status: "APPROVED", deletedAt: null },
            select: { organizationId: true },
          });
          const organizationId = senderId?.organizationId
            ?? (await prisma.organization.findFirst({ select: { id: true } }))?.id;
          if (!organizationId) {
            logger.warn({ from, to }, "Inbound SMS dropped: no organization could be resolved");
            return;
          }

          const fromE164 = normalizeE164(from);

          await prisma.smsMessage.create({
            data: {
              direction: "INBOUND",
              sourceAddr: from,
              destinationAddr: to,
              content: text,
              status: "DELIVERED",
              organizationId,
            },
          });
          logger.info({ from, to }, "Inbound SMS persisted");

          if (isOptOutMessage(text)) {
            const contact = await prisma.contact.findFirst({
              where: { organizationId, phone: fromE164, deletedAt: null },
            });
            if (contact) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: { isBlacklisted: true },
              });
            } else {
              await prisma.contact.create({
                data: {
                  phone: fromE164,
                  isBlacklisted: true,
                  tags: ["opt-out"],
                  organizationId,
                },
              });
            }
            await prisma.auditLog.create({
              data: {
                action: "opt-out",
                entity: "contact",
                entityId: contact?.id ?? null,
                userEmail: "system:mo-stop",
                details: { phone: fromE164, keyword: text.trim().toUpperCase().split(/\s+/)[0] },
                organizationId,
              },
            });
            logger.warn({ phone: fromE164 }, "Contact opted out via STOP keyword");
          }
        } catch (err) {
          logger.error({ err: (err as Error).message }, "Failed to handle inbound SMS");
        }
      }
    );
  });
}
