/**
 * Standardized result envelope used by every server action exposed by the
 * features modules. Routes (Hono) use HTTP status codes instead; both
 * layers agree on the same error shape via the `Result` type alias.
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: unknown };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function err(error: string, issues?: unknown): Result<never> {
  return { success: false, error, issues };
}

/**
 * Wraps an async server-side function so that thrown errors (Unauthorized,
 * Validation, etc.) are converted into a Result envelope instead of
 * bubbling up to the client.
 */
export async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const issues = e instanceof Error && "issues" in e ? (e as { issues?: unknown }).issues : undefined;
    return err(message, issues);
  }
}
