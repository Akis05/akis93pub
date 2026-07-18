"use client";

import { useEffect } from "react";
import { useSmppStatusStore, type SmppState, type SmppLiveSession } from "@/core/lib/smpp/smpp-status-store";

export type { SmppState, SmppLiveSession };

export interface SmppLiveStatus {
  state: SmppState;
  connected: boolean;
  host: string | null;
  port: number | null;
  systemId?: string;
  boundCount: number;
  count: number;
  sessions: SmppLiveSession[];
  loading: boolean;
}

/**
 * Reads the shared SMPP status store (single polling interval across the
 * whole app, see core/lib/smpp/smpp-status-store.ts) so every tab/component
 * using this hook stays in sync without spawning its own fetch loop.
 */
export function useSmppLiveStatus(): SmppLiveStatus {
  const subscribe = useSmppStatusStore((s) => s.subscribe);
  const state = useSmppStatusStore((s) => s.state);
  const connected = useSmppStatusStore((s) => s.connected);
  const host = useSmppStatusStore((s) => s.host);
  const port = useSmppStatusStore((s) => s.port);
  const systemId = useSmppStatusStore((s) => s.systemId);
  const boundCount = useSmppStatusStore((s) => s.boundCount);
  const count = useSmppStatusStore((s) => s.count);
  const sessions = useSmppStatusStore((s) => s.sessions);
  const loading = useSmppStatusStore((s) => s.loading);

  useEffect(() => subscribe(), [subscribe]);

  return { state, connected, host, port, systemId, boundCount, count, sessions, loading };
}
