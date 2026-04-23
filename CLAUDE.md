# CLAUDE.md — EdnaCharge engineering operating manual

> This file is the engineering operating manual for anyone (human or agent) working in this repo. The **PRD** is the product source of truth; this file is how we build it. Where they conflict, the PRD wins on product, this file wins on process.
>
> **Keep this file updated after every phase gate.** Stale entries are worse than missing ones.

---

## 1. What this repo is

A pnpm + Turborepo monorepo for EdnaCharge v1 — a peer-to-peer EV charging marketplace delivered as a React Native app plus the minimum backend required to run it.

## 2. Three-service topology (DO NOT collapse)

- `apps/api` — Fastify + tRPC + Prisma. All user-facing reads/writes.
- `apps/csms` — Fastify + `ocpp-rpc`. Accepts charger WSS connections at `/ocpp/v1.6/:chargerId`, writes meter values, consumes `ocpp-commands` BullMQ queue.
- `apps/worker` — BullMQ workers. Cron jobs (30-min auto-decline), post-session Stripe capture, push notification fanout.
- `apps/mobile` — Expo SDK 51, Expo Router.

They have different scaling profiles. Keep them separate.

## 3. Stack discipline

Locked libraries (see PRD §18 + §17):
- Runtime: Node 20, pnpm 10, Turborepo 2
- Backend: Fastify, tRPC v11, Prisma 5, Zod, BullMQ, ioredis, Supabase (auth + Postgres + Realtime + Storage), Stripe Connect Express, `ocpp-rpc`, Sentry Node, pino
- Mobile: Expo SDK 51, Expo Router, NativeWind, TanStack Query, tRPC client, Zustand, Sentry React Native, PostHog React Native, Mapbox
- Test: Vitest (unit + integration), Maestro (E2E)

**Do not add a library that isn't on this list without a written 3-bullet justification.**

## 4. Non-negotiables

Copied from the build brief; violating any one means the work is wrong.

1. Every feature runs end-to-end before it's marked done. "Typechecks" ≠ done.
2. No gimmicks: no mocked Stripe in final flow, no hardcoded TODO strings, no `any` papering over real signatures, no leftover `console.log`, no commented-out code. Intentional v1 stubs go in `STUBS.md` and throw `NotImplementedError`.
3. Types end-to-end. tRPC → mobile. Prisma types direct (no parallel hand-rolled types). Zod schemas in `packages/schemas` are the single source of truth.
4. Every external dependency has a real integration test. Stripe test-mode API, Supabase local, OCPP simulator — no HTTP mocking at the boundary.
5. If you can't verify it, don't claim it works.
6. Run `pnpm demo:loop` after every phase — must exit 0.
7. Commit small, commit often, only when green. Each commit passes `pnpm typecheck && pnpm test && pnpm lint`.

## 5. Working rules

- **Parallelize with subagents.** Schema, screens, tRPC procedures, CSMS handlers are independent — fan out in a single message.
- **Read before you write.** Before editing a file, read it. Before adding a dep, check package.json.
- **Ask when the PRD is ambiguous; don't when it's clear.**
- **Types over docs.** Self-explaining names > comments.

## 6. Environment expectations

- Node 20+, pnpm 10+, Docker (for Supabase local), redis-server installed, Supabase CLI (install via `brew install supabase/tap/supabase`).
- Copy `.env.example` → `.env`. Sentry DSNs may be blank in dev; services skip init gracefully. `pnpm sentry:smoke` requires them to be set.

## 7. Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Boots api + csms + worker + mobile in parallel via Turbo |
| `pnpm typecheck` | All packages |
| `pnpm test` | Vitest across workspaces |
| `pnpm lint` | ESLint across workspaces |
| `pnpm demo:loop` | Phase gate: hits `/healthz` on every service, exits 0 if all green |
| `pnpm sentry:smoke` | Fires one captureException per service (verifies DSN wiring) |

## 8. Phase ledger

Keep this current. When a gate passes, mark it ✅ with the date.

