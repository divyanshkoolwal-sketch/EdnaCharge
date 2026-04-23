# EdnaCharge Security + Correctness Audit

Scope: `apps/api`, `apps/csms`, `apps/worker`, `apps/mobile`, `packages/db`, `packages/schemas`.
Methodology: source read + PRD §15 diff + RLS SQL review + Stripe + BullMQ + OCPP flow trace.

## Summary

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 9 |
| Medium | 10 |
| Low | 6 |
| **Total** | **28** |

---

## CRITICAL

### C1 — SQL injection in `charger.nearby` filters
**File:** `apps/api/src/routers/charger.ts:42-49`
**What:** The PostGIS nearby query uses `prisma.$queryRawUnsafe` and string-interpolates `filters.connectorType`, `filters.minPowerKw`, and `filters.maxPriceCents` directly into the SQL template. Zod narrows `connectorType` to an enum and the numeric fields to numbers, but the interpolation still lives in a raw SQL string.
**Why it matters:** (a) `connectorType` is enum-validated today, but if the enum is ever widened or the schema is edited carelessly (e.g. a string passthrough added upstream, or `.passthrough()` leaking through a `.extend`), an attacker controls raw SQL. (b) The numeric interpolation (`${filters.minPowerKw}`) serializes via `String()`. If anyone later relaxes the zod validator to allow `NaN`, the literal "NaN" breaks the query; if someone widens it to a string (common during refactors) you have straight injection.
**Fix:** parameterize all filters. Either `$queryRaw` with `Prisma.sql` fragments, or build a conditional `WHERE` array and pass values as `$4, $5, …` alongside `lat/lng/radius`. Example:
```ts
const params: unknown[] = [lat, lng, radiusMeters];
const conds = [`published = true`, `st_dwithin(location, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)`];
if (filters.connectorType) { params.push(filters.connectorType); conds.push(`"connectorType" = $${params.length}`); }
// …etc.
await prisma.$queryRawUnsafe(`select … where ${conds.join(' and ')} order by …`, ...params);
```

### C2 — Global raw-body parser breaks non-webhook JSON parsing
**File:** `apps/api/src/webhooks/stripe.ts:9-13`, called from `apps/api/src/index.ts`
**What:** `registerStripeWebhooks` calls `app.addContentTypeParser('application/json', {parseAs:'buffer'}, …)` globally at the Fastify instance level. This overrides JSON parsing for EVERY route that comes after, including tRPC at `/trpc/*`. tRPC then receives a `Buffer` where it expects a parsed object — every mutation silently breaks or mis-parses.
**Why it matters:** Either all tRPC calls are broken in production, or (if Fastify routes the matched parser differently) webhook signature verification works by accident and tRPC works because it re-parses. Either way this is load-bearing and undocumented.
**Fix:** scope the raw-body parser to the webhook route only. Use `fastify-raw-body` with `routes: ['/webhooks/stripe']`, or register webhooks inside an `app.register` encapsulation with its own `addContentTypeParser`, or switch to `app.post('/webhooks/stripe', {config:{rawBody:true}}, …)` with a route-level content-type parser.

### C3 — Stripe PaymentIntent creation has no idempotency key
**File:** `apps/api/src/routers/booking.ts:47-58`
**What:** `booking.requestBooking` calls `paymentIntents.create(...)` with no `idempotencyKey`. A client that retries (lost connection, tRPC retry, user double-tapping) will trigger N pre-auths on the driver's card and create N Booking rows.
**Why it matters:** real customer money held multiple times, multiple ChatThreads, multiple auto-decline jobs, multi-row host accept/decline confusion. Stripe documents this exact scenario as the #1 reason to use idempotency keys.
**Fix:** generate a deterministic key per logical request (e.g. hash of `driverId + chargerId + startAt + endAt`) and pass `{idempotencyKey}` as the 2nd arg. Same applies to the `PaymentIntents.cancel` calls on decline (less critical, cancel is idempotent server-side but a logged error on the second attempt is nicer with a key).

---

## HIGH

