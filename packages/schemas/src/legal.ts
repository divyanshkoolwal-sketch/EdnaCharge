/** Shared legal copy for native app and public web pages. */

export const LEGAL_UPDATED = 'June 5, 2026';
export const LEGAL_SUPPORT_EMAIL = 'support@ednacharge.com';
export const LEGAL_GOVERNING_STATE = 'California';

export type LegalBlock = { heading?: string; body?: string; bullets?: string[] };
export type LegalDoc = { title: string; intro: string; blocks: LegalBlock[] };
export type LegalDocKey = 'privacy' | 'terms';

const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    'EdnaCharge ("EdnaCharge," "we," "us") operates a peer-to-peer marketplace that connects electric-vehicle drivers with hosts who share their EV chargers. This Privacy Policy explains what we collect, how we use it, and your choices. By using the EdnaCharge app you agree to this Policy.',
  blocks: [
    {
      heading: 'Information we collect',
      bullets: [
        'Account & profile: name, email, phone number, and password (authentication is handled by Supabase). Drivers may add vehicle make, model, year, connector type, and optionally a license plate. Hosts provide legal name, date of birth, and address.',
        "Location: with your permission, your device's precise location to show nearby chargers and provide directions. You can disable this in your device settings.",
        'Identity verification: to keep the marketplace safe, identity checks are performed by Stripe Identity, which may collect a government ID and a selfie. These documents are processed by Stripe; EdnaCharge receives only a verification result and basic verified details, not your ID images.',
        'Payments & payouts: card and bank details are collected and processed by Stripe. We do not store full card numbers. Host payout details are held by Stripe Connect.',
        'Bookings & charging sessions: reservations, energy delivered (kWh), timestamps, amounts charged, and which charger was used.',
        'Messages: in-app chat between drivers and hosts related to a booking.',
        'Usage & device data: app interactions and analytics (PostHog), crash and error diagnostics (Sentry), and basic device information.',
      ],
    },
    {
      heading: 'How we use your information',
      bullets: [
        'Operate the marketplace: list chargers, match drivers and hosts, and enable bookings.',
        'Process payments, calculate per-kWh charges, and pay hosts less our service fee.',
        'Verify identity and prevent fraud, abuse, and unsafe activity.',
        'Provide customer support and send service notifications.',
        'Maintain, secure, and improve the app.',
        'Comply with legal, tax, and accounting obligations.',
      ],
    },
    {
      heading: 'How we share your information',
      bullets: [
        "With other users: to complete a booking, a host sees the driver's name and rating; a driver sees the host's name, charger details, location, and rating. A host's gate or access code, if provided, is shared with the driver after a booking is confirmed.",
        'Service providers who process data on our behalf: Stripe (payments and identity), Supabase (authentication and database hosting), Mapbox (maps), Sentry (diagnostics), PostHog (analytics), and Expo (push notifications).',
        'Legal: when required by law or to protect rights, safety, and the integrity of the service.',
        'We do not sell your personal information.',
      ],
    },
    {
      heading: 'Data retention',
      body: 'We keep your information for as long as your account is active and as needed to provide the service, then for any period required to meet legal, tax, and accounting obligations or to resolve disputes.',
    },
    {
      heading: 'Your choices and rights',
      body: `You can review and update profile information in the app, disable location access in your device settings, delete your account in Settings, or request access to or deletion of your account and personal data through the account deletion page or by emailing ${LEGAL_SUPPORT_EMAIL}. We will respond consistent with applicable law.`,
    },
    {
      heading: 'Security',
      body: 'We use encryption in transit and protect sensitive credentials at rest. No method of transmission or storage is completely secure, but we work to safeguard your data.',
    },
    {
      heading: 'Children',
      body: 'EdnaCharge is intended for adults 18 and older and is not directed to children.',
    },
    {
      heading: 'International users',
      body: 'EdnaCharge is operated from the United States, and your information is processed there.',
    },
    {
      heading: 'Changes to this Policy',
      body: 'We may update this Policy from time to time. Material changes will be reflected by updating the date above and, where appropriate, through in-app notice.',
    },
    {
      heading: 'Contact',
      body: `Questions about this Policy? Email ${LEGAL_SUPPORT_EMAIL}.`,
    },
  ],
};

const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    'These Terms govern your use of the EdnaCharge app and services. By creating an account or using EdnaCharge, you agree to these Terms. If you do not agree, do not use the service.',
  blocks: [
    {
      heading: 'The service',
      body: 'EdnaCharge is a marketplace that connects EV drivers ("Drivers") with people who make their EV chargers available ("Hosts"). EdnaCharge is not a utility or charging-network operator and is not a party to the charging session; we provide the platform that enables Hosts and Drivers to transact.',
    },
    {
      heading: 'Eligibility',
      body: 'You must be at least 18 years old and able to form a binding contract. You agree to provide accurate information and to complete identity verification where required.',
    },
    {
      heading: 'Bookings, payments, and fees',
      bullets: [
        'Drivers reserve a charger and authorize payment before charging. Final charges are based on the energy actually delivered (kWh) as metered by the charger, plus applicable fees.',
        "EdnaCharge charges a service fee (currently 15% of the transaction) and remits the remainder to the Host. Payments and payouts are processed by Stripe; by transacting you also agree to Stripe's terms.",
        'Pricing is set automatically by EdnaCharge based on demand and time of day. Hosts do not set their own rates. Hosts are responsible for any taxes on their earnings.',
      ],
    },
    {
      heading: 'Host responsibilities',
      body: 'Hosts represent that they are entitled to offer their charger and electricity for paid use, that their equipment is safe and properly installed, and that their listing is accurate. Hosts are responsible for compliance with applicable laws, leases, HOA rules, and utility agreements.',
    },
    {
      heading: 'Driver responsibilities',
      body: 'Drivers agree to use chargers safely and as directed, to follow Host access rules, and to leave the location promptly when the session ends.',
    },
    {
      heading: 'Assumption of risk; disclaimer',
      body: 'EV charging involves electrical equipment and access to private property and carries inherent risks. EdnaCharge does not own, inspect, or control Hosts\' equipment or premises. The service and all listings are provided "as is" without warranties of any kind. To the maximum extent permitted by law, EdnaCharge disclaims liability for damage to vehicles, equipment, or property and for the conduct of any user.',
    },
    {
      heading: 'Prohibited conduct',
      body: 'You agree not to misuse the service, including tampering with chargers or metering, attempting to charge without an active booking, harassment, fraud, or violating any law.',
    },
    {
      heading: 'Limitation of liability',
      body: "To the maximum extent permitted by law, EdnaCharge's total liability arising out of or relating to the service will not exceed the greater of the fees you paid to EdnaCharge in the three months before the claim or US$100.",
    },
    {
      heading: 'Termination',
      body: 'We may suspend or terminate accounts that violate these Terms or that we reasonably believe create risk. You may stop using the service and request account deletion at any time.',
    },
    {
      heading: 'Governing law',
      body: `These Terms are governed by the laws of the State of ${LEGAL_GOVERNING_STATE}, United States, without regard to conflict-of-laws rules.`,
    },
    {
      heading: 'Contact',
      body: `Questions about these Terms? Email ${LEGAL_SUPPORT_EMAIL}.`,
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
};
