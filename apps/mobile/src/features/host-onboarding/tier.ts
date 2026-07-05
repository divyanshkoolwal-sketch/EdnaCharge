import type { HardwareTier } from '@edna/schemas';

export function tierCopy(tier: HardwareTier): { title: string; body: string } {
  switch (tier) {
    case 'tier_3_native':
      return {
        title: "You're all set.",
        body: "We'll give you your charger's connection details when you list it.",
      };
    case 'tier_2_bridge_kit':
      return {
        title: "We'll ship you a free bridge kit.",
        body: 'Shipping takes 3–5 days. You can finish listing now and go live once it arrives.',
      };
    case 'tier_1_smart_plug':
      return {
        title: "We'll ship you a free smart plug.",
        body: 'Shipping takes 3–5 days. You can finish listing now and go live once it arrives.',
      };
    case 'tier_4_unmetered':
      return {
        title: 'No metering required.',
        body: 'You can still list. Pricing is set automatically by demand.',
      };
  }
}
