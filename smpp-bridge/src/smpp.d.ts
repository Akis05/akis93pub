declare module "smpp" {
  import { EventEmitter } from "node:events";

  interface PDU extends EventEmitter {
    command_status: number;
    command_id: number;
    sequence_number: number;
    message_id?: string;
    short_message?: unknown;
    message_payload?: unknown;
    source_addr?: string;
    destination_addr?: string;
    esm_class?: number;
    message_state?: number;
    final_date?: string;
    error_code?: string;
    [key: string]: unknown;
    response(): PDU;
  }

  interface Session extends EventEmitter {
    submit_sm(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    query_sm(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    bind_transceiver(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    bind_transmitter(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    bind_receiver(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    enquire_link(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    unbind(callback: () => void): void;
    send(pdu: PDU): void;
    close(): void;
  }

  interface ConnectOptions {
    host: string;
    port: number;
    tls?: boolean;
  }

  function connect(options: ConnectOptions, callback: () => void): Session;
}
