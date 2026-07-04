/** Reusable sections for the driver booking detail screen. */
import { View } from 'react-native';
import { demandRateCents } from '@edna/schemas';
import { Body, Button, Card, CTABar, Muted, Row } from '../../components/ui';

/**
 * Live pre-auth estimate while editing a booking window. Rounds on the same steps
 * as the server (estimateBooking) so the preview matches the amount authorized.
 */
const START_BUFFER_MS = 5 * 60_000;

/**
 * Whether "Start session" is allowed now (server permits ±5 min of the window),
 * plus a hint explaining why it isn't — so a confirmed-but-future booking doesn't
 * let the driver tap into an avoidable server rejection.
 */
export function bookingStartState(
  status: string,
  startAt: Date,
  endAt: Date,
  hasSession: boolean,
  now: number,
): { startable: boolean; startHint?: string } {
  const inWindow =
    now >= startAt.getTime() - START_BUFFER_MS && now <= endAt.getTime() + START_BUFFER_MS;
  const startable = status === 'confirmed' && inWindow;
  if (status !== 'confirmed' || inWindow || hasSession) return { startable };
  return {
    startable,
    startHint:
      now < startAt.getTime() - START_BUFFER_MS
        ? 'You can start charging within 5 minutes of your booking window.'
        : 'This booking window has passed — contact support if you still need to charge.',
  };
}

export function bookingEditEstimate(es: Date, ee: Date, powerKw: number) {
  const editHours = Math.max(0.25, (ee.getTime() - es.getTime()) / 3_600_000);
  const editKwh = powerKw * editHours;
  const editRateCents = demandRateCents(es);
  const editEnergyCents = Math.round(editRateCents * editKwh);
  const editFeeCents = Math.round(editEnergyCents * 0.15);
  return {
    editHours,
    editKwh,
    editRateCents,
    editEnergyCents,
    editFeeCents,
    editTotalCents: editEnergyCents + editFeeCents,
  };
}

export function BookingPricingCard({
  estimatedKwh,
  estimatedCostCents,
  platformFeeCents,
  preauthAmountCents,
  capturedAmountCents,
}: {
  estimatedKwh: number;
  estimatedCostCents: number;
  platformFeeCents: number;
  preauthAmountCents: number;
  capturedAmountCents: number | null;
}) {
  return (
    <Card padding={16}>
      <Row between style={{ marginBottom: 8 }}>
        <Body style={{ color: '#6B6B70', fontSize: 13 }}>
          Energy (~{estimatedKwh.toFixed(1)} kWh)
        </Body>
        <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
          ${(estimatedCostCents / 100).toFixed(2)}
        </Body>
      </Row>
      <Row between style={{ marginBottom: 8 }}>
        <Body style={{ color: '#6B6B70', fontSize: 13 }}>Platform fee (15%)</Body>
        <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
          ${(platformFeeCents / 100).toFixed(2)}
        </Body>
      </Row>
      <View style={{ height: 1, backgroundColor: 'rgba(15,15,16,0.08)', marginVertical: 8 }} />
      <Row between style={{ marginBottom: 8 }}>
        <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '700' }}>Pre-auth held</Body>
        <Body style={{ color: '#0F0F10', fontSize: 16, fontWeight: '800' }}>
          ${(preauthAmountCents / 100).toFixed(2)}
        </Body>
      </Row>
      <Row between>
        <Body style={{ color: '#6B6B70', fontSize: 13 }}>Captured</Body>
        <Body style={{ color: '#0F0F10', fontSize: 14, fontWeight: '600' }}>
          {capturedAmountCents != null ? `$${(capturedAmountCents / 100).toFixed(2)}` : '—'}
        </Body>
      </Row>
    </Card>
  );
}

export function BookingActionBar({
  editing,
  savePending,
  editWindowValid,
  startable,
  startHint,
  hasSession,
  sessionId,
  status,
  reviewStars,
  canModify,
  hasChatThread,
  startPending,
  cancelPending,
  onSave,
  onDiscard,
  onStart,
  onViewSession,
  onReview,
  onModify,
  onChat,
  onCancel,
}: {
  editing: boolean;
  savePending: boolean;
  editWindowValid: boolean;
  startable: boolean;
  startHint?: string;
  hasSession: boolean;
  sessionId?: string;
  status: string;
  reviewStars?: number;
  canModify: boolean;
  hasChatThread: boolean;
  startPending: boolean;
  cancelPending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStart: () => void;
  onViewSession: (sessionId: string) => void;
  onReview: () => void;
  onModify: () => void;
  onChat: () => void;
  onCancel: () => void;
}) {
  return (
    <CTABar>
      {editing ? (
        <>
          <Button
            label={savePending ? 'Saving…' : 'Save changes'}
            loading={savePending}
            disabled={!editWindowValid || savePending}
            onPress={onSave}
          />
          <Button
            label="Discard"
            variant="secondary"
            height={44}
            fontSize={14}
            onPress={onDiscard}
          />
        </>
      ) : (
        <>
          {startable && !hasSession ? (
            <Button label="Start session" onPress={onStart} loading={startPending} />
          ) : startHint ? (
            <Muted style={{ textAlign: 'center' }}>{startHint}</Muted>
          ) : null}
          {sessionId && status !== 'completed' ? (
            <Button label="View live session" onPress={() => onViewSession(sessionId)} />
          ) : null}
          {status === 'completed' ? (
            <Button
              label={reviewStars ? `You rated your host ${reviewStars}★` : 'Rate your host'}
              variant={reviewStars ? 'secondary' : 'primary'}
              onPress={onReview}
            />
          ) : null}
          {canModify ? (
            <Button
              label="Change times"
              variant="secondary"
              height={44}
              fontSize={14}
              onPress={onModify}
            />
          ) : null}
          {hasChatThread ? (
            <Button
              label="Open chat with host"
              variant="secondary"
              height={44}
              fontSize={14}
              onPress={onChat}
            />
          ) : null}
          {['pending', 'confirmed'].includes(status) ? (
            <Button
              label={cancelPending ? 'Cancelling…' : 'Cancel booking'}
              variant="destructive-outline"
              height={44}
              fontSize={14}
              loading={cancelPending}
              disabled={cancelPending}
              onPress={onCancel}
            />
          ) : null}
        </>
      )}
    </CTABar>
  );
}
