/** @file apps/mobile/src/features/chat/BookingChatThread.tsx. */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Chip } from '../../components/ui';
import { ChevronLeft, Send } from '../../components/icons/Icon';
import { handleError } from '../../lib/errors';
import { trpc } from '../../lib/trpc';
import { useTheme } from '../../theme/useTheme';

type ChatRole = 'driver' | 'host';

const QUICK_REPLIES: Record<ChatRole, string[]> = {
  driver: ['On my way ✓', "I'm here", "Can't find the spot"],
  host: ['Confirmed ✓', 'Plug into the right side', 'See you soon'],
};

export function BookingChatThread({ role }: { role: ChatRole }) {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { c, isDark } = useTheme();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);

  const q = trpc.chat.getThread.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId, refetchInterval: 4000 },
  );
  const me = trpc.auth.getSession.useQuery(undefined).data?.id;
  const utils = trpc.useUtils();
  const send = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setDraft('');
      utils.chat.getThread.invalidate({ bookingId: bookingId! });
    },
    onError: (e) => handleError(e, { feature: 'Chat' }),
  });
  const reportMessage = trpc.moderation.reportChatMessage.useMutation({
    onSuccess: () => Alert.alert('Report sent', 'Thanks. We’ll review this chat.'),
    onError: (e) => handleError(e, { feature: 'Safety' }),
  });
  const reportUser = trpc.moderation.reportUser.useMutation({
    onSuccess: () => Alert.alert('Report sent', 'Thanks. We’ll review this account.'),
    onError: (e) => handleError(e, { feature: 'Safety' }),
  });
  const blockUser = trpc.moderation.blockUser.useMutation({
    onSuccess: () => Alert.alert('User blocked', 'They can no longer message you.'),
    onError: (e) => handleError(e, { feature: 'Safety' }),
  });
  const markRead = trpc.chat.markRead.useMutation();

  const booking = q.data?.booking;
  const canSend = !!q.data?.id && !!draft.trim() && !send.isPending;
  const counterpartyId = role === 'driver' ? booking?.charger.hostId : booking?.driverId;
  const latestReportableMessage = [...(q.data?.messages ?? [])]
    .reverse()
    .find((m) => m.kind === 'text' && m.senderId && m.senderId !== me);
  const title =
    role === 'driver'
      ? (booking?.charger.title ?? 'Chat')
      : (booking?.driver?.fullName ?? 'Driver');
  const subtitle =
    role === 'driver'
      ? (booking?.status ?? '—')
      : `${booking?.charger.title ?? ''} · ${booking?.status ?? '—'}`;
  const avatarName = role === 'driver' ? (booking?.charger.title ?? 'EC') : title;
  const bookingPath = role === 'driver' ? '/(driver)/booking/[id]' : '/(host)/request/[id]';

  const openSafetyActions = () => {
    if (!counterpartyId) return;
    Alert.alert('Safety', 'Report abusive content or block this user.', [
      latestReportableMessage
        ? {
            text: 'Report latest message',
            onPress: () =>
              reportMessage.mutate({ messageId: latestReportableMessage.id, reason: 'other' }),
          }
        : {
            text: 'Report user',
            onPress: () => reportUser.mutate({ userId: counterpartyId, reason: 'other' }),
          },
      {
        text: 'Block user',
        style: 'destructive' as const,
        onPress: () => blockUser.mutate({ userId: counterpartyId }),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  useEffect(() => {
    const msgs = q.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (q.data?.id && last) markRead.mutate({ threadId: q.data.id, upToMessageId: last.id });
    if (msgs.length > 0) listRef.current?.scrollToEnd({ animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.messages.length]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable onPress={() => router.back()}>
            <ChevronLeft />
          </Pressable>
          <Avatar name={avatarName} size="sm" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.ink }}>{title}</Text>
            <Text style={{ fontSize: 11, color: c.muted }}>{subtitle}</Text>
          </View>
          <Pressable
            onPress={() => router.push({ pathname: bookingPath, params: { id: bookingId! } })}
          >
            <Text style={{ fontSize: 12, color: c.ink, fontWeight: '600' }}>View booking</Text>
          </Pressable>
          <Pressable
            onPress={openSafetyActions}
            disabled={!counterpartyId}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Chat safety options"
          >
            <Text style={{ fontSize: 12, color: c.muted, fontWeight: '600' }}>Safety</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={q.data?.messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            if (item.kind === 'system') {
              return (
                <View style={{ alignItems: 'center', marginVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: c.muted }}>{item.body}</Text>
                </View>
              );
            }
            const mine = item.senderId === me;
            return (
              <View>
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '78%',
                    backgroundColor: mine ? c.ink : c.chip,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    borderBottomRightRadius: mine ? 4 : 16,
                    borderBottomLeftRadius: mine ? 16 : 4,
                  }}
                >
                  <Text style={{ color: mine ? c.bg : c.ink, fontSize: 14 }}>{item.body}</Text>
                </View>
                {mine && item.readAt ? (
                  <Text
                    style={{
                      fontSize: 10,
                      color: c.muted2,
                      alignSelf: 'flex-end',
                      marginTop: 2,
                    }}
                  >
                    Seen
                  </Text>
                ) : null}
              </View>
            );
          }}
        />

        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: 'row',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {booking?.charger.gateCode ? (
            <Chip
              label={`Gate: ${booking.charger.gateCode}`}
              variant="outline"
              onPress={
                role === 'host'
                  ? () => setDraft(`Gate code: ${booking.charger.gateCode}`)
                  : undefined
              }
            />
          ) : null}
          {QUICK_REPLIES[role].map((reply) => (
            <Chip key={reply} label={reply} variant="outline" onPress={() => setDraft(reply)} />
          ))}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 18,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={c.muted2}
            accessibilityLabel="Message"
            multiline
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              borderRadius: 20,
              backgroundColor: c.chip,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 10,
              color: c.ink,
              fontSize: 14,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            onPress={() =>
              canSend && q.data?.id && send.mutate({ threadId: q.data.id, body: draft.trim() })
            }
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canSend ? 1 : 0.45,
            }}
          >
            <Send size={16} color={c.bg} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
