# EdnaCharge Hardware Integration Plan

## Overview

Three hardware tiers based on what the host already owns. The core pattern is a **virtual OCPP adapter** — Tier 1 and Tier 2 devices are wrapped in a `ChargerDriver` interface that emits synthetic OCPP events (StartTransaction, MeterValues, StopTransaction) into the same pipeline Tier 3 already uses. Billing, the `ChargingSession` table, and the mobile UI are tier-agnostic.

---

## Hardware Selections

### Tier 1 — Smart Plug (120V Level 1)

| Field | Value |
|---|---|
| **Device** | Shelly Plug S Gen3 |
| **SKU** | `SNPL-00112US` |
| **Price** | ~$22–28 |
| **Rating** | 15A, 120V, 1.8 kW max |
| **Protocol** | Local HTTP RPC + MQTT + cloud API |
| **Certification** | UL/ETL listed |

**Why Shelly over alternatives:**

| Alternative | Reason Rejected |
|---|---|
| TP-Link Kasa KP115 | No official local API — reverse-engineered `python-kasa` only |
| Emporia Smart Plug | Cloud-only API — unacceptable for billing-critical path |
| Belkin Wemo Insight | Discontinued |

### Tier 2 — CT Clamp / Bridge Kit (240V Level 2, hard-wired)

| Field | Value |
|---|---|
| **Device** | Shelly Pro EM-50 |
| **SKU** | `SPEM-002CEBEU50` |
| **Price** | ~$110 (CT clamps included) |
| **CT Rating** | 2× 50A clamps (split-phase 240V) |
| **Protocol** | Local HTTP RPC + MQTT + cloud API |

**Optional contactor (for hard power cut):**

| Option | Rating | Price |
|---|---|---|
| Eaton C25BNB240A | 40A 2-pole, 24VAC coil | ~$40 |
| Schneider LC1D40A | 40A 2-pole, 24VAC coil | ~$55 |

> **MVP recommendation: monitoring-only (no contactor).** Host clips CT clamps over the wires — no electrician, no invasive install. Start/stop detection is threshold-based on measured current. Add contactor control in a later phase when you have licensing and liability coverage.

**Why Shelly across both tiers:** Only vendor at this price point with documented local HTTP RPC + MQTT + cloud API + UL/ETL listing on the same firmware family. Lets a single `ChargerDriver` abstraction wrap both tiers.

| Alternative | Reason Rejected |
|---|---|
| IotaWatt | No relay output; great monitor but more expensive and control requires separate device |
| Emporia Vue 2 | Cloud-only API |
| Shelly EM Gen1 | Relay too small (2A) to drive a contactor reliably |

### Tier 3 — OCPP Native

No hardware needed. ChargePoint Home Flex, Wallbox, and other modern chargers support OCPP 1.6 natively. Already working via `apps/csms` + `ocpp-rpc`.

---

## Firmware Decision

**Stock Shelly only — never Tasmota/ESPHome on shipped units.**

Flashing custom firmware voids the UL/ETL listing and makes EdnaCharge the manufacturer-of-record for product liability. For an EV charging system installed in someone's home, this is uninsurable startup risk.

Custom firmware (ESPHome only, not Tasmota) is acceptable only on hardware EdnaCharge designs in-house. Until then: stock firmware, leverage Shelly's existing OTA infrastructure.

---

## Architecture: Virtual OCPP Adapter

### ChargerDriver Interface

```typescript
// packages/schemas/src/charger-driver.ts

interface MeterReading {
  kwh: number;
  powerW: number;
  timestamp: Date;
}

interface ChargerDriver {
  deviceId: string;
  start(bookingId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  getMeter(): Promise<MeterReading>;
  onMeterValue(cb: (reading: MeterReading) => void): () => void; // returns unsubscribe
}
```

Every new device class implements this interface and feeds synthetic events into the existing OCPP event stream. Billing logic never branches by tier.

```
apps/worker/src/drivers/shelly-plug.ts   — Tier 1
apps/worker/src/drivers/shelly-em.ts     — Tier 2
apps/csms/src/...                        — Tier 3 (already exists)
```

### Synthetic OCPP Event Flow

