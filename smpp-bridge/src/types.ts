export type SmppBindMode = "transceiver" | "transmitter" | "receiver";

export type SmppSessionState =
  | "disconnected"
  | "connecting"
  | "binding"
  | "bound"
  | "unbinding"
  | "error";

export type DlrStatus = "DELIVRD" | "EXPIRED" | "UNDELIV" | "REJECTD" | "ACCEPTD" | "ENROUTE" | "UNKNOWN";

export interface SmppConnector {
  id: string;
  name: string;
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType: string;
  sourceAddr: string;
  bindMode: SmppBindMode;
  useTls: boolean;
  status: SmppSessionState;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedDeliveryReceipt {
  messageId: string;
  submitted: number;
  delivered: number;
  submitDate: string;
  doneDate: string;
  status: DlrStatus;
  errorCode: string;
}
