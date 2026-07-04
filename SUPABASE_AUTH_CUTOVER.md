# Supabase Auth cutover runbook

Migrates auth from Firebase → Supabase (email + Google + Apple; phone dropped).
Fresh start: `User.id = auth.users.id`, so RLS `auth.uid()` finally lines up.
Hard big-bang — old builds stop authenticating once the backend deploys.

**Run these steps in order.** Steps 1 is owner-only (Supabase + Apple/Google
consoles) and GATES the rest — Google/Apple sign-in fails on the new build until
the providers are configured.

## 1. Supabase dashboard (do FIRST)
Project `mrjadsvmibkhqyfqhkvh` → **Authentication → Providers**:
- **Email**: enabled. Turn **"Confirm email" OFF** for now (matches today's "sign up → usable" UX; re-enable later with a confirm deep link).
- **Google**: enabled. Under **Authorized Client IDs**, add BOTH:
  - iOS: `312909386856-k42nfrktnp3epe582hfm2d76h1kljmj1.apps.googleusercontent.com`
  - Web: `312909386856-dqs22433oubd3h34tgq6dthgbeq5rkrd.apps.googleusercontent.com`
- **Apple**: enabled. Add the iOS bundle id `com.ednacharge.app` to the client IDs / Services list.
- **Authentication → URL Configuration**: add redirect URL `ednacharge://` (used for OAuth return + password reset).

No new server secret is needed — the API verifies tokens via `supabase.auth.getUser` using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` already in the `edna-shared` Render group.

## 2. Ship the code
- Merge the migration PR to `main` → Render auto-deploys api/csms/worker (Supabase-only verification). **Build 13 (Firebase) stops authenticating at this moment — expected.**
- No Render env changes required (Firebase vars removed from the blueprint; nothing to add).

## 3. Wipe the disposable test data (fresh start)
Supabase → SQL Editor → run (resets all app data so re-signups are clean and can't collide on email):
```sql
TRUNCATE
  "User", "DriverProfile", "HostProfile", "IdentityVerification",
  "Charger", "Booking", "ChargingSession", "MeterValue",
  "ChatThread", "ChatMessage", "Review", "Payout",
  "ChargerWaitlist", "Notification", "ShellDevice", "StripeWebhookEvent"
RESTART IDENTITY CASCADE;
```
(`auth.users` is already empty — it was never populated while auth was Firebase.)

## 4. Build + ship the app
```
cd apps/mobile
eas build --profile production --platform ios --auto-submit --non-interactive
```
→ build 14 to TestFlight. Testers update and **re-sign-up** (all accounts were test data).

## 5. Verify on build 14
- Email sign-up → immediately usable; email sign-in.
- **Google** sign-in; **Apple** sign-in. (If either fails with "provider not enabled" / invalid audience → recheck step 1 client IDs.)
- Sign out → confirm you can't swipe back into the account.
- Full flow: map → request booking → host onboarding (identity → Stripe → dashboard) → add charger → chat → payment. Confirms `ctx.userId` resolves end-to-end.
- RLS: an authenticated client can read only its own rows.

## Rollback
Revert the PR merge on `main`, redeploy the previous (Firebase) backend commit, and point testers back to build 13. Keep the Firebase project intact until build 14 is confirmed good.

## Notes
- Phone sign-in is removed. To bring it back later: enable Supabase phone provider + a Twilio SMS provider, re-add a phone screen using `supabase.auth.signInWithOtp` / `verifyOtp`.
- Rotate the Firebase key + Supabase service-role key currently committed in `.env`.
