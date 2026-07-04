/** @file apps/mobile/src/lib/haptics.ts. */
import * as Haptics from 'expo-haptics';

/**
 * Centralized, fail-safe haptics so tactile feedback is consistent across the
 * app (decisions, selections, success/error). expo-haptics can reject on the
 * simulator / unsupported devices, so every call swallows errors — feedback
 * must never be a crash vector.
 *
 * Usage: `haptics.light()` on primary taps, `haptics.selection()` on
 * chip/tab/picker changes, `haptics.success()`/`haptics.error()` on outcomes.
 */
export const haptics = {
  selection() {
    void Haptics.selectionAsync().catch(() => {});
  },
  light() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
