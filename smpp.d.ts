/**
 * TypeScript declaration file for the `smpp` npm package.
 * Place this file at: src/types/smpp.d.ts
 * (or anywhere covered by your tsconfig.json `typeRoots` / `include`)
 */

declare module "smpp" {
  import { EventEmitter } from "node:events";
  import type { TLSSocketOptions } from "node:tls";

  // ─── PDU ────────────────────────────────────────────────────────────────────

  export interface PDU {
    command: string;
    command_status: number;
    sequence_number: number;
    message_id?: string;

    // submit_sm / deliver_sm fields
    source_addr?: string;
    destination_addr?: string;
    short_message?: string | Buffer;
    message_payload?: string | Buffer;
    data_coding?: number;
    source_addr_ton?: number;
    source_addr_npi?: number;
    dest_addr_ton?: number;
    dest_addr_npi?: number;
    esm_class?: number;
    protocol_id?: number;
    priority_flag?: number;
    schedule_delivery_time?: string;
    validity_period?: string;
    registered_delivery?: number;
    replace_if_present_flag?: number;
    sm_length?: number;
    sm_default_msg_id?: number;

    // bind fields
    system_id?: string;
    password?: string;
    system_type?: string;
    interface_version?: number;
    addr_ton?: number;
    addr_npi?: number;
    address_range?: string;

    // query_sm
    message_state?: number;
    final_date?: string;
    error_code?: number;

    // TLVs and extra fields
    [key: string]: unknown;
  }

  // ─── Connect options ────────────────────────────────────────────────────────

  export interface ConnectOptions {
    url?: string;
    host?: string;
    port?: number;
    /** Enable TLS (connects with ssmpp://) */
    tls?: boolean | TLSSocketOptions;
    /** Send enquire_link every N ms automatically */
    auto_enquire_link_period?: number;
    debug?: boolean;
  }

  // ─── Bind params ────────────────────────────────────────────────────────────

  export interface BindParams {
    system_id?: string;
    password?: string;
    system_type?: string;
    interface_version?: number;
    addr_ton?: number;
    addr_npi?: number;
    address_range?: string;
  }

  // ─── SubmitSm params ────────────────────────────────────────────────────────

  export interface SubmitSmParams {
    source_addr?: string;
    destination_addr: string;
    short_message?: string | Buffer;
    message_payload?: string | Buffer;
    data_coding?: number;
    source_addr_ton?: number;
    source_addr_npi?: number;
    dest_addr_ton?: number;
    dest_addr_npi?: number;
    esm_class?: number;
    protocol_id?: number;
    priority_flag?: number;
    schedule_delivery_time?: string;
    validity_period?: string;
    registered_delivery?: number;
    replace_if_present_flag?: number;
    sm_default_msg_id?: number;
    [key: string]: unknown;
  }

  // ─── Session ────────────────────────────────────────────────────────────────

  export class Session extends EventEmitter {
    // ── Bind methods ──
    bind_transceiver(params: BindParams, callback?: (pdu: PDU) => void): void;
    bind_transmitter(params: BindParams, callback?: (pdu: PDU) => void): void;
    bind_receiver(params: BindParams, callback?: (pdu: PDU) => void): void;

    // ── Messaging ──
    submit_sm(params: SubmitSmParams, callback?: (pdu: PDU) => void): void;
    deliver_sm(params: Partial<SubmitSmParams>, callback?: (pdu: PDU) => void): void;
    query_sm(
      params: { message_id: string; source_addr?: string },
      callback?: (pdu: PDU) => void
    ): void;

    // ── Session management ──
    enquire_link(params: Record<string, unknown>, callback?: (pdu: PDU) => void): void;
    unbind(callback?: () => void): void;
    close(): void;
    pause(): void;
    resume(): void;

    // ── Generic PDU send ──
    send(pdu: PDU, callback?: (pdu: PDU) => void): void;

    // ── Events ──
    on(event: "connect", listener: () => void): this;
    on(event: "secureConnect", listener: () => void): this;
    on(event: "close", listener: (hadError: boolean) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "pdu", listener: (pdu: PDU) => void): this;
    on(event: "deliver_sm", listener: (pdu: PDU) => void): this;
    on(event: "submit_sm", listener: (pdu: PDU) => void): this;
    on(event: "bind_transceiver", listener: (pdu: PDU) => void): this;
    on(event: "bind_transmitter", listener: (pdu: PDU) => void): this;
    on(event: "bind_receiver", listener: (pdu: PDU) => void): this;
    on(event: "enquire_link", listener: (pdu: PDU) => void): this;
    on(event: "unbind", listener: (pdu: PDU) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  // ─── Server ─────────────────────────────────────────────────────────────────

  export interface ServerOptions {
    debug?: boolean;
    tls?: boolean | TLSSocketOptions;
  }

  export class Server extends EventEmitter {
    listen(port?: number, host?: string, callback?: () => void): void;
    close(callback?: () => void): void;
    on(event: "session", listener: (session: Session) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  // ─── Top-level API ──────────────────────────────────────────────────────────

  export function connect(options?: ConnectOptions, callback?: () => void): Session;
  export function connect(url: string, callback?: () => void): Session;

  export function createServer(
    options?: ServerOptions,
    listener?: (session: Session) => void
  ): Server;

  export function createServer(listener?: (session: Session) => void): Server;

  // PDU factory
  export class PDU {
    constructor(command: string, options?: Record<string, unknown>);
  }
}
