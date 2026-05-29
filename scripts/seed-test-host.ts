import { prisma } from '../packages/db/src/index.js';

async function main() {
  const stamp = Date.now().toString(36);
  const email = `host.berkeley.${stamp}@ednacharge.test`;
  const fakeFirebaseUid = `test-${stamp}`;

  const user = await prisma.user.create({
    data: {
      email,
      firebaseUid: fakeFirebaseUid,
      fullName: 'Alex Thompson',
      phone: `+1510555${Math.floor(1000 + Math.random() * 9000)}`,
      roles: ['driver', 'host'],
      stripeCustomerId: `cus_dev_${stamp}`,
      defaultPaymentMethodId: 'pm_dev_card',
      hostProfile: {
        create: {
          legalName: 'Alex Thompson',
          dob: new Date('1992-04-15'),
          addressLine1: '2150 Shattuck Ave',
          city: 'Berkeley',
          state: 'CA',
          postalCode: '94704',
          country: 'US',
          stripeAccountId: `acct_dev_${stamp.slice(0, 8)}`,
          stripeOnboardingComplete: true,
          hardwareSetup: {
            tier: 'tier_3_native',
            ocppCapable: true,
            chargerVendor: 'Wallbox',
            chargerModel: 'Pulsar Plus',
          },
        },
      },
    },
    include: { hostProfile: true },
  });

  const charger = await prisma.charger.create({
    data: {
      hostId: user.id,
      title: 'Downtown Berkeley · Wallbox 11kW',
      addressLine1: '2150 Shattuck Ave',
      city: 'Berkeley',
      state: 'CA',
      postalCode: '94704',
      country: 'US',
      lat: 37.8716,
      lng: -122.2727,
      connectorType: 'j1772',
      powerKw: 11,
      hardwareTier: 'tier_3_native',
      pricePerKwhCents: 28,
      houseRules: 'Park in space #4. Unplug when done. No overnight stays.',
      status: 'available',
      instantAvailable: true,
      published: true,
      availability: [
        { dow: 1, start: '07:00', end: '22:00' },
        { dow: 2, start: '07:00', end: '22:00' },
        { dow: 3, start: '07:00', end: '22:00' },
        { dow: 4, start: '07:00', end: '22:00' },
        { dow: 5, start: '07:00', end: '22:00' },
        { dow: 6, start: '09:00', end: '23:00' },
        { dow: 0, start: '09:00', end: '23:00' },
      ],
    },
  });

  // Maintain the geography column (trigger may not exist on local) — fall through gracefully
  await prisma.$executeRawUnsafe(
    `UPDATE "Charger" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3::uuid`,
    charger.lng,
    charger.lat,
    charger.id,
  ).catch((e) => {
    console.warn('skipped location update:', (e as Error).message);
  });

  console.log('\n=== TEST HOST CREATED ===');
  console.log('email           :', email);
  console.log('firebaseUid     :', fakeFirebaseUid);
  console.log('userId          :', user.id);
  console.log('chargerId       :', charger.id);
  console.log('charger title   :', charger.title);
  console.log('location        : 37.8716, -122.2727 (Downtown Berkeley)');
  console.log('=========================\n');
  console.log('Sign in path: this is a back-door seed. To actually log in, sign up via the app');
  console.log('with a real Firebase email/Google account, then run this script with that email');
  console.log('to upgrade the user to a host with a published Berkeley charger.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
