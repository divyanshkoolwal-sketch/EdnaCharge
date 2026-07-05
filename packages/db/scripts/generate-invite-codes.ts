#!/usr/bin/env tsx
/** @file packages/db/scripts/generate-invite-codes.ts. */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../src/index.js';

type Role = 'driver' | 'host';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

function normalize(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hash(raw: string): string {
  return createHash('sha256').update(normalize(raw)).digest('hex');
}

function code(role: Role, campaign: string): string {
  const prefix = role === 'host' ? 'HOST' : 'DRIVER';
  const token = randomBytes(5).toString('hex').toUpperCase();
  const slug = normalize(campaign).slice(0, 8) || 'FREMONT';
  return `${prefix}-${slug}-${token.slice(0, 5)}-${token.slice(5)}`;
}

async function main() {
  const role = arg('role') as Role | undefined;
  const campaign = arg('campaign', 'fremont-ground-host')!;
  const count = Number(arg('count', '25'));
  const maxRedemptions = Number(arg('max-redemptions', '1'));

  if (role !== 'driver' && role !== 'host') {
    throw new Error('Pass --role host or --role driver.');
  }
  if (!Number.isInteger(count) || count <= 0 || count > 1000) {
    throw new Error('--count must be an integer from 1 to 1000.');
  }
  if (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0) {
    throw new Error('--max-redemptions must be a positive integer.');
  }

  console.log('code,role,campaign,maxRedemptions');
  for (let i = 0; i < count; i++) {
    let plain = code(role, campaign);
    for (let tries = 0; tries < 5; tries++) {
      try {
        await prisma.inviteCode.create({
          data: { codeHash: hash(plain), role, campaign, maxRedemptions },
        });
        console.log(`${plain},${role},${campaign},${maxRedemptions}`);
        break;
      } catch (err) {
        if (tries === 4) throw err;
        plain = code(role, campaign);
      }
    }
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
