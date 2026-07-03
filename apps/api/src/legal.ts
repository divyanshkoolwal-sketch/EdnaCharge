import type { FastifyInstance } from 'fastify';

// Public legal pages served as static HTML. Required for the app stores
// (Google Play / App Store ask for a live Privacy Policy URL) and linked from
// the app. CSP is disabled for the API (see index.ts), so the inline <style>
// is fine. Update CONTACT_EMAIL / GOVERNING_STATE if those change.
const EFFECTIVE = 'June 5, 2026';
const CONTACT_EMAIL = 'support@ednacharge.com';
const GOVERNING_STATE = 'California';

function page(title: string, bodyHtml: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title} · EdnaCharge</title>` +
    `<style>:root{color-scheme:light}body{font-family:-apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",Roboto,sans-serif;` +
    `max-width:760px;margin:0 auto;padding:32px 20px 64px;color:#1a1a1f;line-height:1.6}` +
    `h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}` +
    `.meta{color:#6b7280;font-size:14px;margin-bottom:24px}p,li{font-size:15px}a{color:#2563eb}` +
    `footer{margin-top:40px;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px}</style>` +
    `</head><body>${bodyHtml}` +
    `<footer>EdnaCharge · Last updated ${EFFECTIVE} · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>` +
    `</body></html>`
  );
}

