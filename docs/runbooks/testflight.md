# TestFlight Runbook

## Before Build

Verify:

- Supabase Auth providers (Google, Apple) are enabled for the target project.
- APNs key is uploaded for Expo push notifications.
- App Store Connect API key is available through EAS secrets, not committed.
- `apps/mobile/app.json` has the correct version/build metadata.

## Build

```bash
cd apps/mobile
eas build --platform ios --profile production
```

If the build should upload immediately:

```bash
eas submit --platform ios --latest
```

## App Store Connect

- Confirm processing finished.
- Add the build to internal testing first.
- Smoke the sign-in (email, Google, Apple), map, booking, and notifications flows on a physical device.
- Use external testing only after the internal build is clean.

## App Store Review Access

The production app is waitlist-gated after sign-in. For App Review, provide one of:

- A reviewer demo account that already has both `driver` and `host` access grants.
- A driver invite code and a host invite code generated for the review campaign.

Put the credentials or codes in App Review Information. Screenshots and metadata should describe
the launch as a Fremont pilot / invite-access rollout, not as fully open public availability.

## New Build

For a user-visible change:

1. Bump `expo.version` in `apps/mobile/app.json`.
2. Let EAS increment the iOS build number.
3. Rebuild and submit.
