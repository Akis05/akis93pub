import { logger } from "../logger.js";

export class SmppRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;
  private waitQueue: Array<() => void> = [];
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(maxTps?: number) {
    const tps = maxTps ?? Number(process.env.SMPP_MAX_TPS ?? 30);
    this.maxTokens = tps;
    this.tokens = tps;
    this.refillRate = tps / 1000;
    this.lastRefill = Date.now();
    this.refillTimer = setInterval(() => this.refill(), 50);
    logger.info({ maxTps: tps }, "SMPP rate limiter initialized");
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getWaitQueueSize(): number {
    return this.waitQueue.length;
  }

  destroy(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    for (const resolve of this.waitQueue) {
      resolve();
    }
    this.waitQueue = [];
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
      while (this.waitQueue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const resolve = this.waitQueue.shift()!;
        resolve();
      }
    }
  }
}

let _rateLimiter: SmppRateLimiter | null = null;

export function getRateLimiter(): SmppRateLimiter {
  if (!_rateLimiter) {
    _rateLimiter = new SmppRateLimiter();
  }
  return _rateLimiter;
}

export function destroyRateLimiter(): void {
  if (_rateLimiter) {
    _rateLimiter.destroy();
    _rateLimiter = null;
  }
}
