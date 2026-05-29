-- IdentityVerification holds sensitive KYC data (verified DOB, address, last-4
-- of doc number). Enable RLS so authenticated users can only read their own
-- row. Service role (api / worker / csms) bypasses via service-role policy.

ALTER TABLE "IdentityVerification" ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_verification_self_read ON "IdentityVerification"
  FOR SELECT
  USING (auth.uid()::text = "userId"::text);

CREATE POLICY identity_verification_service_all ON "IdentityVerification"
  FOR ALL
  USING (auth.role() = 'service_role');
