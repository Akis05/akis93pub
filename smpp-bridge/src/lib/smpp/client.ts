import * as smpp from "smpp";
import { EventEmitter } from "node:events";
import type { SmppConfig } from "./config.js";
import { logger } from "../logger.js";
import { getAlertManager } from "./alerts.js";
import type { SmppSessionState } from "../../types.js";

export class SmppClient extends EventEmitter {
  private session: smpp.Session | null = null;
  private state: SmppSessionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private enquireLinkTimer: NodeJS.Timeout | null = null;
  private enquireLinkResponseTimer: NodeJS.Timeout | null = null;
  private manuallyStopped = false;

  constructor(public readonly config: SmppConfig) {
    super();
  }

  getState(): SmppSessionState {
    return this.state;
  }

  connect(): void {
    this.manuallyStopped = false;
    logger.info(
      {
        systemId: this.config.SMPP_SYSTEM_ID, host: this.config.SMPP_HOST, port: this.config.SMPP_PORT,
        bindMode: this.config.SMPP_BIND_MODE, tls: this.config.SMPP_USE_TLS,
        ton: this.config.SMPP_ADDR_TON, npi: this.config.SMPP_ADDR_NPI,
      },
      "SMPP: connection starting"
    );
    this.openConnection();
  }

  async disconnect(): Promise<void> {
    this.manuallyStopped = true;
    this.clearTimers();
    if (this.session && this.state === "bound") {
      this.state = "unbinding";
      getAlertManager().recordSessionState("unbinding");
      logger.info("Sending SMPP unbind for graceful shutdown...");
      await new Promise<void>((resolve) => {
        const unbindTimeout = setTimeout(() => {
          logger.warn("Unbind timeout, forcing close");
          this.session?.close();
          resolve();
        }, 5000);
        this.session!.unbind(() => {
          clearTimeout(unbindTimeout);
          this.session?.close();
          resolve();
        });
      });
    } else {
      this.session?.close();
    }
    this.state = "disconnected";
    getAlertManager().recordSessionState("disconnected");
    logger.info("SMPP session disconnected cleanly");
  }

  getActiveSession(): smpp.Session {
    if (!this.session || this.state !== "bound") {
      throw new Error("SMPP session not active");
    }
    return this.session;
  }

