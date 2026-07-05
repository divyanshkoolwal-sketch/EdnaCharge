# EdnaCharge — Mobile Design Specification

**For:** Product designer redesigning the EdnaCharge mobile app frontend.
**Scope:** Every screen, every state, every flow. Hand this to a designer and they can produce complete designs without further engineering input.
**Last updated:** 2026-04-25.

---

## 1. Product overview

EdnaCharge is a peer-to-peer EV charging marketplace delivered as a single React Native mobile app.

- **Drivers** find home chargers near them on a map, send a booking request, chat with the host, and charge their car when accepted. Payment is automatic through saved cards.
- **Hosts** list a home charger they own, set price + availability, accept or decline incoming requests, and earn money on every session. EdnaCharge takes 15%.
- **Every user is a driver by default.** Anyone can opt into being a host without making a second account. Once they have both roles, a "role switcher" pill in the header swaps between the driver and host tab bars. Last-used role is remembered between sessions.

### The "wow" moment
When a driver taps **Start Session**, a big animated kWh counter ticks up in real time as the car charges. Everything else in the app exists to lead the user to that screen.

### Brand voice
- Direct, plain-language. Not chatty. No marketing fluff.
- Confident: "Send request", not "Maybe send request?"
- Honest: tell users what happens. "Your card will be pre-authorised, not charged."

---

## 2. Visual system (designer has latitude, these are the constraints)

These are the **non-negotiables**. Everything else is your call.

- **iOS-first**, but the design must hold up in Android Material defaults. No iOS-only metaphors that break on Android (e.g. don't rely on iOS's haptic-back swipe being visible).
- **Dark mode required.** Every screen has a light and a dark variant.
- **Dynamic type** must work — the OS-level text-size slider should scale text without breaking layout.
- **Safe areas** respected on every screen.
- **One primary action per screen.** It should always be the most visually obvious thing.
- **Pre-auth language is sacred.** Anywhere money is mentioned before a charge, the word "pre-auth" or "hold" must appear. Drivers freak out otherwise.
- **System messages in chat** are visually different from user messages — typically centered, smaller, gray.
- **Live session screen** has its own treatment — full-screen modal, no tab bar visible, dark by default even in light mode.

### Suggested but not required
- Color: a single accent (current code uses black for action, emerald for "available", red for stop). Designer can repaint.
- Typography: a single sans-serif family with a lighter and a bold weight is enough.
- Iconography: SF Symbols on iOS / Material on Android, or a single icon set like Lucide.

---

## 3. Information architecture

### Top-level structure

```
(unauthenticated)             (authenticated)
─────────────────             ─────────────────────────────────────────
Welcome                       Driver tab bar          Host tab bar
  ↓                           ─────────────           ─────────────
Sign in                       • Map                   • Home
  ↓                           • Bookings              • Chargers
Email OTP                     • Chats                 • Requests (badge!)
  ↓                           • Profile               • Earnings
Driver profile                                        • Profile
  ↓
Map (driver default)          Both share the same Chats. Switching role
                              swaps the tab bar but keeps the user logged in.
```

### Role-switching
- Profile screen has a switcher pill at the top.
- If user has only `driver` role: pill says **"Become a host"** → opens host onboarding flow.
- If user has both roles: pill says **"Switch to host"** / **"Switch to driver"** → instantly swaps tab bars.

### Modal vs push navigation
- **Pushed (back arrow)**: detail screens, edit screens, multi-step flows.
- **Modal (close X)**: live session, payment sheets, share sheets, photo viewers.

---

## 4. Shared building blocks (component library)

These reusable primitives appear on many screens. Design once, use everywhere.

| Primitive | Where it appears | Notes |
|---|---|---|
| **Primary button** | Bottom CTA on every flow screen | Full-width, single dominant color |
| **Secondary button** | Secondary actions ("Cancel", "Skip") | Outlined, lower weight |
| **Destructive button** | Sign out, cancel booking, decline request | Red border or red fill |
| **Text input** | Forms (profile, identity, address, message) | Floating label or top-label, error state with helper text |
| **Connector chips** | Driver profile + add-charger — pick from J1772, NACS, Tesla, CCS1, CHAdeMO | Multi-select looking, single-select behavior |
| **Tier badge** | Charger detail, host charger card | Pill with the tier name (Tier 3 OCPP / Tier 4 Hourly) |
| **Status pill** | Booking status everywhere | pending / confirmed / active / completed / declined / cancelled — each gets a color |
| **Star rating** | Reviews, charger detail | 1–5 stars, both display and input variants |
| **Avatar** | Chat header, profile, request review | Initial-fallback when no photo |
| **Money display** | Receipts, earnings, request review | Always shows currency + uses tabular numbers |
| **Empty state** | Lists with no items | Icon + headline + helper text + (optional) CTA |
| **Skeleton loader** | Replaces lists/cards while loading | Shimmer effect, matches the loaded layout |
| **Toast** | Non-blocking confirmations ("Charger published") | Top of screen, auto-dismiss |
| **Bottom sheet** | Charger detail from map, filters | Drag-to-dismiss, two snap points |
| **Stepper** | Multi-step flows (host onboarding, add-charger) | Top of screen, "Step 3 of 7" |
| **Quick reply chip** | Chat composer | Above text input, tappable |