```
Tier 1/2 device
      │
      │  MQTT telemetry
      ▼
 EMQX Broker  ◄──────────────────── apps/worker subscribes
      │
      │  ChargerDriver.onMeterValue()
      ▼
 ShellyPlugDriver / ShellyEmDriver
      │
      │  emits synthetic events
      ▼
 same pipeline as Tier 3:
   StartTransaction → ChargingSession.create
   MeterValues     → ChargingSession.kwh update
   StopTransaction → settle_session BullMQ job → Stripe capture
```

---

## Communication Protocol: MQTT via Self-Hosted EMQX

### Why MQTT (not HTTP)

Cloud-to-LAN HTTP fails through residential NAT. You cannot call `192.168.x.x` from your server. MQTT inverts the connection: the device dials *out* to your broker, then you push commands down that persistent connection.

### Broker

| Stage | Choice | Reason |
|---|---|---|
| MVP / early scale | EMQX 5 in Docker | Free, battle-tested, single container |
| ~500+ devices | Clustered EMQX or HiveMQ Cloud | HA + managed ops |
| Avoid | AWS IoT Core | Per-message pricing penalizes 30s MeterValues cadence |

Add to `docker-compose.yml`:
```yaml
emqx:
  image: emqx:5
  ports:
    - "1883:1883"   # MQTT
    - "8883:8883"   # MQTT over TLS
    - "18083:18083" # Dashboard
  environment:
    EMQX_NAME: edna-broker
    EMQX_HOST: 127.0.0.1
```

### Topic Structure

```
ec/plugs/{deviceId}/rpc               commands (start/stop payload)
ec/plugs/{deviceId}/status/switch:0   Tier 1 telemetry (on/off + power W)
ec/em/{deviceId}/status/em1:0         Tier 2 leg-A energy
ec/em/{deviceId}/status/em1:1         Tier 2 leg-B energy
ec/{type}/{deviceId}/online           LWT retained (offline detection)
```

**Polling interval:** 30s MeterValues — matches Tier 3 OCPP cadence, maps directly to `ChargingSession.kwh` updates.

---

## Tier 2: Session Detection (Monitoring-Only)

Since there's no relay cutting power, session detection is threshold-based:

```
Booking confirmed + driver taps "Start session"
        │
        ▼
Worker begins polling Shelly EM-50 via MQTT
        │
  Power > 500W stable for 30s?
        │ YES
        ▼
  Fire synthetic StartTransaction
  ChargingSession created in DB
        │
  ...charging in progress...
        │
  Power < 100W stable for 30s?
        │ YES
        ▼
  Fire synthetic StopTransaction
  ChargingSession.endedAt stamped
  settle_session job → Stripe capture (actual kWh billed)
```

**Gating rule:** Only run threshold detection within ±5 min of booking start/end to prevent false positives from other 240V appliances (HVAC, dryer) during the booking window.

---

## Host Provisioning Flow

Devices are pre-provisioned in inventory (broker URL, cert, topic prefix flashed) before shipping. Host experience:

```
1. Host receives device in the mail (QR sticker on box)
2. Host opens EdnaCharge app → "Set up your device"
3. App scans QR → retrieves deviceId + pairing token
4. App uses Shelly BLE provisioning to hand off WiFi credentials
   (no port forwarding, no router config)
5. Device connects to EMQX broker
6. Backend sees retained `online` LWT → device.status = ACTIVE
7. Host's charger listing goes live
```

Target: **< 2 minutes, zero technical skill required.**

### Device DB Schema

```prisma
model ShellDevice {
  id              String   @id @default(uuid())
  chargerId       String   @unique
  shellyDeviceId  String   @unique
  mac             String   @unique
  mqttClientId    String
  mqttTopicPrefix String
  certFingerprint String
  firmwareVersion String
  hardwareModel   String   // "shelly-plug-s-gen3" | "shelly-pro-em-50"
  lastSeenAt      DateTime?
  lastMeterKwh    Float    @default(0)
  status          DeviceStatus @default(PROVISIONED)
  charger         Charger  @relation(fields: [chargerId], references: [id])
}

enum DeviceStatus {
  PROVISIONED
  ACTIVE
  OFFLINE
  ERROR
}
```

> **Never store** IP addresses (useless behind NAT) or host WiFi passwords (never seen by backend).

---

## Implementation Roadmap

### Phase 1 — Tier 1 Smart Plug (MVP)

