# TestFlight build playbook

End-to-end steps to ship an iOS build to TestFlight.

## Prereqs (one-time)

- Paid Apple Developer Program account ($99/yr)
- Bundle ID `com.ednacharge.app` registered at https://developer.apple.com/account/resources/identifiers (enable Push Notifications + Sign in with Apple capabilities)
- App record created in App Store Connect with the same bundle ID
- Expo / EAS account: `npm install -g eas-cli && eas login`
- The placeholder fields in `eas.json` filled in (`appleId`, `ascAppId`, `appleTeamId`, real API URLs in the `env` blocks)
- API + worker + CSMS deployed to a public host (see DEPLOYMENT.md)
- Stripe live keys + webhook configured for the production API URL
- APNs `.p8` key uploaded to EAS: `eas credentials` → iOS → Push Notifications

## Environment configuration

`eas.json` has three profiles. Each one bakes its `env.EXPO_PUBLIC_API_URL` into the build:

| Profile | API URL | Distribution |
|---|---|---|
| `development` | reads from `.env` (localhost) | internal dev client |
| `preview` | `https://api-staging.ednacharge.com` | internal TestFlight |
| `production` | `https://api.ednacharge.com` | App Store / production TestFlight |

Local dev still uses `.env` — EAS only reads the profile `env` block during a cloud build.

## Build + upload

```bash
cd apps/mobile

# 1. Bump version (only if shipping a user-visible change)
# Edit app.json: "version": "0.0.1" → "0.0.2"
# Build number auto-increments via eas.json autoIncrement:true

# 2. Build (15-25 min on EAS cloud)
eas build --platform ios --profile production

# 3. When EAS finishes, it asks "Submit to App Store Connect?"
# Say yes — uploads to TestFlight via Apple's API.

# Or submit manually later:
eas submit --platform ios --latest
```

## App Store Connect after upload

1. https://appstoreconnect.apple.com → app → **TestFlight** tab
2. Build shows in "Processing" for 10-30 min
3. When it flips to "Ready to Submit" → click → answer **Export Compliance**:
   - Uses encryption? **Yes** (HTTPS counts)
   - Qualifies for exemption? **Yes** (standard HTTPS-only exemption, TFR 1.5)
4. Build is now testable

## Invite testers

- **Internal**: TestFlight → Internal Testing → **+** → enter Apple IDs (up to 100). Instant access, no Apple review.
- **External**: TestFlight → External Testing → create a group → add testers (up to 10,000) OR generate a public link. First external build of each version waits ~24h for Apple beta review.

## What testers see

They open the TestFlight app on iOS, see EdnaCharge, tap Install. Updates push automatically when you ship a new `buildNumber`.

## Rolling a new build

```bash
# Make code changes...
git commit -am "fix: ..."

eas build --platform ios --profile production
# autoIncrement bumps buildNumber. EAS submits to TestFlight.
# Testers get a push within ~15 min of Apple processing the build.
```

No need to touch `buildNumber` manually — EAS owns it (`appVersionSource: remote` in eas.json).
