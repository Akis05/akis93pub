import { logger } from "../logger.js";
import type { SmppSessionState } from "../../types.js";

interface SmppMetrics {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalErrors: number;
  disconnections: number;
  lastDisconnection: Date | null;
  lastError: string | null;
  sessionState: SmppSessionState;
  startedAt: Date;
  windowSent: number;
  windowFailed: number;
  windowStart: Date;
}

const ALERT_WINDOW_MS = 60_000;
const FAILURE_RATE_THRESHOLD = 0.15;
const DISCONNECTION_THRESHOLD = 5;
const RAPID_DISCONNECT_WINDOW_MS = 300_000;
const RAPID_DISCONNECT_THRESHOLD = 3;

class SmppAlertManager {
  private metrics: SmppMetrics;
  private recentDisconnections: Date[] = [];
  private windowResetTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.metrics = {
      totalSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalErrors: 0,
      disconnections: 0,
      lastDisconnection: null,
      lastError: null,
      sessionState: "disconnected",
      startedAt: new Date(),
      windowSent: 0,
      windowFailed: 0,
      windowStart: new Date(),
    };

    this.windowResetTimer = setInterval(() => {
      this.checkWindowAlerts();
      this.metrics.windowSent = 0;
      this.metrics.windowFailed = 0;
      this.metrics.windowStart = new Date();
    }, ALERT_WINDOW_MS);
  }

  recordSent(): void {
    this.metrics.totalSent++;
    this.metrics.windowSent++;
  }

  recordDelivered(): void {
    this.metrics.totalDelivered++;
  }

  recordFailed(errorCode?: string): void {
    this.metrics.totalFailed++;
    this.metrics.windowFailed++;
    this.metrics.lastError = errorCode ?? "unknown";
    logger.error(
      { totalFailed: this.metrics.totalFailed, errorCode, windowFailed: this.metrics.windowFailed },
      "SMS delivery failure recorded"
    );
  }

  recordError(error: string): void {
    this.metrics.totalErrors++;
    this.metrics.lastError = error;
    logger.error({ totalErrors: this.metrics.totalErrors, error }, "SMPP error recorded");
  }

  recordDisconnection(): void {
    const now = new Date();
    this.metrics.disconnections++;
    this.metrics.lastDisconnection = now;
    this.recentDisconnections.push(now);

    const cutoff = now.getTime() - RAPID_DISCONNECT_WINDOW_MS;
    this.recentDisconnections = this.recentDisconnections.filter(
      (d) => d.getTime() > cutoff
    );

    logger.warn(
      { totalDisconnections: this.metrics.disconnections, recentCount: this.recentDisconnections.length },
      "SMPP disconnection recorded"
    );

    if (this.recentDisconnections.length >= RAPID_DISCONNECT_THRESHOLD) {
      logger.fatal(
        {
          recentDisconnections: this.recentDisconnections.length,
          windowMinutes: RAPID_DISCONNECT_WINDOW_MS / 60000,
          threshold: RAPID_DISCONNECT_THRESHOLD,
        },
        "ALERT: Rapid SMPP disconnections detected - possible network instability"
      );
    }

    if (this.metrics.disconnections >= DISCONNECTION_THRESHOLD) {
      logger.fatal(
        { totalDisconnections: this.metrics.disconnections, threshold: DISCONNECTION_THRESHOLD },
        "ALERT: High total SMPP disconnection count"
      );
    }
  }

  recordSessionState(state: SmppSessionState): void {
    this.metrics.sessionState = state;
    logger.info({ state }, "SMPP session state changed");
  }

  private checkWindowAlerts(): void {
    if (this.metrics.windowSent === 0) return;
    const failureRate = this.metrics.windowFailed / this.metrics.windowSent;
    if (failureRate > FAILURE_RATE_THRESHOLD) {
      logger.fatal(
        {
          failureRate: `${(failureRate * 100).toFixed(1)}%`,
          windowSent: this.metrics.windowSent,
          windowFailed: this.metrics.windowFailed,
          threshold: `${(FAILURE_RATE_THRESHOLD * 100).toFixed(0)}%`,
        },
        "ALERT: SMS failure rate exceeds threshold"
      );
    }
    logger.info(
      {
        windowSent: this.metrics.windowSent,
        windowFailed: this.metrics.windowFailed,
        failureRate: `${(failureRate * 100).toFixed(1)}%`,
        totalSent: this.metrics.totalSent,
        totalDelivered: this.metrics.totalDelivered,
        sessionState: this.metrics.sessionState,
      },
      "SMPP metrics window summary"
    );
  }

  getMetrics(): SmppMetrics {
    return { ...this.metrics };
  }

  getHealthStatus(): { healthy: boolean; reason?: string } {
    if (this.metrics.sessionState !== "bound") {
      return { healthy: false, reason: `Session state: ${this.metrics.sessionState}` };
    }
    if (this.metrics.windowSent > 0) {
      const failureRate = this.metrics.windowFailed / this.metrics.windowSent;
      if (failureRate > FAILURE_RATE_THRESHOLD) {
        return { healthy: false, reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%` };
      }
    }
    return { healthy: true };
  }

  destroy(): void {
    if (this.windowResetTimer) {
      clearInterval(this.windowResetTimer);
      this.windowResetTimer = null;
    }
  }
}

let _alertManager: SmppAlertManager | null = null;

export function getAlertManager(): SmppAlertManager {
  if (!_alertManager) {
    _alertManager = new SmppAlertManager();
  }
  return _alertManager;
}

export function destroyAlertManager(): void {
  if (_alertManager) {
    _alertManager.destroy();
    _alertManager = null;
  }
}
