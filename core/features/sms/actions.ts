"use server";

import { revalidatePath } from "next/cache";
import type { SendSmsInput } from "@/core/lib/validations";
import { checkSmppConnection, sendSmsViaSmpp } from "./queries/send-sms";
import type { CheckConnectionResult, SendSmsActionResult } from "./types";

export async function checkSmppConnectionAction(connectorId: string): Promise<CheckConnectionResult> {
  return checkSmppConnection(connectorId);
}

export async function sendSmsAction(
  input: SendSmsInput & { connectorId: string; requestDlr: boolean }
): Promise<SendSmsActionResult> {
  const res = await sendSmsViaSmpp(input);
  if (res.success) {
    revalidatePath("/sms/history");
    revalidatePath("/sms/dlr");
    revalidatePath("/");
  }
  return res;
}
