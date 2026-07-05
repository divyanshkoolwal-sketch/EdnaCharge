/** Public booking router assembled from focused procedure modules. */
import { router } from '../trpc.js';
import { requestBooking } from './booking/request.js';
import { modifyBooking } from './booking/modify.js';
import { respondBooking, cancelBooking } from './booking/respond.js';
import { startSession, stopSession } from './booking/session.js';
import { listBookings, getBooking, bookingBySessionId } from './booking/read.js';

export const bookingRouter = router({
  requestBooking,
  modify: modifyBooking,
  respond: respondBooking,
  cancel: cancelBooking,
  startSession,
  stopSession,
  list: listBookings,
  get: getBooking,
  bySessionId: bookingBySessionId,
});
