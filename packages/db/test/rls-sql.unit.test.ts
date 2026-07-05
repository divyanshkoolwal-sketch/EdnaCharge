/** @file packages/db/test/rls-sql.unit.test.ts. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('RLS SQL hardening text', () => {
  it('blocks direct client writes to Booking while keeping server-side tRPC authoritative', () => {
    const migration = read('supabase/migrations/20260703010000_rls_security_hardening.sql');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "Booking" FROM anon, authenticated',
    );
  });

  it('prevents direct clients from writing server-managed User columns', () => {
    const migration = read('supabase/migrations/20260703012500_rls_baseline_core_tables.sql');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON "User" FROM anon, authenticated');
    expect(migration).toContain('GRANT UPDATE("fullName") ON "User" TO authenticated');
  });

  it('preserves moderation reports when reported content is deleted', () => {
    const migration = read('supabase/migrations/20260703012000_content_moderation.sql');
    expect(migration).toContain('"targetUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL');
    expect(migration).toContain(
      '"messageId" uuid REFERENCES "ChatMessage"("id") ON DELETE SET NULL',
    );
    expect(migration).toContain('"reviewId" uuid REFERENCES "Review"("id") ON DELETE SET NULL');
    expect(migration).toContain('"targetType" = \'chat_message\' AND "reviewId" IS NULL');
  });

  it('closes direct client writes for reviews and support tickets', () => {
    const migration = read('supabase/migrations/20260704000000_mvp_prod_readiness.sql');
    expect(migration).toContain('DROP POLICY IF EXISTS "reviews_author_insert" ON "Review"');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "Review" FROM anon, authenticated',
    );
    expect(migration).toContain('REVOKE ALL ON "SupportTicket" FROM anon, authenticated');
  });

  it('closes direct client writes for server-owned charger, payout, and session tables', () => {
    const migration = read('supabase/migrations/20260704000000_mvp_prod_readiness.sql');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "HostProfile" FROM anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "Charger" FROM anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "Payout" FROM anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "ChargingSession" FROM anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON "MeterValue" FROM anon, authenticated',
    );
  });
});
