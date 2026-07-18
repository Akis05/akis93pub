import { logger } from "../logger.js";
import type { PDU } from "smpp";
import type { ParsedDeliveryReceipt } from "../../types.js";

const DLR_REGEX = /id:(\S+)\s+sub:(\d+)\s+dlvrd:(\d+)\s+submit date:(\d+)\s+done date:(\d+)\s+stat:(\w+)\s+err:(\w+)/;

export function extractMessageText(pdu: PDU): string {
  const fromField = (value: unknown): string | null => {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) {
      const latin1 = value.toString("latin1");
      if (DLR_REGEX.test(latin1)) return latin1;
      const utf8 = value.toString("utf8");
      if (DLR_REGEX.test(utf8)) return utf8;
      return latin1 || utf8 || value.toString("ascii");
    }
    if (typeof value === "string") return value;
    if (typeof value === "object" && "message" in (value as Record<string, unknown>)) {
      return fromField((value as { message: unknown }).message);
    }
    return null;
  };

  const fromShort = fromField(pdu.short_message);
  if (fromShort && fromShort.length > 0) return fromShort;

  const fromPayload = fromField(pdu.message_payload);
  if (fromPayload && fromPayload.length > 0) return fromPayload;

  return "";
}

export function isDeliveryReceipt(pdu: PDU): boolean {
  const esmClass = (pdu.esm_class as number) ?? 0;
  return (esmClass & 0x04) !== 0 || DLR_REGEX.test(extractMessageText(pdu));
}

export function parseDeliveryReceipt(pdu: PDU): ParsedDeliveryReceipt | null {
  const text = extractMessageText(pdu);
  const match = text.match(DLR_REGEX);
  if (!match) return null;
  const [, messageId, sub, dlvrd, submitDate, doneDate, stat, err] = match;
  return {
    messageId: messageId!, submitted: Number(sub), delivered: Number(dlvrd),
    submitDate: submitDate!, doneDate: doneDate!,
    status: (["DELIVRD", "EXPIRED", "UNDELIV", "REJECTD", "ACCEPTD", "ENROUTE"].includes(stat!) ? stat! : "UNKNOWN") as ParsedDeliveryReceipt["status"],
    errorCode: err!,
  };
}

export async function handleIncomingDeliverSm(
  pdu: PDU,
  respond: (status: number) => void,
  onDlr: (dlr: ParsedDeliveryReceipt) => Promise<void>,
  onInbound: (from: string, to: string, text: string) => Promise<void>
): Promise<void> {
  const messageText = extractMessageText(pdu);

  logger.debug(
    { esmClass: `0x${((pdu.esm_class as number) ?? 0).toString(16)}`, from: pdu.source_addr, to: pdu.destination_addr, text: messageText, pdu },
    "deliver_sm received"
  );

  try {
    if (isDeliveryReceipt(pdu)) {
      const dlr = parseDeliveryReceipt(pdu);
      if (dlr) {
        logger.info({ dlr }, "DLR received");
        await onDlr(dlr);
      } else {
        logger.warn({ rawMessageText: messageText }, "Unparseable DLR received");
      }
    } else {
      logger.info({ from: pdu.source_addr, to: pdu.destination_addr }, "Inbound SMS (MO) received");
      await onInbound(String(pdu.source_addr), String(pdu.destination_addr), messageText);
    }
    respond(0);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Error processing deliver_sm");
    respond(0);
  }
}
