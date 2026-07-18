# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SMS Gateway Pro** — a multi-tenant SMS gateway/CPaaS. `package.json` name is `sms-gateway-pro`. It is now split into **two separate services** that must both be running for SMS to actually flow:

1. **Main app** (repo root): Next.js 15 (App Router) + Prisma/PostgreSQL (Supabase-hosted). Dashboard UI, Server Actions, RBAC, billing, campaigns, templates, contacts, webhooks config, etc. Designed to be stateless/serverless-deployable (Vercel).
2. **`smpp-bridge/`**: a standalone, always-on Node.js service holding the actual persistent SMPP TCP bind to the upstream SMSC and running the BullMQ workers (SMS send, campaigns, webhooks). Exists because a persistent SMPP session and long-running BullMQ workers cannot live in Vercel serverless functions. The main app talks to it over authenticated HTTP via `core/lib/bridge-client.ts`; it does not import `smpp`/`bullmq`/`ioredis` itself anymore.

Ignore the top-level `architecture` file and `SMS_Gateway_Pro_Plan_Ajuste.md` — they describe an aspirational/different multi-module ERP ("Akis Store") with a Hono-catch-all API, i18n, RBAC route arrays, etc. that does **not** match this codebase. Trust the code. `akisSp.md` is the working plan/checklist for the bridge-extraction migration itself (phases, what's done vs. pending) — check it for the current migration status before assuming bridge work is finished. `Infrastructure.md` is the companion Phase 3 runbook for `akisSp.md` (deploying the bridge behind a Cloudflare Tunnel, on-prem vs VPS options) — it documents the procedure, not a completed deployment; don't assume production infra exists because this file does. `upgradeAkis.md` and `akisMap.md` are proposal/historical-audit docs, not authoritative on current behavior — verify anything from them against the code. `akisSM.md` is a one-off diagnostic (French) about redundant SMPP-status polling that was already fixed by the Zustand store described below — historical, not a pending task.

## Commands

### Main app (repo root)

```bash
pnpm dev              # next dev --turbopack
pnpm build            # next build
pnpm lint             # next lint
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm test:e2e         # playwright test (no playwright config/tests currently exist)

pnpm db:generate      # prisma generate -> app/generated/prisma (main-app generator)
pnpm db:migrate       # prisma migrate dev
pnpm db:studio        # prisma studio
pnpm db:seed          # tsx prisma/seed.ts
```

### SMPP bridge (`smpp-bridge/`)

```bash
cd smpp-bridge
pnpm dev              # tsx watch --env-file=.env src/index.ts
pnpm start            # node --env-file=.env --import tsx/esm src/index.ts
pnpm build            # tsc
pnpm typecheck        # tsc --noEmit
pnpm db:generate      # prisma generate --schema=../prisma/schema.prisma --generator=bridge
```

Both services must be running locally for SMS to actually send: start `smpp-bridge` first (it owns the SMPP bind), then the main app. Check `http://localhost:3001/health` for bridge status. Unlike Next.js, the bridge is a plain Node/tsx process and does **not** auto-load `.env` — its scripts rely on Node's native `--env-file` flag (Node 20.6+), so `smpp-bridge/.env` must exist there (it's a separate file from the root `.env`, though `BRIDGE_API_KEY` must match between them).

Package manager is **pnpm workspaces** (`pnpm-workspace.yaml` lists `smpp-bridge` as a member package); don't use npm/yarn lockfiles. Root `package.json`'s scripts only cover the main app — there's no root-level script that starts both services at once.

Test coverage is minimal — only these files exist, don't assume coverage elsewhere: `core/lib/__tests__/sms-encoding.test.ts`, `core/lib/__tests__/validations.test.ts`, `core/lib/crypto/__tests__/aes.test.ts`. (The former `core/lib/smpp/__tests__/` suite moved with the SMPP code into `smpp-bridge/` and is not currently ported.) There's no Playwright config despite the `test:e2e` script.

## Environment / secrets

