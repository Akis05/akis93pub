declare module "smpp" {
  import { EventEmitter } from "node:events";

  interface ConnectOptions {
    host: string;
    port: number;
    tls?: boolean;
  }

  interface BindParams {
    system_id: string;
    password: string;
    system_type?: string;
    interface_version?: number;
    addr_ton?: number;
    addr_npi?: number;
  }

  interface SubmitSmParams {
    source_addr: string;
    destination_addr: string;
    short_message: string;
    data_coding?: number;
    registered_delivery?: number;
    esm_class?: number;
  }

  interface PDU {
    command_status: number;
    command_id?: number;
    sequence_number?: number;
    message_id?: string;
    source_addr?: string;
    destination_addr?: string;
    short_message?: string | Buffer;
    esm_class?: number;
    data_coding?: number;
    registered_delivery?: number;
    response: (params?: Record<string, unknown>) => void;
  }

  interface Session extends EventEmitter {
    bind_transceiver(params: BindParams, callback: (pdu: PDU) => void): void;
    bind_transmitter(params: BindParams, callback: (pdu: PDU) => void): void;
    bind_receiver(params: BindParams, callback: (pdu: PDU) => void): void;
    submit_sm(params: SubmitSmParams, callback: (pdu: PDU) => void): void;
    enquire_link(params: Record<string, unknown>, callback: (pdu: PDU) => void): void;
    unbind(callback: () => void): void;
    close(): void;
    [key: string]: unknown;
  }

  function connect(options: ConnectOptions, callback?: () => void): Session;

  export default { connect };
  export { Session, PDU, ConnectOptions, BindParams, SubmitSmParams };
}