### H1 — Race: double-spending a time slot (no booking-slot uniqueness)
**File:** `packages/db/prisma/schema.prisma` (Booking model); `apps/api/src/routers/booking.ts:30-98`
**What:** Two drivers can POST `requestBooking` simultaneously for the same `chargerId` + overlapping `[startAt, endAt]`. Neither sees the other because there is no DB constraint or advisory lock. Both land `status=pending`; the host sees both and can accept both.
**Fix:** add a Postgres exclusion constraint on `Booking` using `tstzrange(startAt, endAt, '[)')` with `WITH =` on `chargerId` for non-terminal statuses (`pending`, `confirmed`, `active`). Alternatively, take a `pg_advisory_xact_lock(hashtext(chargerId))` at the start of `requestBooking` inside a transaction and verify no overlap before insert.

### H2 — Race: host accept arrives after auto-decline fired
**File:** `apps/api/src/routers/booking.ts:100-158`; `apps/worker/src/jobs/auto-decline.ts`
**What:** The host's `respond=accept` only checks `b.status !== 'pending'`. If the auto-decline worker has already flipped the row to `declined`, the host sees "already responded". Fine — but the PaymentIntent was cancelled by auto-decline, and the host could race: status read says `pending`, worker transitions to `declined` between read and update. `prisma.booking.update` will overwrite it back to `confirmed` with NO PI.
**Fix:** make the accept an optimistic-lock update: `updateMany({where:{id, status:'pending'}, data:{status:'confirmed'}})` and check `count === 1`. Same guard for decline. Separately, `BullMQ.remove()` the `auto_decline:${bookingId}` job at the top of `respond` to close the window further.

### H3 — Race: StopTransaction arrives before StartTransaction's response
**File:** `apps/csms/src/handlers/index.ts:52-134`
**What:** `StartTransaction` creates the `ChargingSession` row; if `StopTransaction` arrives before that insert commits (extremely unlikely but possible under load / network flips), `findUnique({ocppTransactionId})` returns null and the Stop is silently dropped — the session stays open with no settle ever fired.
**Fix:** make StartTransaction return the DB-generated `ocppTransactionId` deterministically (current code stores a random int) and in StopTransaction, if the session is missing, short-retry with backoff or enqueue a deferred settle.

### H4 — `ocppCredentials` returns the plaintext password; bcrypt hash never rotated on update
**File:** `apps/api/src/routers/charger.ts:116-136` + `charger.update`
**What:** The hash IS rotated inside `ocppCredentials` (good). But: the logger at `apps/api/src/routers/charger.ts` flows through pino, which would print the return value if the tRPC onError handler ever serializes inputs/outputs. More importantly, `charger.update` happily accepts a `patch` that includes `ocppAuthHash` / `ocppChargePointId` via the broad `ChargerCreateFieldsZ.partial()` — the schema doesn't omit those fields. A malicious host could overwrite their own hash to a known value and then authenticate directly.
**Fix:** in `packages/schemas/src/charger.ts`, `ChargerUpdateInputZ.patch` must `omit({ocppChargePointId:true, ocppAuthHash:true, hostId:true, published:true, status:true})` — most of those aren't even in `ChargerCreateFieldsZ`, but `published` and `status` ARE implicitly writable via the create schema's extensions if anyone adds them later. Lock it down explicitly. Also: never log the `password` return value; document it as secret.

### H5 — `charger.update` authorization check uses read-then-update (TOCTOU)
**File:** `apps/api/src/routers/charger.ts:106-114`
**What:** `findUniqueOrThrow → check hostId → update`. No transaction. If ownership changed between read and write (edge case, but also: an attacker could race transfer-of-ownership flows if/when they exist), the check succeeds while the row no longer belongs to the caller.
**Fix:** collapse to a single `updateMany({where:{id, hostId: ctx.userId}, data: input.patch})` and assert `count === 1`.

### H6 — Missing `application_fee_amount` consistency on Stripe capture
**File:** `apps/worker/src/jobs/settle-session.ts:41-47`
**What:** The capture sends `application_fee_amount: fee` where `fee = feeCents(energyCents)` — i.e. 15% of energy cost only. But the PaymentIntent was CREATED with `application_fee_amount: est.platformFeeCents` which is 15% of the ORIGINAL `totalCents = energyCostCents + fee` from pricing. Stripe rejects a capture `application_fee_amount` that doesn't match what the PI was created with unless `amount_to_capture` is changed in a specific way. At minimum, this is inconsistent accounting (the 15% is computed off different bases).
**Fix:** decide canonically whether the 15% is "of the customer charge" or "of the energy cost", compute both on the same base, and recompute based on `amount_to_capture` at capture time: `fee = Math.round(amount_to_capture * 0.15)`.

