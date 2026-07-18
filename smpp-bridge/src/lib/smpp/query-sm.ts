import { getSmppClient, waitForBound } from "./instance.js";
import { logger } from "../logger.js";

const MESSAGE_STATE: Record<number, string> = {
  0: "UNKNOWN",
  1: "ENROUTE",
  2: "DELIVERED",
  3: "EXPIRED",
  4: "DELETED",
  5: "UNDELIVERABLE",
  6: "ACCEPTED",
  7: "INVALID",
  8: "REJECTED",
};

export interface QuerySmResult {
  messageId: string;
  messageStateCode: number | null;
  messageState: string;
  delivered: boolean;
  errorCode: number | null;
  finalDate: string | null;
  supported: boolean;
}

const QUERY_UNSUPPORTED_CODES = new Set([0x67, 0x03, 0x0b]);

function parseCommandStatus(message: string): number | null {
  const m = message.match(/0x([0-9a-fA-F]+)/);
  return m ? parseInt(m[1]!, 16) : null;
}

export async function querySmsStatus(
  messageId: string,
  opts: { sourceAddr?: string } = {}
): Promise<QuerySmResult> {
  if (!messageId.trim()) {
    throw new Error("messageId is required");
  }

  await waitForBound();
  const client = getSmppClient();

  let pdu;
  try {
    pdu = await client.querySm(messageId, { sourceAddr: opts.sourceAddr });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = parseCommandStatus(message);
    if (code !== null && QUERY_UNSUPPORTED_CODES.has(code)) {
      logger.info({ messageId, code: `0x${code.toString(16)}` }, "query_sm not supported by SMSC");
      return {
        messageId,
        messageStateCode: null,
        messageState: "UNKNOWN",
        delivered: false,
        errorCode: code,
        finalDate: null,
        supported: false,
      };
    }
    throw err;
  }

  const stateCode = typeof pdu.message_state === "number" ? pdu.message_state : null;
  const errorCode = typeof pdu.error_code === "number" ? pdu.error_code : null;
  const finalDate = pdu.final_date ? String(pdu.final_date) : null;

  const result: QuerySmResult = {
    messageId,
    messageStateCode: stateCode,
    messageState: stateCode !== null ? (MESSAGE_STATE[stateCode] ?? "UNKNOWN") : "UNKNOWN",
    delivered: stateCode === 2,
    errorCode,
    finalDate,
    supported: true,
  };

  logger.info({ ...result }, "query_sm result");
  return result;
}
