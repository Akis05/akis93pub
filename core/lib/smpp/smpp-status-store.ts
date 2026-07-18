"use client";

import { create } from "zustand";

export type SmppState = "disconnected" | "connecting" | "binding" | "bound" | "unbinding" | "error";

export interface SmppLiveSession {
  key: string;
  state: SmppState;
  connected: boolean;
  host: string;
  port: number;
  systemId: string;
  bindMode?: string;
  sourceAddr?: string;
  tls?: boolean;
}

interface SmppStatusState {
  state: SmppState;
  connected: boolean;
  host: string | null;
  port: number | null;
  systemId?: string;
  bindMode?: string;
  sourceAddr?: string;
  sessions: SmppLiveSession[];
  count: number;
  boundCount: number;
  loading: boolean;
  subscribers: number;
  timer: ReturnType<typeof setInterval> | null;
  fetchStatus: () => Promise<void>;
  subscribe: (intervalMs?: number) => () => void;
}

const INTERVAL_MS = 10_000;

export const useSmppStatusStore = create<SmppStatusState>((set, get) => ({
  state: "disconnected",
  connected: false,
  host: null,
  port: null,
  sessions: [],
  count: 0,
  boundCount: 0,
  loading: true,
  subscribers: 0,
  timer: null,

  fetchStatus: async () => {
    try {
      const res = await fetch("/api/smpp/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      set({
        state: data.state ?? "disconnected",
        connected: !!data.connected,
        host: data.host ?? null,
        port: data.port ?? null,
        systemId: data.systemId,
        bindMode: data.bindMode,
        sourceAddr: data.sourceAddr,
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        count: data.count ?? 0,
        boundCount: data.boundCount ?? 0,
        loading: false,
      });
    } catch {
      set((s) => ({ ...s, state: "disconnected", connected: false, loading: false }));
    }
  },

  // One shared interval no matter how many components call subscribe().
  subscribe: (intervalMs = INTERVAL_MS) => {
    const { subscribers, timer, fetchStatus } = get();
    if (subscribers === 0 && !timer) {
      fetchStatus();
      const id = setInterval(() => get().fetchStatus(), intervalMs);
      set({ timer: id });
    }
    set({ subscribers: subscribers + 1 });

    return () => {
      const remaining = get().subscribers - 1;
      if (remaining <= 0) {
        const current = get().timer;
        if (current) clearInterval(current);
        set({ subscribers: 0, timer: null });
      } else {
        set({ subscribers: remaining });
      }
    };
  },
}));
