/**
 * Chat e2e — sendMessage enforces party check, markRead only affects
 * counterparty messages, closed threads reject sends.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@edna/db';
import {
  HAS_SUPABASE,
  HAS_SERVICE_ROLE,
  skipReason,
  trpc,
  createSupabaseUser,
  signIn,
  uniqueEmail,
  deleteUserByEmail,
  grantAccess,
} from './helpers.js';

const skip = skipReason([
  ['SUPABASE_URL+ANON_KEY', HAS_SUPABASE],
  ['SUPABASE_SERVICE_ROLE_KEY', HAS_SERVICE_ROLE],
]);
const d = skip ? describe.skip : describe;

d(`chat router ${skip ?? ''}`, () => {
  const driverEmail = uniqueEmail('cdrv');
  const hostEmail = uniqueEmail('chost');
  const outsiderEmail = uniqueEmail('out');
  const password = 'Test-Pass-123!';
  let driverToken = '';
  let hostToken = '';
  let outsiderToken = '';
  let driverId = '';
  let hostId = '';
  let threadId = '';

  beforeAll(async () => {
    driverId = await createSupabaseUser(driverEmail, password);
    hostId = await createSupabaseUser(hostEmail, password);
    await createSupabaseUser(outsiderEmail, password);
    driverToken = await signIn(driverEmail, password);
    hostToken = await signIn(hostEmail, password);
    outsiderToken = await signIn(outsiderEmail, password);
    await grantAccess(driverId, 'driver');
    await grantAccess(hostId, 'host');
    await trpc('auth.getSession', driverToken, undefined, 'query');
    await trpc('auth.getSession', hostToken, undefined, 'query');
    await trpc('auth.getSession', outsiderToken, undefined, 'query');

    await prisma.user.update({
      where: { id: hostId },
      data: { roles: { set: ['driver', 'host'] } },
    });

    const charger = await prisma.charger.create({
      data: {
        hostId,
        title: 'Chat Charger',
        addressLine1: '1 Test',
        city: 'Pleasanton',
        state: 'CA',
        postalCode: '94566',
        lat: 37.66,
        lng: -121.87,
        connectorType: 'j1772',
        powerKw: 7.2,
        hardwareTier: 'tier_1_smart_plug',
        pricePerKwhCents: 28,
        published: true,
        status: 'available',
      },
    });
    const booking = await prisma.booking.create({
      data: {
        chargerId: charger.id,
        driverId,
        startAt: new Date(Date.now() + 60_000),
        endAt: new Date(Date.now() + 3_600_000),
        estimatedKwh: 7.2,
        estimatedCostCents: 202,
        platformFeeCents: 30,
        preauthAmountCents: 232,
        autoDeclineAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    const thread = await prisma.chatThread.create({ data: { bookingId: booking.id } });
    threadId = thread.id;
  });

  afterAll(async () => {
    await deleteUserByEmail(driverEmail);
    await deleteUserByEmail(hostEmail);
    await deleteUserByEmail(outsiderEmail);
  });

  it('sendMessage rejects non-party callers', async () => {
    await expect(
      trpc('chat.sendMessage', outsiderToken, { threadId, body: 'hi' }),
    ).rejects.toThrow();
  });

  it('sendMessage accepts driver + host', async () => {
    await trpc('chat.sendMessage', driverToken, { threadId, body: 'hello host' });
    await trpc('chat.sendMessage', hostToken, { threadId, body: 'hello driver' });
    const msgs = await prisma.chatMessage.findMany({ where: { threadId } });
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  });

  it('markRead only affects counterparty messages', async () => {
    // Mobile passes the latest message it rendered as upToMessageId — typically
    // the counterparty's most recent message. markRead must mark counterparty
    // messages <= that timestamp as read, and leave the caller's own messages
    // alone; upToMessageId avoids marking messages that arrive after the marker.
    const hostMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { threadId, senderId: hostId },
      orderBy: { createdAt: 'desc' },
    });
    await trpc('chat.markRead', driverToken, {
      threadId,
      upToMessageId: hostMsg.id,
    });
    const driverUnread = await prisma.chatMessage.findMany({
      where: { threadId, senderId: driverId, readAt: null },
    });
    expect(driverUnread.length).toBeGreaterThan(0); // driver's own untouched
    const reread = await prisma.chatMessage.findUniqueOrThrow({
      where: { id: hostMsg.id },
    });
    expect(reread.readAt).not.toBeNull();
  });

  it('closed threads reject sends', async () => {
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { closedAt: new Date() },
    });
    await expect(
      trpc('chat.sendMessage', driverToken, { threadId, body: 'after close' }),
    ).rejects.toThrow();
  });
});
