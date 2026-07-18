import { SmppClient } from "./client.js";
import { DEFAULT_SESSION_KEY, sessionManager } from "./session-manager.js";

export function getSmppClient(): SmppClient {
  return sessionManager.getOrCreate(DEFAULT_SESSION_KEY);
}

export function getSmppClientIfExists(): SmppClient | null {
  return sessionManager.get(DEFAULT_SESSION_KEY);
}

export function resetSmppClient(): void {
  void sessionManager.disconnect(DEFAULT_SESSION_KEY);
}

export function waitForBound(timeoutMs = 10_000): Promise<void> {
  const client = getSmppClient();

  if (client.getState() === "bound") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener("bound", onBound);
      client.removeListener("error", onError);
      reject(new Error(`SMPP bind timeout after ${timeoutMs}ms (state: ${client.getState()})`));
    }, timeoutMs);

    function onBound() {
      clearTimeout(timeout);
      client.removeListener("error", onError);
      resolve();
    }

    function onError(err: Error) {
      clearTimeout(timeout);
      client.removeListener("bound", onBound);
      reject(new Error(`SMPP connection error while waiting for bind: ${err.message}`));
    }

    client.once("bound", onBound);
    client.once("error", onError);
  });
}