**Goal:** Complete booking → start → meter → stop → bill cycle for 120V Level 1.

| Task | Detail |
|---|---|
| Add EMQX to `docker-compose.yml` | Single broker container |
| `ShellDevice` Prisma model | Schema above |
| `ChargerDriver` interface | `packages/schemas/src/charger-driver.ts` |
| `ShellyPlugDriver` | `apps/worker/src/drivers/shelly-plug.ts` — MQTT start/stop + 30s meter poll |
| Synthetic OCPP event emitter | Feed StartTransaction / MeterValues / StopTransaction into existing pipeline |
| BLE provisioning in mobile | `apps/mobile/app/(host)/host-onboarding/device-setup.tsx` |
| `device.register` tRPC mutation | `apps/api/src/routers/device.ts` — store DeviceId + pair token |
| Update `booking.startSession` | If `charger.hardwareTier === 'tier_1_smart_plug'` → enqueue `ShellyStart` job |

**Risk:** Low. Shelly MQTT protocol is well-documented and stable.

### Phase 2 — Tier 2 CT Clamp (monitoring-only)

**Goal:** Energy monitoring on hard-wired 240V chargers; threshold-based session detection.

| Task | Detail |
|---|---|
| `ShellyEmDriver` | `apps/worker/src/drivers/shelly-em.ts` — split-phase CT clamp readings |
| Threshold detection logic | Power >500W → start, <100W → stop, gated to booking window ±5 min |
| Session auto-start/stop job | BullMQ watcher per active booking |
| Update provisioning flow | CT clamp installation guide in app |

**Risk:** Medium. Threshold tuning needs field data from early installs. Start conservative (500W/100W) and adjust.

### Phase 3 — Tier 2 Contactor Control (hard power cut)

**Goal:** Relay-based physical power control for hosts who want guaranteed session isolation.

| Task | Detail |
|---|---|
| Contactor wiring spec | Eaton C25BNB240A driven by Shelly Pro EM-50 relay output |
| Licensed electrician install flow | Scheduling integration or approved installer network |
| Updated driver | `ShellyEmDriver.start()` closes contactor before threshold detection |
| Liability / legal review | Confirm installer network and insurance coverage |

**Risk:** High. Requires electrician involvement, installer liability coverage, and host consent for physical modifications. Do not ship Phase 3 without legal sign-off.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Residential WiFi drops mid-session | High | High | Heartbeat every 60s; if device goes offline during session, pause meter + notify driver; resume on reconnect |
| Tier 2 threshold false positives (HVAC, dryer) | Medium | Medium | Gate detection to booking window ±5 min; require >500W for full 30s before firing |
| Tier 2 unit economics | High | Medium | Monitoring-only BOM is $110 host self-install; contactor adds $200 BOM + $300 electrician — requires deposit or commitment |
| Shelly firmware OTA breaks API | Low | High | Lock firmware version per device; only OTA on your release schedule |
| UL liability for 12A continuous use | Medium | High | Shelly Plug S Gen3 is rated 15A; 12A continuous EV charging is within spec. Get one-page legal review before first host shipment |

---

## Unit Economics Summary

| Tier | BOM | Install | Total per Host | Control |
|---|---|---|---|---|
| Tier 1 | $25 (Shelly Plug S) | Self-install (2 min) | ~$25 | Full (relay on/off) |
| Tier 2 monitoring-only | $110 (Shelly Pro EM-50) | Self-install (15 min, clip CT clamps) | ~$110 | None (threshold detection) |
| Tier 2 controlled | $110 + $50 contactor | Licensed electrician (~$300) | ~$460 | Full (contactor) |
| Tier 3 | $0 | Host configures OCPP in charger app | $0 | Full (OCPP native) |

---

## Next Steps

1. **Phase 1 implementation** — write `ChargerDriver` interface + `ShellyPlugDriver` + EMQX Docker setup
2. **Order 2× Shelly Plug S Gen3** for bench testing before host shipments
3. **Legal review** — one-page review on Tier 1 continuous 12A use before first host shipment
4. **Provisioning UX** — design BLE provisioning screen in mobile onboarding flow
5. **Phase 2 field test** — order 1× Shelly Pro EM-50, test threshold detection with an actual Level 2 charger
