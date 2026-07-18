import IORedis, { type Redis, type RedisOptions } from "ioredis";
import type { ConnectionOptions } from "bullmq";
import { logger } from "../logger.js";

function buildRedisUrl(): string | null {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const u = new URL(upstashUrl);
      return `rediss://default:${upstashToken}@${u.hostname}:6379`;
    } catch {
      logger.warn("Invalid UPSTASH_REDIS_REST_URL, falling back to localhost");
    }
  }
  return null;
}

const REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
};

let _redis: Redis | null = null;

function createRedis(): Redis {
  const url = buildRedisUrl();
  const client = url
    ? new IORedis(url, REDIS_OPTIONS)
    : new IORedis({
        host: process.env.REDIS_HOST ?? "127.0.0.1",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
        ...REDIS_OPTIONS,
      });

  client.on("connect", () => logger.info("Redis: TCP connected"));
  client.on("ready", () => logger.info("Redis: ready"));
  client.on("error", (err) => logger.error({ err: err.message }, "Redis error"));
  client.on("close", () => logger.warn("Redis: connection closed"));

  return client;
}

export function getRedisConnection(): ConnectionOptions {
  if (!_redis) {
    _redis = createRedis();
  }
  return _redis as unknown as ConnectionOptions;
}

export function getRedisClient(): Redis {
  if (!_redis) {
    _redis = createRedis();
  }
  return _redis;
}