---

## 5. Screen-by-screen specification

For every screen below:
- **Purpose** — why this screen exists in one sentence.
- **Entry** — how users get here.
- **Layout** — visible content, top to bottom.
- **States** — loading / empty / error / success.
- **Actions** — what users can tap, and where each goes.

### Status legend used in tables
- 🟢 Done in code, ready for redesign
- 🟡 Partially done; flow exists but UI minimal
- 🔴 Not yet built but spec'd

---

## 6. Authentication flow (4 screens)

### 6.1 Welcome (`/(auth)/welcome`)  🟢
**Purpose:** First impression. Convince the user this app is for them.

**Entry:** App opens unauthenticated.

**Layout:**
- Hero artwork or illustration (designer's call) — should evoke "home + EV" together.
- Big headline: "Charge where you live."
- Sub-headline: "Find, book, and pay for EV charging at homes near you."
- Optional below: 3 short value bullets (e.g. "Verified hosts", "Pay only for what you use", "Book in seconds").
- Footer: small print "By continuing you agree to terms & privacy."

**Primary action:** "Continue with email" → Sign in.

**No states beyond default.**

### 6.2 Sign in (`/(auth)/sign-in`)  🟢
**Purpose:** Capture the user's email so we can send them a code.

**Layout:**
- Back arrow.
- Title: "Your email"
- Subtitle: "We'll send you a 6-digit code."
- Single email input (auto-cap off, email keyboard).
- Primary action: "Send code" — disabled until valid email.

**States:**
- **Idle**: button disabled if email empty/invalid.
- **Sending**: button shows spinner + "Sending…", disabled.
- **Error**: inline error under the input ("That email address looks invalid").

**Exit:** Successful send → OTP screen with email passed as param.

### 6.3 OTP (`/(auth)/otp`)  🟢
**Purpose:** Verify the email by entering the 6-digit code.

**Layout:**
- Back arrow.
- Title: "Enter the code"
- Subtitle: "Sent to **email@example.com**" (the email is bold).
- 6-digit code input — designer's choice between one wide field or 6 separate boxes. Both are common. **Auto-advance** between boxes if you go with separate.
- Resend code link below input — disabled for 30s after a send, shows countdown ("Resend in 23s"), then enabled.
- Primary action: "Continue" — disabled until 6 digits.

**States:**
- **Verifying**: spinner in button.
- **Wrong code**: shake animation + inline error "That code didn't work. Try again or resend."
- **Expired**: "Code expired. Tap Resend."

**Exit:**
- New user (no driver profile yet) → Driver Profile.
- Returning user → Map (or Home if last role was host).

### 6.4 Driver profile (`/(auth)/driver-profile`)  🟢
**Purpose:** Collect minimum required info so a driver can be matched to a charger.

**Layout (scrollable form):**
- Header: "Tell us about your ride."
- Field: **Your name** (text)
- Field: **Make** (text — "Tesla", "Ford")
- Field: **Model** (text — "Model 3", "Mach-E")
- Field: **Year** (number)
- Field: **Connector type** — chip selector with the 5 options (J1772, NACS, Tesla, CCS1, CHAdeMO). One must be selected.
- Field (optional): **License plate** (text).
- Primary action: "Continue to map".

**States:**
- **Saving**: button shows "Saving…", disabled.
- **Validation error**: inline under the offending field.

**Exit:** Driver tab bar's Map screen.

---

## 7. Driver flow

### 7.1 Map (`/(driver)/map`)  🟢
**Purpose:** Discover chargers visually. The hero screen of the driver experience.

**Layout:**
- Full-screen Mapbox map.
- Top-right floating: optional filter button (future) and a "🔍 Search this area" pill that appears only after the user pans the camera.
- Bottom-right floating: recenter button (📍).
- Top edge: search/location bar (future v1.1 — for v1, location is auto-detected).
- Pin design:
  - Available charger: emerald circle with white "⚡" glyph.
  - Unavailable charger: gray circle with same glyph.
  - Cluster: black/white circle with the count number ("12").
- Tab bar at the bottom: Map (selected), Bookings, Chats, Profile.

**States:**
- **No location permission**: still show map centered on a region default; recenter button shows an "enable location" dialog when tapped.
- **Loading**: small spinner badge at top right.
- **Empty (no chargers)**: centered card overlay "No chargers in this area. Try panning out."
- **Error**: a small banner at top "Couldn't load chargers. Tap to retry."

**Actions:**
- Tap a pin → Charger Detail (bottom sheet, modal).
- Tap a cluster → camera zooms in to expand it.
- Tap "Search this area" → re-queries chargers around new center.
- Tap recenter → pans back to user.

### 7.2 Charger detail (`/(driver)/charger/[id]`)  🟢
**Purpose:** Show everything a driver needs to decide whether to book.

**Layout (presents as a 65%-height bottom sheet over the map):**
- Drag handle at top.
- Photo (big, hero — placeholder if no photo).
- Title (charger nickname).
- Row: host avatar + host name + their overall star rating ("Hosted by Sarah · ⭐️ 4.9").
- Distance + ETA: "1.4 km · 6 min drive".
- Specs row: connector chip + power chip + tier chip ("J1772 · 7.2 kW · Tier 3").
- Price: big — "$0.28/kWh" or "$5.00/hour".
- **Availability indicator**: green dot "Available now" OR "Next window: Thu 3pm".
- Section: **House rules** (if present, otherwise hidden).
- Section: **Recent reviews** — up to 3 review cards (stars + text + reviewer first name).
- Bottom-pinned primary action: **"Request booking"**.

**States:**
- **Loading**: skeletons for photo, title, specs, reviews.
- **Charger removed/unpublished**: empty state "This charger isn't available anymore."
- **No reviews**: section says "No reviews yet — be the first."

**Exit:** "Request booking" → Request flow.

### 7.3 Request booking (`/(driver)/request/[chargerId]`)  🟢
**Purpose:** Capture time + duration + an optional message, then submit.

**Layout (full-screen, scrollable):**
- Back arrow + title "Request booking".
- Top: charger name + key specs (compact).
- Section: **Duration** — chips for 0.5h / 1h / 2h / 3h / 4h / 8h. (Or a slider, designer's call.)
- Section: **Message to host (optional)** — multiline text input, max 500 chars, placeholder "e.g. arriving at 3:15, blue Model 3".
- Section: **Estimated cost** breakdown (clearly labeled it's an estimate):
  - Energy: ~$2.02
  - Platform fee (15%): $0.30
  - Pre-auth on your card: $2.32
  - Small grey help text: "Your card is held — you'll only be charged for what you actually use."
- Bottom-pinned primary action: **"Send request"**.

**States:**
- **Submitting**: button "Submitting…" with spinner.
- **No card on file**: redirect to Payment Methods first; banner explains "Add a card to request bookings."
- **Charger unavailable**: error message "This charger is no longer available."

**Exit:** Successful request → Booking detail screen with status "pending".

### 7.4 Bookings list (`/(driver)/bookings`)  🟢
**Purpose:** All bookings the driver has ever made, most recent first.

**Layout:**
- Title "Your bookings" at top.
- Optional filter pills: All / Upcoming / Past (designer's call).
- List of cards, each:
  - Charger title (bold)
  - Date + time window
  - Status pill (pending / confirmed / active / completed / declined / cancelled)
  - Right-side chevron.
- Tab bar at bottom.

**States:**
- **Empty**: "No bookings yet. Find a charger →" (CTA navigates to Map).
- **Loading**: 3 skeleton cards.

**Action:** Tap a card → Booking Detail.

### 7.5 Booking detail (`/(driver)/booking/[id]`)  🟢
**Purpose:** See full booking info; take the next action depending on status.

**Layout:**
- Back arrow + title "Booking".
- Status pill (large, prominent at top).
- Charger card: photo + name + address.
- Time block: start → end (e.g. "Today, 3:00 PM → 4:00 PM").
- Pricing block (if confirmed/active/completed): pre-auth amount, captured amount.
- **Open chat with host** button (always visible until thread closes — see §10).
- **Action button** depends on status:
  - `pending` → secondary "Cancel request"
  - `confirmed` → primary "Start session" (lights up at the booking start time, otherwise greyed with helper text "Available at 3:00 PM")
  - `active` → primary "View live session"
  - `completed` → primary "View receipt"
  - `declined` / `cancelled` → no action; show a small reason if present.

**States:**
- Polling every few seconds for live status updates.
- **Loading**: skeleton.
- **Error**: "Couldn't load this booking" with retry.

**Exit:**
- Chat → Chat thread.
- Start session → Live Session.
- Cancel → confirmation modal "Cancel this request?" → on confirm, status flips to cancelled.

### 7.6 Live session (`/(driver)/session/[id]`)  🟢 — **THE WOW MOMENT**
**Purpose:** Show charging is happening. Make the user feel the energy is real.

**Layout (full-screen modal, dark by default, no tab bar):**
- Top: small header "Charging" + charger name + host name (compact).
- Center, dominant: **giant kWh counter** (e.g. "3.42 kWh") — must animate as new meter values arrive.
- Below counter: running cost ("$0.96").
- Below cost: small power line ("7.1 kW · 240V · 30A") — current draw.
- Optional: a small 60-sample sparkline of power (kW) over time.
- Elapsed time displayed somewhere (e.g. "00:14:32").
- Bottom-pinned: **STOP button** — full-width, red, very tall (64pt height equivalent), bold. Haptic on tap.

**States:**
- **Pre-first-sample**: "Waiting for first meter reading…" + small spinner — no values shown yet.
- **Stopping**: STOP button becomes "Stopping…" with spinner; user cannot tap again.
- **Error**: full-screen overlay with error and a "Get help" CTA → Support.

**Exit:** Stop → Receipt screen.

### 7.7 Receipt (`/(driver)/receipt/[id]`)  🟢
**Purpose:** Wrap up the session with a clean summary, prompt for a review.

**Layout (full-screen, scrollable):**
- Title: "Session complete"
- Hero number: final kWh (e.g. "3.42 kWh") in big.
- Pricing breakdown:
  - Energy: $0.96
  - Platform fee (15%): $0.14
  - **Total charged:** $1.10 (bold, larger)
  - Small grey: "Your pre-auth of $2.32 was released; we only captured what you used."
- Map snapshot of the charger location (small).
- Section: **Rate your host** — 5-star input + optional text.
- Primary action: "Submit review".
- Secondary: "Message host" → reopens the chat thread.
- Tertiary: "Done" → back to Bookings.

**States:**
- **Settling** (still capturing): show a banner "Settling final amount…" — review submit disabled until status flips to completed.
- **Review submitted**: replace the rating section with "Thanks for the rating ⭐️ 5".

### 7.8 Chats list (`/(driver)/chats`)  🟢
**Purpose:** All threads the user has, sorted by most recent message.

**Layout:**
- Title "Chats".
- List rows:
  - Avatar of counterparty
  - Counterparty name (bold)
  - Booking time + status pill (small)
  - Last message preview (1 line)
  - Right side: timestamp ("2m") and unread badge if any
- Tab bar.

**States:**
- **Empty**: "No conversations yet."
- **Loading**: skeletons.

**Action:** Tap row → Chat Thread.

### 7.9 Chat thread (`/(driver)/chat/[bookingId]`)  🟢
**Purpose:** 1:1 messaging with the counterparty for a single booking.

**Layout:**
- Top header: counterparty name + booking summary mini ("Today 3pm · Confirmed") + "View booking" link.
- Scroll area: bubble layout. **System messages** (e.g. "Booking confirmed by host") are centered, smaller, gray.
- **Quick reply chips** above the composer: "On my way ✓", "Please pull to the right", "Gate code is 1234". Each chip, when tapped, fills the composer (or sends immediately — designer's call).
- Composer at bottom: + icon (stub for v2), multiline text input, send button.
- Read receipts: subtle "Seen" under your last message that the counterparty has read.
- Typing indicator: 3-dots animation when counterparty is typing.

**States:**
- **Read-only** (48h after booking ends): composer is greyed out with helper text "This conversation is closed."
- **Empty thread (just opened)**: show the system "Booking requested" message and nothing else.
- **Failed send**: red icon + "Tap to retry" on the failed bubble.
- **Media + button (v2)**: tapping the + shows a sheet with stubs ("Photo", "Video") that say "Coming soon".

### 7.10 Profile (driver) (`/(driver)/profile`)  🟢
**Purpose:** Account hub. Role switcher. Common settings.

**Layout (scrollable):**
- Header: avatar (big) + name + overall star rating + email.
- Role switcher pill at top:
  - Has host role → "Switch to host" pill.
  - No host role → **"Become a host"** card (more prominent — full-width with an arrow) → opens host onboarding.
- Section: "Account"
  - Payment methods → /(shared)/payment-methods
  - Notifications → /(shared)/notifications
  - Settings → /(shared)/settings
  - Support → /(shared)/support
- Section: "Sign out" (destructive style).

---

## 8. Host flow

### 8.1 Host home (`/(host)/home`)  🟢
**Purpose:** The host's at-a-glance dashboard for today.

**Layout (scrollable):**
- Header: "Today" + date.
- Top stat tiles row:
  - **Pending requests** count (links to Requests)
  - **Today's earnings** to date
  - **Active session?** chip (green when one is running)
- Section: "Today's schedule" — list of confirmed bookings for today, time-ordered.
- Section: "Your chargers" — list of host's chargers (compact rows, status pill on each).
- Bottom-pinned secondary: "Add a charger" if they have <2; otherwise this lives in the Chargers tab only.
- Tab bar.

**States:**
- **No chargers yet** (just finished onboarding): big card "Add your first charger" with friendly illustration.
- **Loading**: skeletons.

### 8.2 Host onboarding intro (`/(host)/host-onboarding/intro`)  🟢
**Purpose:** Sell the host on hosting. Set expectations.

**Layout:**
- Hero artwork (illustration of a home charger + plug).
- Title: "Become a host".
- Sub: "List your home charger in 5 minutes. Drivers book it; you earn 85% of every session."
- 3 bullets of value:
  - Typical hosts earn $40–$200/month.
  - You decide the price, schedule, and house rules.
  - Every request is yours to accept or decline.
- Primary: "Get started".

### 8.3 Identity (`/(host)/host-onboarding/identity`)  🟢
**Purpose:** Capture personal info needed for Stripe Connect.

**Layout (scrollable form, stepper at top "Step 1 of 4"):**
- Title: "Identity".
- Sub: "Required for Stripe Connect payouts."
- Field: **Legal full name**
- Field: **Date of birth** — date picker (not free text).
- Field: **Street address**
- Row: **City** + **State** (small) + **ZIP** (small).
- Country defaults to US (could be a dropdown but not required for v1).
- Primary: "Continue".

### 8.4 Charger identification (`/(host)/host-onboarding/charger-identification`)  🟢 — **branching flow**
**Purpose:** 6 questions that determine the host's hardware tier (Tier 1–4). One question per step.

**Layout (per step):**
- Stepper at top "Step X of 6".
- Single question as headline.
- Choice list (large tap targets, single-select).
- Bottom: "Next" (after they pick).
- Back arrow returns to previous step (state preserved).

**The 6 steps:**

**Step 1 — How is your EV currently charged at home?**
- Wall outlet (Level 1, 120V)
- Installed home charger (Level 2, 240V)
- No charger yet, but I'm interested
- I'm not sure

→ Only "Installed Level 2" goes to Step 2; everything else jumps to Step 4.

**Step 2 — What brand/model is your charger?**
- Searchable dropdown of brands:
  - Tesla Wall Connector
  - ChargePoint Home Flex
  - Wallbox Pulsar Plus
  - Enel X JuiceBox
  - Emporia EV Charger
  - Grizzl-E
  - EO Mini
  - Other (free text input appears below)

**Step 3 — Does your charger have Wi-Fi / an app?**
- Yes
- No (hard-wired only)
- Not sure

**Step 4 — Connector type**
- 5 chips: J1772 / NACS / Tesla / CCS1 / CHAdeMO

**Step 5 — Power output (kW)**
- Preset chips: 1.4 / 3.3 / 7.2 / 11 / 19.2
- Free-text input below for "Other".
- Help text: "Look on the charger's label or in the manual — usually printed on the side."

**Step 6 — Can you see your energy use?** *(this is the tier deciding question)*
- "My charger shows kWh in its app" → **Tier 3 (OCPP-native)**
- "It has Wi-Fi but no app / a basic app" → **Tier 2 (bridge kit)**
- "I have a smart plug or would like one" → **Tier 1 (smart plug)**
- "None of the above" → **Tier 4 (unmetered, hourly pricing)**

**Step 7 — Result screen (auto, after Step 6):**
- Big check mark or icon.
- Tier-specific copy:
  - Tier 3: **"You're all set."** "We'll give you your charger's connection details when you list it."
  - Tier 2: **"We'll ship you a free bridge kit."** "Shipping takes 3–5 days. You can finish listing now and go live once it arrives."
  - Tier 1: **"We'll ship you a free smart plug."** Same shipping copy.
  - Tier 4: **"No metering required."** "You can still list, but you'll price by the hour instead of per kWh."
- Primary: "Continue to payouts" → Stripe Connect step.

### 8.5 Stripe Connect (`/(host)/host-onboarding/stripe-connect`)  🟢
**Purpose:** Hand the user off to Stripe's hosted onboarding flow inside a WebView.

**Layout:**
- Loading state first (while we fetch the Stripe URL): centered spinner + "Preparing payouts…".
- Then: full-screen WebView pointed at Stripe's URL.
- Bottom bar: "I'm done — check status" (manual fallback for users who close the Stripe flow themselves).
- Auto-poll status in the background; auto-advance when complete.

**States:**
- **Stripe error**: error overlay "Couldn't reach Stripe. Try again." with retry CTA.
- **In progress**: WebView visible.
- **Complete**: auto-navigate to Done screen.

### 8.6 Done (`/(host)/host-onboarding/done`)  🟢
**Purpose:** Celebrate, send them to add their first charger.

**Layout:**
- Confetti or simple success state (designer's call).
- Title: "You're a host." (period intentional)
- Sub: "Let's list your first charger."
- Primary: "Add charger" → switches role to host + opens add-charger.

### 8.7 Chargers list (`/(host)/chargers`)  🟢
**Purpose:** All chargers this host owns.

**Layout:**
- Title "Your chargers".
- List of charger cards:
  - Title
  - Address (small, grey)
  - Specs ("J1772 · 7.2 kW")
  - Status pill ("Available", "Offline", "Faulted")
  - Right chevron.
- Bottom-pinned primary: "Add another charger".

**States:**
- **Empty**: "No chargers yet" with "Add your first" CTA.

### 8.8 Add charger (`/(host)/add-charger`)  🟢 — **5-step wizard**
**Purpose:** List a new charger end-to-end.

**Layout (per step, stepper at top, back arrow preserves state):**

**Step 1 — Photo**
- Title "Add a photo of your charger".
- Two big tiles: "Take photo" / "Choose from library".
- Selected photo shows as a preview with a "Replace" link.
- Primary: "Next" — disabled if no photo.

**Step 2 — Address**
- Title "Where is it?"
- Mapbox autocomplete address field.
- After picking, a small map showing the pin — drag to nudge if not exactly right.
- Primary: "Confirm location".

**Step 3 — Hardware**
- Title "Charger details".
- Pre-filled from the host's charger-identification answers — editable.
- Connector chip selector.
- Power kW input.
- Tier (read-only, with a "Change" link that re-opens the identification flow).
- Primary: "Next".

**Step 4 — Pricing**
- Title "Set your price".
- Toggle: $/kWh (Tier 1–3) vs $/hour (Tier 4) — Tier 4 forces $/hour, others force $/kWh.
- Currency input ($0.28).
- Helper text below: "Drivers near you pay around $0.28/kWh on average."
- Primary: "Next".

**Step 5 — Availability**
- Title "When are you available?"
- Sub: "Drivers can only request bookings during these times."
- Per-day rows (Mon → Sun):
  - Toggle on/off
  - Start time + end time pickers (visible only when on).
- Below: "Available right now" toggle (instant ad-hoc availability override).
- Primary: "Review".

**Review & publish (final step):**
- Summary card showing every field.
- Edit links per section ("Edit photo", "Edit hours").
- Checkbox: "I agree to the host terms."
- Primary: "Publish charger" — disabled until checkbox checked.

**Success state (after publish):**
- For Tier 3: a sheet appears: **"Your OCPP credentials"** with:
  - WSS URL: `wss://csms.ednacharge.com/...`
  - Charge Point ID: `cp-xxxx`
  - Password: `••••••••` with show/copy/rotate buttons.
  - Help text: "Paste these into your charger's admin panel."
- For Tiers 1, 2, 4: simple toast "Charger published. Drivers can see it now."
- Both navigate to the new charger's detail screen.

### 8.9 Host charger detail (`/(host)/charger/[id]`)  🟢
**Purpose:** Edit / inspect a single owned charger.

**Layout:**
- Photo (with edit affordance).
- Title (editable).
- Address.
- Hardware specs (with link to edit).
- Pricing (with link to edit).
- Availability summary (with link to edit).
- Status pill + manual "Pause" toggle (takes the charger off the map).
- For Tier 3: button "Reveal OCPP credentials" → modal showing the same sheet from publishing time, with rotate.
- Destructive: "Delete this charger" at the bottom (with confirmation).

### 8.10 Calendar (`/(host)/calendar`)  🟡
**Purpose:** Visual schedule of all confirmed bookings across all chargers.

**Layout:**
- Month/week toggle at top.
- Calendar grid with bookings as time blocks.
- Tap a block → Booking Detail (host view).

**States:**
- **Empty**: "No upcoming bookings."

### 8.11 Earnings (`/(host)/earnings`)  🟢
**Purpose:** Show how much the host has earned, and when payouts hit their bank.

**Layout:**
- Top: lifetime gross earnings (big number).
- This week / month tabs.
- Bar chart of weekly earnings.
- Section: **Pending payouts** — money earned but not yet transferred to bank, with ETA.
- Section: **Recent sessions** — list of completed bookings with the amount.
- "Manage payout method" link → Stripe Connect dashboard (WebView or system browser).

**States:**
- **No earnings yet**: "Your first earnings will show up here."

### 8.12 Requests (`/(host)/requests`)  🟢
**Purpose:** Pending booking requests that need a host decision. **This tab gets a red badge with a count** when there are pending requests.

**Layout:**
- Title "Requests".
- List of cards, ordered oldest first (so the most-urgent-to-respond is on top):
  - Driver avatar + name.
  - Driver's profile rating.
  - Time window (e.g. "Today 3:00 PM → 4:00 PM").
  - Estimated kWh + estimated earnings.
  - Time remaining to respond ("23 min left" — counts down to 30-min auto-decline).
  - Right chevron.

**States:**
- **Empty**: "No pending requests."
- **Auto-declined**: when the timer hits 0, the row updates to "Auto-declined — driver is notified."

### 8.13 Request review (`/(host)/request/[id]`)  🟢
**Purpose:** Decide on a single request. Most important screen for hosts.

**Layout (scrollable):**
- Top: driver card — avatar + name + their rating + small profile button.
- Time window (big, prominent).
- Estimated kWh + estimated earnings (your take after fees).
- Driver's attached message (in a quoted/italicized block).
- "Open chat with driver" button (so they can ask questions before deciding).
- Bottom-pinned actions, two buttons stacked:
  - Primary: **"Accept"**
  - Secondary destructive: **"Decline"** — opens a sheet "Why are you declining? (optional)" with a free-text field.

**States:**
- **Accepted** (after action): success state, redirect back to Requests; the row disappears.
- **Declined**: same flow, with the driver getting a push.

### 8.14 Profile (host) (`/(host)/profile`)  🟢
**Purpose:** Same as driver profile but with role-aware content.

**Layout:**
- Header: avatar + name + rating.
- Role switcher: "Switch to driver".
- Account section: same items as driver (Payment methods, Notifications, Settings, Support).
- **Host-only**: "My setup" link (re-opens charger-identification if their hardware changes).
- Sign out.

---

## 9. Shared screens (4)

### 9.1 Settings (`/(shared)/settings`)  🟡
**Purpose:** Account-level controls.

**Layout:**
- Section: **Account**
  - Edit profile photo
  - Edit name
  - Email (display, not editable)
  - Phone (display, with verify CTA if unverified)
- Section: **Preferences**
  - Theme: Light / Dark / System
  - Distance units: km / mi
  - Language (display only for v1)
- Section: **Privacy**
  - Analytics opt-out toggle
- Section: **Legal**
  - Terms
  - Privacy policy
- Section: **Danger zone**
  - Delete account (destructive)

### 9.2 Payment methods (`/(shared)/payment-methods`)  🟢
**Purpose:** Add/manage cards for booking pre-auths.

**Layout:**
- Title "Payment methods".
- List of saved cards:
  - Card brand icon + last 4 + expiry
  - "Default" tag on the chosen one
  - Tap to make default
  - Swipe-to-delete with confirmation.
- Bottom: **"Add card"** primary button → opens Stripe PaymentSheet (Stripe-styled, not custom).

**States:**
- **Empty**: "No cards yet" + Add Card primary.
- **Stripe down**: error message "Card storage is temporarily unavailable" (the API surfaces a 503 cleanly).

### 9.3 Notifications (`/(shared)/notifications`)  🟡
**Purpose:** Mirror the push notification history for users who dismissed pushes; manage push preferences.

**Layout:**
- Tabs at top: **Activity** and **Settings**.
- **Activity**: list of last 30 days of events (booking accepted, message, session ended) — each tappable to deep-link to the relevant screen.
- **Settings**:
  - Master mute toggle.
  - Per-event toggles:
    - New chat messages
    - Booking accepted/declined
    - Session start reminders
    - Marketing (off by default)

**States:**
- **Empty activity**: "No notifications in the last 30 days."

### 9.4 Support (`/(shared)/support`)  🔴 (stub today)
**Purpose:** Help center + contact.

**Layout:**
- Search field for help articles.
- Common questions list (FAQ).
- "Contact us" → opens default email client to support@ednacharge.com.

---

## 10. Critical cross-cutting flows

### 10.1 The booking lifecycle — what the user sees end to end

```
Driver                                     Host
──────────                                 ──────────
Request booking
  ↓
Status: pending           ─push→           Requests tab badge
  ↓                                          ↓
(waits in chat)                           Open request
  ↓                                          ↓
                                          Accept ── push →  Driver: "Booking confirmed"
  ↓                                                           ↓
At start time:                                              Status: confirmed
"Start session" lights up                                     ↓
  ↓
Tap Start                ─OCPP cmd→       Charger receives RemoteStartTransaction
  ↓
Live session screen
(kWh ticking up)
  ↓
Tap Stop                  ─OCPP cmd→      Charger receives RemoteStopTransaction
  ↓
"Stopping…"
  ↓
Receipt
  ↓
Submit review            ─push→           Counterparty: "You got a 5-star review"
```

### 10.2 The 30-min auto-decline

If a host doesn't tap accept or decline within 30 minutes of the request, the system auto-declines:

- Driver gets a push: "Your request expired — try another charger."
- Host gets a push: "Request from Sam expired."
- The request row in the host's Requests tab updates to a faded "Auto-declined" state for 24h, then disappears.
- Pre-auth on driver's card is released by Stripe automatically.

### 10.3 Push notifications taxonomy

Every push has a deep-link target.

| Trigger | Recipient | Lands on |
|---|---|---|
| New booking request | Host | Request review |
| Booking accepted | Driver | Booking detail |
| Booking declined / auto-declined | Driver | Booking detail |
| New chat message | Counterparty | Chat thread |
| 30 min before session start | Driver | Booking detail |
| Session started | Both | Live session |
| Session stopped / receipt ready | Both | Receipt |
| Review left | Counterparty | Booking detail |

### 10.4 Empty states checklist

Every list screen needs an empty state. Here's the master list:

| Screen | Empty headline | CTA |
|---|---|---|
| Map (no chargers) | "No chargers in this area." | "Try panning out" |
| Driver Bookings | "No bookings yet." | "Find a charger →" → Map |
| Driver Chats | "No conversations yet." | (no CTA) |
| Host Home (no chargers) | "Add your first charger." | "Add charger" → wizard |
| Host Chargers | "No chargers yet." | "Add your first charger" |
| Host Requests | "No pending requests." | (no CTA) |
| Host Earnings | "Your first earnings will show up here." | (no CTA) |
| Notifications activity | "No notifications in 30 days." | (no CTA) |
| Payment methods | "No cards yet." | "Add card" |

### 10.5 Loading states

- **List screens**: 3–5 skeleton rows that match the row layout.
- **Detail screens**: skeleton blocks for hero image, title, sections.
- **Forms**: never block on load; show form immediately, button shows spinner on submit.
- **Map**: small spinner badge top-right while fetching pins; map itself stays interactive.

### 10.6 Error states

- **Network down**: full-screen overlay "Couldn't reach EdnaCharge. Check your connection." with retry.
- **Server error (500)**: same shape, copy: "Something went wrong on our end. We're looking into it."
- **Stripe unavailable**: surfaced inline ("Card storage is temporarily unavailable.") rather than full-screen.
- **Payment auth failure**: a sheet on top of the request screen with the Stripe error and "Try again" / "Use different card" buttons.

---

## 11. Out of scope for v1 (do not design)

Per the PRD, **explicitly do not include in the redesign**:

- In-app voice or video calling.
- Image / video / file attachments in chat (the + button shows "Coming soon").
- Group chat or standalone DMs (chats are always tied to a booking).
- Apple Pay / Google Pay (only Stripe PaymentSheet card flow in v1).
- Driver identity verification (we collect host identity for Stripe; drivers are anonymous beyond name).
- Dispute / arbitration UI.
- Recurring bookings / subscriptions.
- Dynamic pricing.
- Multi-language UI.
- Tablet or web-responsive layouts.

---

## 12. Designer deliverables checklist

For the designer to ship a complete set of designs, they should produce:

- [ ] Light + dark variants for **every** screen below.
- [ ] All states: idle / loading / empty / error / success / offline.
- [ ] Component library (the primitives in §4).
- [ ] iconography sheet (charger pin, status icons, tab bar icons).
- [ ] Push notification mock-ups for the 8 trigger types.
- [ ] Onboarding hero illustrations (Welcome, Host Intro).
- [ ] Empty-state illustrations (per the table in §10.4).
- [ ] App icon + splash screen.
- [ ] Screenshots set for App Store + Play Store (5–8 per platform).

### Screen count
- Auth flow: **4** screens
- Driver flow: **10** screens
- Host flow: **14** screens (incl. 6-step branching identification + 5-step wizard)
- Shared: **4** screens
- **Total ~32 unique screens**, each needing 2 themes × ~4 states ≈ **~250 distinct frames**.

---

## 13. References designers should look at

- **Tesla supercharger UX** for the live-session counter feel.
- **Airbnb host onboarding** for the host flow tone (matter-of-fact, not gimmicky).
- **Lyft / Uber** for map + booking request UI patterns.
- **Stripe's checkout UI** for payment screens (we can't redesign Stripe's PaymentSheet, but we should match its tone in surrounding screens).

---

**End of spec.** Open questions can go into a separate `DESIGN_QUESTIONS.md` and we'll resolve them with engineering.