- **No `.env.example` exists anywhere in this repo** (root or `smpp-bridge/`) — `.env*` is fully gitignored (`.gitignore`) and neither file has ever been committed. Don't tell a user to "check `.env.example`"; instead grep `process.env\.` in the relevant package to find what's actually read.
- Main app vars (from actual usage, not a documented list): Supabase (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), `DATABASE_URL`, `SECRETS_ENCRYPTION_KEY`/`SECRETS_ENCRYPTION_SALT` (`core/lib/crypto/aes.ts` — unused by the send path, see Known gaps), `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `BRIDGE_URL`/`BRIDGE_API_KEY` (`core/lib/bridge-client.ts`). It does **not** import `smpp`/`bullmq`/`ioredis`, but it still reads several `SMPP_*` vars directly (`SMPP_HOST`, `SMPP_PORT`, `SMPP_SYSTEM_ID`, `SMPP_PASSWORD`, `SMPP_SYSTEM_TYPE`, `SMPP_SOURCE_ADDR`, ...) in `core/actions/connectors.ts` and `core/actions/dashboard.ts`, purely read-only to render the ".env connector" UI card, and in `core/features/sms/queries/send-sms.ts` to default the `from` address — so the main app's own `.env` needs these mirrored from the bridge's, not just `BRIDGE_URL`/`BRIDGE_API_KEY`.
- Bridge vars (from actual usage): `BRIDGE_PORT`/`BRIDGE_API_KEY`/`NODE_ENV` (validated by `smpp-bridge/src/env.ts`'s zod schema), `DATABASE_URL`, `LOG_LEVEL`, `SMPP_MAX_TPS`, `SMS_WORKER_CONCURRENCY`/`CAMPAIGN_WORKER_CONCURRENCY`/`WEBHOOKS_WORKER_CONCURRENCY`, and Redis creds (`smpp-bridge/src/lib/queue/redis.ts` accepts `REDIS_URL`, or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or discrete `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`). The full `SMPP_*` bind config (host/port/system id/password/bind mode/TLS/enquire-link interval) lives in `smpp-bridge/src/lib/smpp/config.ts`, not in `env.ts`.
- `BRIDGE_API_KEY` must be identical in both `.env` files — it's a shared bearer-token secret, not a per-service one.
- `core/lib/logger.ts` (pino) auto-redacts common secret-shaped fields (`password`, `token`, `secret`, `authorization`, `smpp.password`, `webhook.secret`, ...) — still avoid logging raw payloads that might contain credentials. `smpp-bridge/src/lib/logger.ts` is a separate pino instance with the same intent.

## Architecture

### Layers, top to bottom (main app)

```
app/(dashboard)/**/*-client.tsx   Client components (useState/useTransition + direct Server Action calls, forms)
core/actions/*.ts                 "use server" Server Actions — thin wrappers, RBAC-gated
core/lib/bridge-client.ts         HTTP client to smpp-bridge/ — the only place the frontend talks to it
core/lib/*                        Prisma, auth guards, crypto, misc utils (no SMPP/BullMQ code anymore)
prisma/schema.prisma              Data model (PostgreSQL via @prisma/adapter-pg), shared by both services
```

Data fetching in client components is plain `useState`/`useTransition` calling Server Actions directly (e.g. `startTransition(async () => { const r = await someAction(...); })`) — **not** React Query, despite `@tanstack/react-query` being in `package.json`; it's an unused dependency, don't assume it's wired up anywhere.

Cross-component **shared client state** (e.g. polling status that multiple components need in sync) uses **Zustand** (`core/lib/smpp/smpp-status-store.ts` is the reference implementation: one `setInterval` gated by a `subscribers` refcount, shared via `create()`, instead of each component running its own polling loop — it polls the main app's `/api/smpp/status` route, which proxies to the bridge). Follow this pattern rather than adding another independent `setInterval` when several components need the same polled data.

`app/api/**/route.ts` are plain Next.js Route Handlers (not a Hono catch-all despite `hono` being a dependency in the bridge). **`core/features/sms/`** is a partially-migrated, feature-first module (routes/queries/zod/hooks) built on a small Hono sub-app (`core/features/_shared/hono.ts`) — it is not mounted by any `app/api` route today. `core/actions/sms.ts` is a re-export shim pointing at `core/features/sms/actions.ts`; that's the only part of `core/features/sms` actually wired into the app. Don't assume new API surface should follow the Hono pattern in the main app — match whichever of the two the surrounding code already uses. (The bridge itself, `smpp-bridge/src/index.ts`, *is* a real Hono app — that's a separate service with its own conventions, see below.)

### Multi-tenancy

Every domain row carries `organizationId` (UUID). All Prisma queries must filter by it — there is no RLS/DB-level isolation, so a missing `organizationId` filter is a cross-tenant data leak. Soft-delete via `deletedAt: null` is used almost everywhere; don't hard-delete domain rows.

### Auth (two independent mechanisms, main app only)

1. **Supabase session (dashboard UI + Server Actions)**: `core/lib/auth/org-guard.ts#orgGuard()` resolves the Supabase JWT → looks up the matching Prisma `User` (`supabaseUserId`) → returns `{ userId, organizationId, role, permissions, email }`. `core/lib/auth/role-guard.ts#requirePermission()/requireRole()` wrap it; `SUPER_ADMIN` bypasses all permission checks. `assertSameOrg()` throws on cross-org access.
2. **API tokens (external API — `/api/sms/send`, `/api/sms/status`, `/api/sms/cdr`, `/api/sms/dlr`)**: `core/lib/api-auth.ts#authenticateRequest()` — `sgp_`-prefixed bearer tokens, SHA-256 hashed in the `ApiKey` table (`keyHash` unique, only `keyPrefix` shown back to users). Each of these route handlers falls back to Supabase-session + RBAC permission (`sms:send`/`sms:view`) when no bearer token is present, so they work both from Postman and from a logged-in browser tab.