### H7 — Webhook handler doesn't reconcile `payment_intent.canceled` to Booking status
**File:** `apps/api/src/webhooks/stripe.ts:56-71`
**What:** The case groups `canceled`, `succeeded`, and `amount_capturable_updated` but only acts on `succeeded`. If Stripe cancels a PI out-of-band (e.g. radar declines after off-session confirm) the booking stays `pending` forever until auto-decline.
**Fix:** on `payment_intent.canceled`, set booking status to `errored` (or `cancelled` if appropriate) and post a system chat message.

### H8 — Webhook has no event idempotency (event-id de-dupe)
**File:** `apps/api/src/webhooks/stripe.ts`
**What:** Stripe retries webhook deliveries. The handler has no "have I seen event.id?" check, so `payment_intent.succeeded` can write `capturedAmountCents` twice. In this codebase the write is idempotent by value, but the `account.updated` → `user.roles` fanout is not; a racing retry can flip roles around.
**Fix:** add a `StripeWebhookEvent` table with `id` as PK, insert-on-receive, and short-circuit if the row already exists.

### H9 — `settle_session` has no job-level idempotency
**File:** `apps/worker/src/jobs/settle-session.ts`
**What:** BullMQ re-runs on failure. A half-succeeded job (Stripe capture OK, `prisma.payout.create` then crashes) re-runs and attempts `paymentIntents.capture` a second time — Stripe returns "already captured", which throws, which fails the job, which retries forever. Also creates duplicate Payout rows if the second attempt proceeds far enough.
**Fix:** (a) short-circuit when `booking.capturedAmountCents != null`. (b) use `prisma.payout.upsert` keyed on `bookingId` (currently no unique — add `@unique([bookingId])`). (c) Pass `idempotencyKey: \`capture:${bookingId}\`` to `paymentIntents.capture`.

---

## MEDIUM

### M1 — AsyncStorage used for Supabase session (sensitive JWT)
**File:** `apps/mobile/src/lib/supabase.ts`
**What:** Supabase auth persists its JWT + refresh token via AsyncStorage. On iOS/Android, AsyncStorage is unencrypted at rest (iOS keychain is NOT the default backend). Anyone with local device access (offline extraction, jailbreak, rooted device) can read the refresh token and impersonate the user for its lifetime.
**Fix:** use `expo-secure-store` adapter with Supabase's `SupportedStorage` interface. Many teams wrap expo-secure-store into a Storage adapter. Migrate existing installs by reading AsyncStorage once then deleting.

### M2 — Review creation has no party-check beyond driver/host-of-booking
**File:** `apps/api/src/routers/review.ts:9-34`
**What:** The procedure does check the caller is driver or host. Good. But it never verifies the review has not already been left by this author (the DB unique `[bookingId, authorId]` will throw a P2002, which returns a generic 500 to the client). Also: it uses `include: { charger: true }` to reach hostId — if charger is later deleted/cascaded the booking still exists (soft-delete scenarios).
**Fix:** look up the unique and return a friendly error. Consider asserting the booking was completed AND that the chat thread is closed before allowing a review.

### M3 — `chat.markRead` ignores `upToMessageId`
**File:** `apps/api/src/routers/chat.ts:77-89`
**What:** The input schema has `upToMessageId: z.string().uuid()` but the router marks ALL unread counterparty messages as read, not just those up to that id. The UI can't implement "mark read up to message X" correctly — there's a race where a new message arrives while the user scrolled, and it gets marked read even though it wasn't visible.
**Fix:** include `id: { lte: upToMessageId }` — but since ids are UUIDs not monotonic, switch to `createdAt: { lte: messageAt }` where messageAt is looked up from upToMessageId.