const PRIVACY = page(
  'Privacy Policy',
  `<h1>Privacy Policy</h1><div class="meta">Last updated: ${EFFECTIVE}</div>
<p>EdnaCharge ("EdnaCharge," "we," "us") operates a peer-to-peer marketplace that connects electric-vehicle drivers with hosts who share their EV chargers. This Privacy Policy explains what we collect, how we use it, and your choices. By using the EdnaCharge app you agree to this Policy.</p>

<h2>Information we collect</h2>
<ul>
<li><b>Account &amp; profile:</b> name, email, phone number, and password (authentication is handled by Google Firebase). Drivers may add vehicle make, model, year, connector type, and optionally a license plate. Hosts provide legal name, date of birth, and address.</li>
<li><b>Location:</b> with your permission, your device's precise location to show nearby chargers and provide directions. You can disable this in your device settings.</li>
<li><b>Identity verification:</b> to keep the marketplace safe, identity checks are performed by Stripe Identity, which may collect a government ID and a selfie. These documents are processed by Stripe; EdnaCharge receives only a verification result and basic verified details, not your ID images.</li>
<li><b>Payments &amp; payouts:</b> card and bank details are collected and processed by Stripe. We do not store full card numbers. Host payout details are held by Stripe Connect.</li>
<li><b>Bookings &amp; charging sessions:</b> reservations, energy delivered (kWh), timestamps, amounts charged, and which charger was used.</li>
<li><b>Messages:</b> in-app chat between drivers and hosts related to a booking.</li>
<li><b>Usage &amp; device data:</b> app interactions and analytics (PostHog), crash and error diagnostics (Sentry), and basic device information.</li>
</ul>

<h2>How we use your information</h2>
<ul>
<li>Operate the marketplace — list chargers, match drivers and hosts, and enable bookings.</li>
<li>Process payments, calculate per-kWh charges, and pay hosts (less our service fee).</li>
<li>Verify identity and prevent fraud, abuse, and unsafe activity.</li>
<li>Provide customer support and send service notifications.</li>
<li>Maintain, secure, and improve the app.</li>
<li>Comply with legal, tax, and accounting obligations.</li>
</ul>

<h2>How we share your information</h2>
<ul>
<li><b>With other users:</b> to complete a booking, a host sees the driver's name and rating; a driver sees the host's name, charger details, location, and rating. A host's gate or access code, if provided, is shared with the driver after a booking is confirmed.</li>
<li><b>Service providers</b> who process data on our behalf: Stripe (payments and identity), Google Firebase (authentication), Supabase (database hosting), Mapbox (maps), Sentry (diagnostics), PostHog (analytics), and Expo (push notifications).</li>
<li><b>Legal:</b> when required by law or to protect rights, safety, and the integrity of the service.</li>
<li>We <b>do not sell</b> your personal information.</li>
</ul>

<h2>Data retention</h2>
<p>We keep your information for as long as your account is active and as needed to provide the service, then for any period required to meet legal, tax, and accounting obligations or to resolve disputes.</p>

<h2>Your choices and rights</h2>
<p>You can review and update profile information in the app, disable location access in your device settings, and request access to or deletion of your account and personal data by emailing <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. We will respond consistent with applicable law.</p>

<h2>Security</h2>
<p>We use encryption in transit and protect sensitive credentials at rest. No method of transmission or storage is completely secure, but we work to safeguard your data.</p>

<h2>Children</h2>
<p>EdnaCharge is intended for adults 18 and older and is not directed to children.</p>

<h2>International users</h2>
<p>EdnaCharge is operated from the United States, and your information is processed there.</p>

<h2>Changes to this Policy</h2>
<p>We may update this Policy from time to time. Material changes will be reflected by updating the date above and, where appropriate, through in-app notice.</p>

<h2>Contact</h2>
<p>Questions about this Policy? Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
);

const TERMS = page(
  'Terms of Service',
  `<h1>Terms of Service</h1><div class="meta">Last updated: ${EFFECTIVE}</div>
<p>These Terms govern your use of the EdnaCharge app and services. By creating an account or using EdnaCharge, you agree to these Terms. If you do not agree, do not use the service.</p>

<h2>The service</h2>
<p>EdnaCharge is a marketplace that connects EV drivers ("Drivers") with people who make their EV chargers available ("Hosts"). EdnaCharge is not a utility or charging-network operator and is not a party to the charging session; we provide the platform that enables Hosts and Drivers to transact.</p>

<h2>Eligibility</h2>
<p>You must be at least 18 years old and able to form a binding contract. You agree to provide accurate information and to complete identity verification where required.</p>

<h2>Bookings, payments, and fees</h2>
<ul>
<li>Drivers reserve a charger and authorize payment before charging. Final charges are based on the energy actually delivered (kWh) as metered by the charger, plus applicable fees.</li>
<li>EdnaCharge charges a service fee (currently 15% of the transaction) and remits the remainder to the Host. Payments and payouts are processed by Stripe; by transacting you also agree to Stripe's terms.</li>
<li>Pricing is set automatically by EdnaCharge based on demand and time of day — Hosts do not set their own rates. Hosts are responsible for any taxes on their earnings.</li>
</ul>

<h2>Host responsibilities</h2>
<p>Hosts represent that they are entitled to offer their charger and electricity for paid use, that their equipment is safe and properly installed, and that their listing is accurate. Hosts are responsible for compliance with applicable laws, leases, HOA rules, and utility agreements.</p>

<h2>Driver responsibilities</h2>
<p>Drivers agree to use chargers safely and as directed, to follow Host access rules, and to leave the location promptly when the session ends.</p>

<h2>Assumption of risk; disclaimer</h2>
<p>EV charging involves electrical equipment and access to private property and carries inherent risks. EdnaCharge does not own, inspect, or control Hosts' equipment or premises. The service and all listings are provided "as is" without warranties of any kind. To the maximum extent permitted by law, EdnaCharge disclaims liability for damage to vehicles, equipment, or property and for the conduct of any user.</p>

<h2>Prohibited conduct</h2>
<p>You agree not to misuse the service, including tampering with chargers or metering, attempting to charge without an active booking, harassment, fraud, or violating any law.</p>

<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, EdnaCharge's total liability arising out of or relating to the service will not exceed the greater of the fees you paid to EdnaCharge in the three months before the claim or US$100.</p>

<h2>Termination</h2>
<p>We may suspend or terminate accounts that violate these Terms or that we reasonably believe create risk. You may stop using the service and request account deletion at any time.</p>

<h2>Governing law</h2>
<p>These Terms are governed by the laws of the State of ${GOVERNING_STATE}, United States, without regard to conflict-of-laws rules.</p>

<h2>Contact</h2>
<p>Questions about these Terms? Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
);

export function registerLegalPages(app: FastifyInstance): void {
  app.get('/privacy', async (_req, reply) => reply.type('text/html').send(PRIVACY));
  app.get('/terms', async (_req, reply) => reply.type('text/html').send(TERMS));
}