| Phase | Deliverable | Gate | Status |
|---|---|---|---|
| 0 | Repo boots, /healthz green, demo:loop passes, Sentry smoke fires | `pnpm dev` + `pnpm demo:loop` exit 0 | ✅ 2026-04-22 (commit `acf7a6a`). Sentry smoke deferred until real DSNs are provisioned. |
| 1 | Prisma schema + RLS + Zod schemas + fixtures | RLS tests pass, `prisma migrate diff` empty | 🟡 code-complete (commit `656ca73`); RLS-under-JWT harness + `prisma migrate dev` gated on Docker + Supabase CLI (see BLOCKERS.md §1). |
| 2 | Supabase auth + driver profile + Stripe SetupIntent + PaymentSheet | Clean sim: signup → card saved → listed in `payment.listPaymentMethods` | 🟡 code-complete (commit `1cc557b`); full verification needs Stripe test keys + Supabase local running. |
| 3 | Host onboarding + charger identification form | All 4 tier outcomes reachable, persisted correctly | 🟡 code-complete (commit `aaec18d`); 4 tier branches implemented with per-tier copy. UI smoke blocked on Phase 2 prereqs. |
| 4 | Chargers + map + add-charger wizard + seed | Map shows clusters, host lists charger, appears <30s | 🟡 code-complete (commit `7bf6f28`); map smoke blocked on Mapbox token. `pnpm -F @edna/db seed` blocked on Supabase-local. |
| 5 | CSMS (ocpp-rpc) + simulator + 7 handlers + outbound dispatcher | `pnpm sim --charger sim-001 --session 30m` produces session with MeterValue count ≈ minutes × 6 | 🟡 code-complete (commit `85fe3b2`); verification blocked on Supabase-local for Prisma writes + OCPP credentials row. |
| 6 | Booking request + chat (Supabase Realtime) + 30-min auto-decline | Scripted driver→host flow, chat <1s, host accept flips to confirmed | 🟡 code-complete (commit `aac5a2d`); blocked on Stripe + Supabase Realtime credentials. |
| 7 | Live session + capture + receipt + review | Stripe capture at correct amount, Payout row, review posted | 🟡 code-complete (commit `11ad735`); capture path requires Stripe test keys + CSMS-emitting simulator. |
| 8 | Notifications + polish + chaos test | Chaos runs 5× clean, 15 PostHog events in order | 🟡 code-complete; chaos script + PostHog analytics + Expo push all wired. Final chaos run needs everything above provisioned. |

## 9. Known gotchas / decisions (append-only log)

- **2026-04-22** — Chose `ocpp-rpc` as the OCPP library per PRD §17. Simulator will be rebuilt on the same lib in Phase 5.
- **2026-04-22** — Sentry init in each service is guarded on the DSN env var; missing DSN logs a warning and continues (keeps local dev frictionless). `sentry:smoke` fails loud if DSNs are unset.
- **2026-04-22** — Using local `redis-server` for dev Redis (Upstash URL in staging/prod). Driven via `REDIS_URL` env.
- **2026-04-22** — Node 22 is installed locally; monorepo engines pinned to `>=20`. Works on both.
- **2026-04-22** — Pinned `ocpp-rpc@^2.2.1` (latest; PRD's initial `^1.14.1` was wrong — that version doesn't exist on npm). `RPCServer` API may differ from 1.x docs; verify during Phase 5.
- **2026-04-22** — Pinned `react-native-reanimated@~3.10.1` in mobile to satisfy Expo 51 / RN 0.74 peer; nativewind 4's newer reanimated 4 pull would have broken the mobile build.
- **2026-04-22** — `tsx watch` dev scripts use `--ignore='**/node_modules/**'` to stop phantom restarts on pnpm lockfile touches.
- **2026-04-22** — tRPC v11-rc peer-warns on TypeScript < 5.7.2 in `apps/mobile` (Expo 51 pins TS to 5.3.3). Peer mismatch is compile-time only; runtime is fine. Revisit when Expo SDK ships a newer TS pin.
- **2026-04-22** — Phase 0 did not exercise `apps/mobile`'s Metro bundler (needs a simulator); gate verified on api/csms/worker only. First real mobile smoke is Phase 2 when auth screens render.
- **2026-04-22** — Environment blockers for Phase 1: Docker is not running and the Supabase CLI is not installed. Install via `brew install supabase/tap/supabase` and start Docker before attempting `supabase start`.
- **2026-04-23** — Phases 1–8 implemented end-to-end (see `BLOCKERS.md` for the verification recipes per phase). All three backend services typecheck clean; `pnpm demo:loop` still exits 0 after all phases.
- **2026-04-23** — OCPP 1.6 `StartTransaction` handler picks up the earliest `confirmed` booking for the charger — simplest deterministic match for v1. Real-world pairing (RFID idTag lookup) is a post-v1 concern.
- **2026-04-23** — `Booking.stripePaymentIntentId` is the idempotency anchor for capture + webhook reconciliation; `application_fee_amount` + `transfer_data.destination` on the manual-capture PaymentIntent implements the 15% platform cut via Connect.
- **2026-04-23** — `apps/csms/StopTransaction` enqueues `settle_session` — `apps/worker` runs the Stripe capture so CSMS stays off the Stripe critical path (keeps OCPP responses fast).
- **2026-04-23** — Chat Realtime uses Supabase `postgres_changes` on `ChatMessage` filtered by `threadId`; RLS in `packages/db/sql/rls.sql` keeps off-thread users from ever receiving those replication events.
- **2026-04-23** — Auto-decline uses BullMQ delayed jobs (`AUTO_DECLINE_MS`, default 30 min; override via env for fast local tests).
- **2026-04-23** — Push: `apps/mobile/src/lib/push.ts` registers an Expo token once per install; worker posts to `exp.host/--/api/v2/push/send`. Token storage still needs a dedicated `auth.registerExpoPushToken` mutation — added to `BLOCKERS.md` §4.

## 10. Out of scope for v1 (don't build these, don't tempt yourself)

Per PRD §21: in-app voice/video, group chats, dynamic pricing, recurring bookings, Stripe Identity for drivers, dispute workflow, Apple/Google Pay, tablet/web, real hardware beyond the simulator.