  querySm(
    messageId: string,
    opts: { sourceAddr?: string; timeoutMs?: number } = {}
  ): Promise<smpp.PDU> {
    const session = this.getActiveSession();
    const timeoutMs = opts.timeoutMs ?? this.config.SMPP_SUBMIT_TIMEOUT_MS ?? 30_000;
    const sourceAddr = opts.sourceAddr ?? this.config.SMPP_SOURCE_ADDR;
    logger.info(
      { messageId, sourceAddr, ton: this.config.SMPP_ADDR_TON, npi: this.config.SMPP_ADDR_NPI },
      "SMPP: sending query_sm"
    );
    return new Promise<smpp.PDU>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("query_sm timeout")), timeoutMs);
      session.query_sm(
        {
          message_id: messageId,
          source_addr: sourceAddr,
          source_addr_ton: this.config.SMPP_ADDR_TON,
          source_addr_npi: this.config.SMPP_ADDR_NPI,
        },
        (pdu: smpp.PDU) => {
          clearTimeout(timer);
          if (pdu.command_status === 0) {
            resolve(pdu);
          } else {
            reject(new Error(`query_sm failed: 0x${pdu.command_status.toString(16)}`));
          }
        }
      );
    });
  }

  private openConnection(): void {
    this.state = "connecting";
    getAlertManager().recordSessionState("connecting");

    logger.info(
      { host: this.config.SMPP_HOST, port: this.config.SMPP_PORT, tls: this.config.SMPP_USE_TLS },
      "Connecting to SMSC..."
    );

    this.session = smpp.connect(
      {
        host: this.config.SMPP_HOST,
        port: this.config.SMPP_PORT,
        tls: this.config.SMPP_USE_TLS,
      },
      () => this.performBind()
    );

    this.session.on("error", (err: Error) => this.handleError(err));
    this.session.on("close", () => this.handleClose());
    this.session.on("deliver_sm", (pdu: smpp.PDU) => this.emit("deliver_sm", pdu));

    this.session.on("enquire_link", (pdu: smpp.PDU) => {
      this.session?.send(pdu.response());
    });

    this.session.on("enquire_link_resp", () => this.clearEnquireLinkResponseTimer());

    const socket = (this.session as unknown as { socket?: import("node:net").Socket }).socket;
    socket?.setKeepAlive?.(true, this.config.SMPP_ENQUIRE_LINK_INTERVAL_MS);
  }

  private performBind(): void {
    if (!this.session) return;
    this.state = "binding";
    getAlertManager().recordSessionState("binding");
    logger.info(
      { systemId: this.config.SMPP_SYSTEM_ID, systemType: this.config.SMPP_SYSTEM_TYPE, bindMode: this.config.SMPP_BIND_MODE },
      "SMPP: state -> BINDING"
    );

    const params = {
      system_id: this.config.SMPP_SYSTEM_ID,
      password: this.config.SMPP_PASSWORD,
      system_type: this.config.SMPP_SYSTEM_TYPE,
      interface_version: this.config.interfaceVersion,
      addr_ton: this.config.SMPP_ADDR_TON,
      addr_npi: this.config.SMPP_ADDR_NPI,
    };

    const method = this.config.SMPP_BIND_MODE === "transmitter" ? "bind_transmitter"
      : this.config.SMPP_BIND_MODE === "receiver" ? "bind_receiver" : "bind_transceiver";

    this.session[method](params, (pdu: smpp.PDU) => {
      if (pdu.command_status === 0) {
        this.state = "bound";
        this.reconnectAttempts = 0;
        getAlertManager().recordSessionState("bound");
        logger.info(
          { systemId: this.config.SMPP_SYSTEM_ID, host: this.config.SMPP_HOST, port: this.config.SMPP_PORT, bindMode: this.config.SMPP_BIND_MODE, tls: this.config.SMPP_USE_TLS },
          "SMPP session bound successfully"
        );
        this.startEnquireLink();
        this.emit("bound");
      } else {
        const errorHex = `0x${pdu.command_status.toString(16)}`;
        logger.error({ status: errorHex, systemId: this.config.SMPP_SYSTEM_ID }, "SMPP bind failed");
        getAlertManager().recordError(`Bind failed: ${errorHex}`);
        this.state = "error";
        getAlertManager().recordSessionState("error");
        this.session?.close();
      }
    });
  }

  private startEnquireLink(): void {
    this.clearEnquireLinkTimer();
    logger.info(
      { intervalMs: this.config.SMPP_ENQUIRE_LINK_INTERVAL_MS },
      "Starting enquire_link heartbeat"
    );
    this.enquireLinkTimer = setInterval(() => {
      if (this.session && this.state === "bound") {
        this.armEnquireLinkResponseTimeout();
        this.session.enquire_link({}, (pdu: smpp.PDU) => {
          this.clearEnquireLinkResponseTimer();
          if (pdu.command_status !== 0) {
            logger.warn({ status: pdu.command_status }, "Abnormal enquire_link response");
            getAlertManager().recordError(`enquire_link failed: 0x${pdu.command_status.toString(16)}`);
          }
        });
      }
    }, this.config.SMPP_ENQUIRE_LINK_INTERVAL_MS);
  }

  private armEnquireLinkResponseTimeout(): void {
    this.clearEnquireLinkResponseTimer();
    this.enquireLinkResponseTimer = setTimeout(() => {
      logger.warn("enquire_link timed out, forcing reconnect (dead link)");
      getAlertManager().recordError("enquire_link timeout (dead link)");
      this.session?.close();
    }, this.config.SMPP_ENQUIRE_LINK_INTERVAL_MS);
  }

  private handleError(err: Error): void {
    logger.error({ err: err.message }, "SMPP connection error");
    getAlertManager().recordError(err.message);
    this.state = "error";
    getAlertManager().recordSessionState("error");
    this.emit("error", err);
  }

  private handleClose(): void {
    logger.warn("SMPP connection closed");
    this.clearTimers();
    this.state = "disconnected";
    getAlertManager().recordDisconnection();
    getAlertManager().recordSessionState("disconnected");
    this.emit("disconnected");
    if (!this.manuallyStopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.config.SMPP_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      this.config.SMPP_RECONNECT_MAX_DELAY_MS
    );
    logger.info(
      { delay, attempt: this.reconnectAttempts, maxDelay: this.config.SMPP_RECONNECT_MAX_DELAY_MS },
      "Scheduling SMPP reconnect"
    );
    this.reconnectTimer = setTimeout(() => {
      if (!this.manuallyStopped) this.openConnection();
    }, delay);
  }

  private clearEnquireLinkTimer(): void {
    if (this.enquireLinkTimer) { clearInterval(this.enquireLinkTimer); this.enquireLinkTimer = null; }
  }

  private clearEnquireLinkResponseTimer(): void {
    if (this.enquireLinkResponseTimer) { clearTimeout(this.enquireLinkResponseTimer); this.enquireLinkResponseTimer = null; }
  }

  private clearTimers(): void {
    this.clearEnquireLinkTimer();
    this.clearEnquireLinkResponseTimer();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
