import pino from "pino";

/**
 * Pino logger with strict redaction of secrets. Any path listed below
 * will be replaced by [Redacted] in the emitted log line, regardless of
 * the depth at which it appears.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "*.password",
      "*.*.password",
      "api_key",
      "apiKey",
      "*.api_key",
      "*.apiKey",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "authorization",
      "*.authorization",
      "credentials",
      "*.credentials",
      "smpp.password",
      "connector.password",
      "*.connector.password",
      "webhook.secret",
    ],
    censor: "[Redacted]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
