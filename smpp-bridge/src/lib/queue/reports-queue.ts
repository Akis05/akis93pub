import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.js";

export const SCHEDULED_REPORTS_QUEUE = "scheduled-reports";

let _reportsQueue: Queue | null = null;

export function reportsQueue(): Queue {
  if (!_reportsQueue) {
    _reportsQueue = new Queue(SCHEDULED_REPORTS_QUEUE, { connection: getRedisConnection() });
  }
  return _reportsQueue;
}
