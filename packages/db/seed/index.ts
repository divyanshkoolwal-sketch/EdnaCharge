import { prisma } from '../src/index.js';
import { createHost, createCharger } from '../test/fixtures/factories.js';

// PRD Phase 4: seed 20 Tri-Valley chargers centered around Pleasanton/Dublin/Livermore.
const POINTS = [
  [37.6624, -121.8747], // Pleasanton
  [37.7022, -121.9358], // Dublin
  [37.6819, -121.7680], // Livermore
  [37.6514, -121.8763],
  [37.6915, -121.9037],
  [37.6729, -121.8422],
  [37.7110, -121.9217],
  [37.6840, -121.7531],
  [37.6580, -121.9044],
  [37.7003, -121.8815],
  [37.6700, -121.8600],
  [37.6900, -121.8200],
  [37.6430, -121.8900],
  [37.7200, -121.9300],
  [37.6750, -121.7400],
  [37.6600, -121.8500],
  [37.6870, -121.8100],
  [37.7050, -121.9150],
  [37.6950, -121.8700],
  [37.6680, -121.8300],
];

async function main() {
  console.log('seeding 20 Tri-Valley chargers…');
  const host = await createHost({ email: `seed-host-${Date.now()}@test.local` });
  for (let i = 0; i < POINTS.length; i++) {
    const [lat, lng] = POINTS[i]!;
    await createCharger(host.id, {
      title: `Tri-Valley Charger #${i + 1}`,
      lat,
      lng,
      connectorType: i % 2 === 0 ? 'j1772' : 'nacs',
      powerKw: [3.3, 7.2, 11][i % 3]!,
      pricePerKwhCents: 24 + (i % 6),
    });
  }
  console.log(`seed complete. host: ${host.email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
