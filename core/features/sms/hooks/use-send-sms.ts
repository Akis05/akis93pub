"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SendSmsBody } from "../zod/send-sms";
import type { CheckConnectionResult, SendSmsActionResult } from "../types";

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation<SendSmsActionResult, Error, SendSmsBody>({
    mutationFn: async (body) => {
      const res = await fetch("/api/v1/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "send failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms", "history"] });
      qc.invalidateQueries({ queryKey: ["sms", "dlr"] });
    },
  });
}

export function useCheckSmppConnection(connectorId: string | null) {
  return useQuery<CheckConnectionResult>({
    queryKey: ["sms", "check", connectorId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/sms/check/${connectorId}`);
      if (!res.ok) throw new Error("check failed");
      return res.json();
    },
    enabled: !!connectorId,
    staleTime: 5_000,
  });
}