### M4 — `bookings_update_party` RLS allows driver to flip status
**File:** `packages/db/sql/rls.sql:49-53`
**What:** The UPDATE policy grants any party permission to update any field on the booking. The comment acknowledges "server-side tRPC enforces which transitions each role may perform." But if a driver obtains a Supabase JWT and hits PostgREST directly, they can `status=confirmed` their own booking (bypassing host approval) and even set `capturedAmountCents` arbitrarily.
**Fix:** split the UPDATE policy by role (driver can only update `status` to `cancelled`, host can update `status` to `confirmed`/`declined`), or add a column-level grant (Postgres supports this) restricting driver UPDATEs to the driver-writable subset.

### M5 — `chat_messages_mark_read` RLS lets a party UPDATE any field, not just readAt
**File:** `packages/db/sql/rls.sql:118-128`
**What:** The UPDATE policy checks sender and party but doesn't constrain which columns may be written. A party can UPDATE a message's `body` (edit the counterparty's content) via PostgREST.
**Fix:** use a column-level grant: `grant update(readAt) on "ChatMessage" to authenticated;` plus `revoke update on "ChatMessage" from authenticated;` — RLS + column grants together.

### M6 — `ChatMessage` INSERT policy lets a party post with `senderId = null` via system path if policy is misread
**File:** `packages/db/sql/rls.sql:106-116`
**What:** The check `"senderId" = auth.uid()` blocks null senders (good). But the server-side inserts (`senderId: null` for system messages in booking.ts) must be going through the service role (worker). Document that this is a service_role-only code path; currently the tRPC API issues those inserts via the API's prisma client, which uses the service-role DATABASE_URL — not the end-user's JWT. Confirm that `DATABASE_URL` in `apps/api/.env` is NOT the PostgREST anon connection string.
**Fix:** explicit test: assert that `prisma` in `apps/api` connects as `postgres` role (not a JWT-authenticated role), documented in CLAUDE.md.

### M7 — `hardwareSetup` jsonb is never re-validated on write
**File:** `apps/api/src/routers/auth.ts:52-64`
**What:** The zod schema validates the INPUT of `submitChargerIdentification`. Good. But `HostProfile.hardwareSetup` is typed `Json` in Prisma and anywhere else in the codebase reading from it is unsafe (e.g. `apps/api/src/routers/auth.ts` stores an arbitrary `submittedAt`). `availability` on `Charger` similarly is `Json`. If someone later writes `prisma.charger.update({data:{availability: whatever}})` from another path with no zod guard, bad data lands.
**Fix:** add a thin `setHardwareSetup(userId, input)` helper in `packages/db` that runs `HardwareSetupZ.parse(input)` before the write. Same for `availability`.

### M8 — Booking end-start bound allows >1000-hour sessions
**File:** `packages/schemas/src/booking.ts:7-9`
**What:** `RequestBookingInputZ` only checks `endAt > startAt`. A booking 10 years long pre-authorizes 10 years of kWh on the card — Stripe caps PIs at ~$999,999 but pricing estimation can explode numerics before hitting Stripe.
**Fix:** add a refinement: end-start ≤ 12h (or whatever the PRD defines). Also clamp `startAt` to `now + 7 days`.

### M9 — `host` role elevation via `account.updated` webhook accepts any matching stripe account id
**File:** `apps/api/src/webhooks/stripe.ts:35-55`
**What:** The handler takes `account.id` from the event, matches it to a HostProfile, and flips the user's roles. Stripe signature verification is present (good). But the handler trusts `account.charges_enabled` from the event payload without re-fetching. Stripe docs recommend re-fetching the account on sensitive state changes to avoid replay / stale events (particularly combined with H8 — no event de-dupe).
**Fix:** `await stripe.accounts.retrieve(account.id)` inside the handler and use the live values.

### M10 — `charger.create` doesn't validate tier-specific hardware fields
**File:** `apps/api/src/routers/charger.ts:84-104`; `packages/schemas/src/charger.ts`
**What:** The zod schema checks Tier 4 is hourly + others are per-kWh (good). But there's no check that tier_3_native requires OCPP fields, or that tier_1_smart_plug disallows `pricePerHourCents`. Hosts can list inconsistent configs.
**Fix:** tighten the `.refine()` or split into 4 discriminated-union variants on `hardwareTier`.

---

## LOW

### L1 — Duplicate `test` key in `packages/db/package.json`
**File:** `packages/db/package.json:14,19` (pre-fix)
**What:** JSON with duplicate keys; last one wins but this is a smell and most linters flag it.
**Fix:** merge — applied in this audit pass.

### L2 — `any` cast in `apps/worker/src/index.ts`
**File:** `apps/worker/src/index.ts:20-27`
**What:** `autoDecline(job as any)`, `settleSession(job as any)`, `notify(job as any)` — defeats BullMQ payload typing. CLAUDE.md §4.2 forbids `any` papering over signatures.
**Fix:** type the worker as `Worker<PayloadUnion>` and discriminate by `job.name`.

### L3 — `apps/api/src/index.ts` — `await registerStripeWebhooks` BEFORE `app.register(fastifyTRPCPlugin)`
**File:** `apps/api/src/index.ts:29-41`
**What:** Order compounds C2 — the raw-body parser installed first shadows subsequent registrations. Swapping order doesn't fix it (Fastify parses at request time), but visually misleading.
**Fix:** comment the ordering rationale or move to encapsulated plugin.

### L4 — tRPC context drops email to empty string when token verifies
**File:** `apps/api/src/trpc.ts:22-25`
**What:** `email: ctx.email ?? ''` — if Supabase returns a user without email (phone-only login), `email` is empty and the auth.getSession code does `ctx.email.split('@')[0] ?? 'user'` → `''[0]` → `''`. User ends up with empty fullName.
**Fix:** reject the session or use a sensible placeholder.

### L5 — `expoPushToken` set to `null` never cleared; no `auth.registerExpoPushToken` mutation
**File:** PRD §15 vs. `apps/api/src/routers/auth.ts`
**What:** CLAUDE.md notes this explicitly: "`auth.registerExpoPushToken` mutation — added to BLOCKERS.md §4." PRD implies mobile writes a token. No such procedure exists. Mobile code in `apps/mobile/src/lib/push.ts` would have nowhere to POST to.
**Fix:** add the mutation; write-through to `User.expoPushToken`; idempotent.

### L6 — Auto-decline job doesn't clear itself on manual respond
**File:** `apps/api/src/routers/booking.ts:100-158`
**What:** When the host accepts or declines, the `auto_decline:${bookingId}` delayed job is not removed. It fires 30 minutes later, sees `status !== 'pending'`, and returns. Wastes a queue slot and pollutes logs.
**Fix:** `await bookingsQueue.remove(\`auto_decline:${bookingId}\`)` inside respond().

---

## Missing procedures (PRD §15 diff)

PRD §15 lists `chat.markRead({threadId, upToMessageId})` — implemented but ignores upToMessageId (see M3).
PRD §15 does **not** list `auth.startHostOnboarding` / `hostOnboardingStatus` in the §15 table, but they exist — that's fine (server-only helpers).

**Missing:** `auth.registerExpoPushToken` (see L5). PRD §14 and CLAUDE.md imply it.

---

## Mobile-specific follow-ups

- See M1.
- No Certificate Pinning on the API URL — for a charging/payments app, consider `expo-ssl-pinning` or Supabase's built-in SSL (lowest bar: ensure HTTPS-only in production config).

---

## PRD gaps (product vs. code)

- PRD §16 lists a "Presence channel per chat thread". No code in `apps/api` or `apps/mobile` registers a Supabase presence channel.
- PRD §15 does not mention `booking.startSession`/`stopSession` returning `{status: 'started_virtual'}`; these exist as an implementation concession for tiers 1/2/4. Document in PRD §17.
- PRD §21 out-of-scope correctly excludes dispute flow — but the AUDIT notes `errored` booking status has no write path in the code; it's a dead enum value.

---

## Remediation priorities

1. Fix C1 (SQL injection surface) + C2 (parser collision) + C3 (idempotency) before any external traffic.
2. H1 + H2 before opening bookings to >1 concurrent test tenant.
3. H8 + H9 before connecting real Stripe live keys.
4. M1 before shipping to App Store TestFlight.
