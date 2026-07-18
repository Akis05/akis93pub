import { SmppClient } from "./client.js";
import { loadSmppConfig, type SmppConfig } from "./config.js";
import { logger } from "../logger.js";
import type { SmppSessionState } from "../../types.js";

export const DEFAULT_SESSION_KEY = "__env__";

export interface SessionSnapshot {
  key: string;
  state: SmppSessionState;
  connected: boolean;
  host: string;
  port: number;
  systemId: string;
  bindMode: string;
  sourceAddr: string;
  tls: boolean;
}

class SmppSessionManager {
  private sessions = new Map<string, SmppClient>();
  private creating = new Set<string>();

  get(key: string = DEFAULT_SESSION_KEY): SmppClient | null {
    return this.sessions.get(key) ?? null;
  }

  has(key: string = DEFAULT_SESSION_KEY): boolean {
    return this.sessions.has(key);
  }

  getOrCreate(key: string = DEFAULT_SESSION_KEY, configOverride?: SmppConfig): SmppClient {
    const existing = this.sessions.get(key);
    if (existing) return existing;

    if (this.creating.has(key)) {
      const racing = this.sessions.get(key);
      if (racing) return racing;
    }

    this.creating.add(key);
    try {
      const config = configOverride ?? loadSmppConfig();
      const client = new SmppClient(config);
      this.sessions.set(key, client);
      logger.info(
        { key, host: config.SMPP_HOST, port: config.SMPP_PORT },
        "SMPP session created via SessionManager, initiating connection..."
      );
      if (key === DEFAULT_SESSION_KEY) {
        void import("./wire-delivery-receipts.js")
          .then(({ wireDeliveryReceiptHandling }) => wireDeliveryReceiptHandling())
          .catch((err) => logger.warn({ err: (err as Error).message }, "Failed to wire DLR handling on session create"));
      }
      client.connect();
      return client;
    } finally {
      this.creating.delete(key);
    }
  }

  async disconnect(key: string = DEFAULT_SESSION_KEY): Promise<boolean> {
    const client = this.sessions.get(key);
    if (!client) return false;
    try {
      await client.disconnect();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err, key }, "Error while disconnecting SMPP session");
    }
    this.sessions.delete(key);
    return true;
  }

  async disconnectAll(): Promise<void> {
    const keys = Array.from(this.sessions.keys());
    await Promise.all(keys.map((k) => this.disconnect(k)));
  }

  count(): number {
    return this.sessions.size;
  }

  boundCount(): number {
    let n = 0;
    for (const c of this.sessions.values()) if (c.getState() === "bound") n += 1;
    return n;
  }

  snapshot(): SessionSnapshot[] {
    const out: SessionSnapshot[] = [];
    for (const [key, client] of this.sessions.entries()) {
      const cfg = client.config;
      const state = client.getState();
      out.push({
        key,
        state,
        connected: state === "bound",
        host: cfg.SMPP_HOST,
        port: cfg.SMPP_PORT,
        systemId: cfg.SMPP_SYSTEM_ID,
        bindMode: cfg.SMPP_BIND_MODE,
        sourceAddr: cfg.SMPP_SOURCE_ADDR,
        tls: cfg.SMPP_USE_TLS,
      });
    }
    return out;
  }
}

export const sessionManager = new SmppSessionManager();
