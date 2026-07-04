/** @file apps/api/src/routers/privacy.ts — GDPR/CCPA self-service data export. */
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';

// Data-subject access request (GDPR Art. 15 / CCPA right to know): lets an
// authenticated user export the core personal data EdnaCharge holds about them —
// their profile plus the charger and booking records they own. The curated
// `select`s deliberately EXCLUDE credential/secret material (the OCPP auth hash +
// encrypted secret, one-time OCPP start tokens, and internal Stripe object ids) —
// those must never leave the DB, even to their owner. Deletion is the separate
// auth.deleteAccount flow (routers/auth/account-deletion.ts). Full policy and the
// scrubbing model live in docs/PRIVACY.md.
export const privacyRouter = router({
  exportMyData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId as string;
    const [profile, chargersOwned, bookingsMade] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          avatarUrl: true,
          roles: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
      prisma.charger.findMany({
        where: { hostId: userId },
        select: {
          id: true,
          title: true,
          photoUrl: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          lat: true,
          lng: true,
          connectorType: true,
          powerKw: true,
          hardwareTier: true,
          pricePerKwhCents: true,
          pricePerHourCents: true,
          houseRules: true,
          status: true,
          published: true,
          createdAt: true,
        },
      }),
      prisma.booking.findMany({
        where: { driverId: userId },
        select: {
          id: true,
          chargerId: true,
          status: true,
          startAt: true,
          endAt: true,
          estimatedKwh: true,
          estimatedCostCents: true,
          platformFeeCents: true,
          ratePerKwhCents: true,
          preauthAmountCents: true,
          capturedAmountCents: true,
          refundedAmountCents: true,
          driverMessage: true,
          declineReason: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      subjectId: userId,
      profile,
      chargersOwned,
      bookingsMade,
      note: 'Export of core personal records; credentials and internal payment identifiers are intentionally omitted. Contact support for the full archive.',
    };
  }),
});
