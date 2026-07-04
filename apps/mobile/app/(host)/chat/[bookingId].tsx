/** @file apps/mobile/app/(host)/chat/[bookingId].tsx. */
import { BookingChatThread } from '../../../src/features/chat/BookingChatThread';

export default function HostChatThread() {
  return <BookingChatThread role="host" />;
}