`middleware.ts` runs Supabase session refresh (`core/lib/supabase/middleware.ts`) on every route except static assets, `api/auth/token`, and the bearer-token SMS API routes above (`api/sms/send`, `api/sms/status`, `api/sms/cdr`, `api/sms/dlr`) — each new route under `app/api/` that does its own token auth must be added to the `matcher` exclusion in `middleware.ts`, otherwise requests with no Supabase session cookie get a 307 redirect to `/login` instead of a JSON 401 (breaks Postman/cURL callers, which don't have a browser's session cookie).

The bridge has its own, separate, simpler auth: a single shared-secret bearer token (`BRIDGE_API_KEY`) checked by Hono middleware (`smpp-bridge/src/middleware/auth.ts#bearerAuth`) on every route except its public `/health` endpoint. It does not know about Supabase, users, or RBAC.

### SMPP session management (lives entirely in `smpp-bridge/`)

- **One process-wide SMPP session** (not per-connector, despite `SmsProvider`/`SmsRoute` models existing for future multi-provider routing). Config is env-only (`SMPP_*` vars via `smpp-bridge/src/lib/smpp/config.ts`); there is intentionally no DB-backed connector model (see comment in `prisma/schema.prisma` above `SmsProvider`).
- `smpp-bridge/src/lib/smpp/session-manager.ts` is a module-level singleton keyed by connector key, defaulting to `DEFAULT_SESSION_KEY = "__env__"`. (It's a plain singleton, not `globalThis`-pinned — the bridge is a standalone long-running process with no dev-mode hot-reload to survive, unlike the old in-app version.)
- `smpp-bridge/src/lib/smpp/instance.ts`: `getSmppClient()` creates+connects on first call; `getSmppClientIfExists()` is the read-only variant used by `/status`, `/disconnect` etc. so simply querying status never opens a bind.
- Delivery receipts (`deliver_sm`) are wired via `smpp-bridge/src/lib/smpp/wire-delivery-receipts.ts`, attached lazily the first time a session is created or a job is processed (idempotent via a `WeakSet`). DLR matching is case-insensitive and falls back to a zero-stripped suffix match because the upstream SMSC's `submit_sm_resp` and DLR `id:` can differ in case/leading zeros. Final DLR states (`DELIVRD`/`UNDELIV`/`EXPIRED`/`REJECTD`) are terminal and never regressed by later intermediate reports (`ACCEPTD`/`ENROUTE`); every report is still appended to `SmsMessage.metadata.dlrHistory`.
- Inbound MO messages containing `STOP`/`STOPALL`/`UNSUBSCRIBE`/`ARRET` (French, incl. accented) automatically blacklist the contact (`Contact.isBlacklisted`) and write an `AuditLog` entry.
- The main app never touches SMPP directly anymore — `app/api/smpp/**/route.ts` (status/connect/disconnect/restart/query/state) are thin proxies that call `core/lib/bridge-client.ts` functions, which HTTP-call the bridge's `smpp-bridge/src/routes/smpp.ts` endpoints.

### Send pipeline (BullMQ, lives entirely in `smpp-bridge/`)

`smpp-bridge/src/lib/queue/sms-queue.ts`: `enqueueSms()` writes/updates the `SmsMessage` row (status `QUEUED`/`PENDING` if `scheduledAt` is in the future — implemented as a BullMQ delayed job) then adds the job. The worker requires the SMPP client to be `bound` or throws (triggering BullMQ retry w/ exponential backoff, 3 attempts); on terminal failure the job is copied into a `sms-dlq` dead-letter queue and the `SmsMessage` marked `FAILED`. The worker also auto-pauses/resumes itself around the SMPP client's `bound` event. Redis connection (`smpp-bridge/src/lib/queue/redis.ts`) accepts either `REDIS_URL` or Upstash REST creds (converted to a `rediss://` URL — BullMQ needs a real TCP connection, not the REST API). `getRedisConnection()` returns `ConnectionOptions` for BullMQ; `getRedisClient()` returns the raw `ioredis` `Redis` instance for direct use (health checks, graceful shutdown).

Other queues follow the same pattern: `smpp-bridge/src/lib/queue/campaign-queue.ts`, `webhooks-queue.ts`, `reports-queue.ts` (the last one is enqueue-only — see Known gaps). Graceful shutdown (SIGTERM/SIGINT: close queues/workers, disconnect SMPP, quit Redis) is handled by `smpp-bridge/src/lib/shutdown.ts`.

The main app reaches all of this only through `core/lib/bridge-client.ts`'s `bridgeFetch()` wrapper (bearer-token authenticated HTTP calls to `BRIDGE_URL`) — e.g. `sendSmsViaBridge`, `launchCampaignViaBridge`, `getQueueStatsFromBridge`, `testWebhookDeliveryViaBridge`, `scheduleReportViaBridge`. `core/actions/*.ts` (campaigns, queue, dashboard, connectors, webhooks, reports) call these instead of importing queue/SMPP code directly. Corresponding bridge-side routes live in `smpp-bridge/src/routes/{sms,smpp,queue,campaigns,webhooks,reports}.ts`, mounted from `smpp-bridge/src/index.ts`.

### Prisma (shared schema, two generators)

- Single `prisma/schema.prisma` at the repo root, with **two `generator` blocks**: the main app's client generates to `app/generated/prisma`, and the bridge's to `smpp-bridge/src/generated/prisma` (`smpp-bridge`'s `db:generate` script targets this schema explicitly with `--generator=bridge` since the bridge has no local schema file of its own).
- Both use `@prisma/adapter-pg` (native `pg` driver, chosen for Edge/Vercel compatibility over the Rust engine, though the bridge doesn't strictly need that constraint — it just reuses the same generator setup). Import from `@/core/lib/prisma` (default export) in the main app, not from `@prisma/client` directly; the bridge imports from its own `../generated/prisma/client.js`.
- `prisma.config.ts` (main app) points migrations at `DIRECT_URL` (session-mode pooler) while the app runtime uses `DATABASE_URL` (transaction-mode pooler, `pgbouncer=true`). Migrations are only ever run from the main app/root, never from `smpp-bridge/`.
- IDs are `gen_random_uuid()` (Postgres-side), not Prisma-side UUID generation.

### RBAC shape

`User.role` is one of `SUPER_ADMIN | ADMIN | OPERATOR | DEVELOPER | VIEWER`; fine-grained access is a flat `permissions: String[]` on `User` (e.g. `"sms:send"`), checked via `hasPermission()`/`requirePermission()` — there is no `access[]`/`routes[]` per-module array like the (inapplicable) `architecture` doc describes. This RBAC model only exists in the main app; the bridge has no concept of users/roles.

### Path aliases

`@/*` maps to the repo root (`tsconfig.json`) — e.g. `@/core/lib/prisma`, `@/app/generated/prisma/client`. This alias is main-app only; `smpp-bridge/` uses plain relative imports with explicit `.js` extensions (ESM requirement for a `"type": "module"` package run under `tsx`/`node`).

### Known gaps (schema/code exists but isn't wired into the runtime path)

- **Credits aren't deducted on send.** `CreditBalance`/`CreditTransaction`/`PricingRule` exist and `core/actions/billing.ts#applyTransaction()` works, but nothing in the bridge's send pipeline calls it — `SmsMessage.cost` is never populated. Credits only move via manual admin actions (`creditAccountAction`/`debitAccountAction`).
- **Webhooks never fire automatically.** `smpp-bridge/src/lib/queue/webhooks-queue.ts`'s dispatch logic is fully implemented (HMAC signing, retry, `WebhookDelivery` persistence) but is not called from the SMS send/DLR/campaign pipeline — only the manual "test delivery" action (`testWebhookDeliveryViaBridge`) exercises it.
- **`ApiKey.rateLimit`/`ipWhitelist`/`scopes` are stored but never checked.** `core/lib/api-auth.ts#authenticateRequest()` validates the bearer token itself but doesn't enforce rate limits, IP allowlisting, or scopes — `@upstash/ratelimit` is a dependency but unused anywhere.
- **`core/actions/templates.ts#updateTemplateAction()`/`deleteTemplateAction()` don't filter by `organizationId`** (only `listTemplatesAction` does, via a bespoke `getOrganizationId()` helper instead of `orgGuard()`/`requirePermission()`) — a cross-tenant write gap if you touch this file, fix by adding the org filter before assuming other actions follow the same pattern.
- **No template variable substitution.** `{{variable}}` placeholders are extracted and stored (`SmsTemplate.variables`) but nothing renders them against contact data — campaign sends use the raw template content as-is.
- **`core/lib/crypto/aes.ts`** (AES-256-GCM helpers) exists but nothing calls it — SMPP passwords and webhook secrets are stored in plain text in the DB, despite `SECRETS_ENCRYPTION_KEY` being documented in `.env.example`.
- **Sentry isn't configured** — `@sentry/nextjs` is a dependency and `SENTRY_DSN` is in `.env.example`, but there's no `sentry.{client,server,edge}.config.ts`; error tracking is log-only via `core/lib/logger.ts`.
- **`smpp-bridge/src/lib/queue/reports-queue.ts`'s `scheduled-reports` BullMQ queue has no worker** — jobs can be enqueued (`POST /api/v1/reports/schedule`) but nothing processes them.
- **The bridge isn't exposed for production yet.** It only runs locally (`http://localhost:3001`) today; a production deployment needs it reachable from wherever the main app runs (e.g. via a Cloudflare Tunnel or similar) — this is tracked as a later phase in `akisSp.md`, not yet implemented.

A fuller improvement roadmap (design + these gaps, prioritized) is tracked in `upgradeAkis.md` at the repo root — not authoritative on current behavior, just a proposal doc. `akisMap.md` is a similar historical audit (French) — treat it the same way: verify against the code before acting on anything it says.
