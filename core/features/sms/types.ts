export type SmsEncoding = "GSM7" | "UCS2";
export type SendMode = "queued";

export interface CheckConnectionResult {
  success: boolean;
  status: "bound" | "error" | "timeout";
  latencyMs?: number;
  error?: string;
}

export interface SendSmsActionResult {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  segments?: number;
  encoding?: SmsEncoding;
  error?: string;
  mode?: SendMode;
}
