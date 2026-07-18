import { getSmppClient, waitForBound } from "./instance.js";
import { logger } from "../logger.js";
import { getRateLimiter } from "./rate-limiter.js";
import { getAlertManager } from "./alerts.js";
import { requiresUnicode } from "../sms-encoding.js";
import pRetry from "p-retry";

export interface SendSmsParams {
  to: string;
  text: string;
  from?: string;
  requestDeliveryReceipt?: boolean;
}

export interface SendSmsResult {
  messageId: string;
  segments: number;
}

function validateE164(phone: string): void {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error(`Invalid destination number (E.164 required): ${phone}`);
  }
}

function validateMessageContent(text: string): void {
  if (!text || text.length === 0) {
    throw new Error("Message content cannot be empty");
  }
  if (text.length > 306) {
    throw new Error(`Message too long: ${text.length} chars (max 306, 2 segments)`);
  }
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  validateE164(params.to);
  validateMessageContent(params.text);

  await waitForBound();

  const client = getSmppClient();
  const config = client.config;
  const rateLimiter = getRateLimiter();
  const alerts = getAlertManager();
  const dataCoding = requiresUnicode(params.text) ? 8 : 0;

  await rateLimiter.acquire();

  return pRetry(
    () => new Promise<SendSmsResult>((resolve, reject) => {
      const session = client.getActiveSession();

      const timeout = setTimeout(() => {
        alerts.recordFailed("TIMEOUT");
        reject(new Error("SMSC submit_sm timeout"));
      }, config.SMPP_SUBMIT_TIMEOUT_MS);

      const destinationAddr = params.to.replace(/^\+/, "");

      logger.info(
        { from: params.from ?? config.SMPP_SOURCE_ADDR, to: destinationAddr, encoding: dataCoding === 8 ? "UCS2" : "GSM7", length: params.text.length },
        "SMPP: sending submit_sm"
      );

      session.submit_sm(
        {
          source_addr: params.from ?? config.SMPP_SOURCE_ADDR,
          source_addr_ton: config.SMPP_ADDR_TON,
          source_addr_npi: config.SMPP_ADDR_NPI,
          destination_addr: destinationAddr,
          dest_addr_ton: 1,
          dest_addr_npi: 1,
          short_message: params.text,
          data_coding: dataCoding,
          registered_delivery: params.requestDeliveryReceipt === false ? 0 : 1,
        },
        (pdu) => {
          clearTimeout(timeout);
          if (pdu.command_status === 0) {
            alerts.recordSent();
            logger.info(
              { messageId: pdu.message_id, to: params.to, encoding: dataCoding === 8 ? "UCS2" : "GSM7" },
              "SMS submitted successfully"
            );
            resolve({ messageId: pdu.message_id as string, segments: 1 });
          } else {
            const errorHex = `0x${pdu.command_status.toString(16)}`;
            alerts.recordFailed(errorHex);
            logger.error({ status: errorHex, to: params.to }, "SMS submit failed");
            reject(new Error(`submit_sm failed: ${errorHex}`));
          }
        }
      );
    }),
    {
      retries: 2,
      onFailedAttempt: (e) => {
        logger.warn(
          { attempt: e.attemptNumber, retriesLeft: e.retriesLeft, to: params.to },
          "SMS send retry"
        );
      },
    }
  );
}
