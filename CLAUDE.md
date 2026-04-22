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
| 1 | Prisma schema + RLS + Zod schemas + fixtures | RLS tests pass, `prisma migrate diff` empty | ⬜ |
| 2 | Supabase auth + driver profile + Stripe SetupIntent + PaymentSheet | Clean sim: signup → card saved → listed in `payment.listPaymentMethods` | ⬜ |
| 3 | Host onboarding + charger identification form | All 4 tier outcomes reachable, persisted correctly | ⬜ |
| 4 | Chargers + map + add-charger wizard + seed | Map shows clusters, host lists charger, appears <30s | ⬜ |
| 5 | CSMS (ocpp-rpc) + simulator + 7 handlers + outbound dispatcher | `pnpm sim --charger sim-001 --session 30m` produces session with MeterValue count ≈ minutes × 6 | ⬜ |
| 6 | Booking request + chat (Supabase Realtime) + 30-min auto-decline | Scripted driver→host flow, chat <1s, host accept flips to confirmed | ⬜ |
| 7 | Live session + capture + receipt + review | Stripe capture at correct amount, Payout row, review posted | ⬜ |
| 8 | Notifications + polish + chaos test | Chaos runs 5× clean, 15 PostHog events in order | ⬜ |

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

## 10. Out of scope for v1 (don't build these, don't tempt yourself)

Per PRD §21: in-app voice/video, group chats, dynamic pricing, recurring bookings, Stripe Identity for drivers, dispute workflow, Apple/Google Pay, tablet/web, real hardware beyond the simulator.
