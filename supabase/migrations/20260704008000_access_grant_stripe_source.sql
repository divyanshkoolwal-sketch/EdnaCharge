-- Host access is granted when Stripe onboarding completes (host procedures gate
-- on UserAccessGrant, not User.roles). Add the source value used for that grant.
ALTER TYPE "AccessGrantSource" ADD VALUE IF NOT EXISTS 'stripe_onboarding';
