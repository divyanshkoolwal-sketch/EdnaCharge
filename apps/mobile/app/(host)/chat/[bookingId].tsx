import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/theme/useTheme';
import { Avatar, Chip } from '../../../src/components/ui';
import { ChevronLeft, Send } from '../../../src/components/icons/Icon';
import { trpc } from '../../../src/lib/trpc';

const STATIC_HOST_REPLIES = ['Confirmed ✓', 'Plug into the right side', 'See you soon'];

export default function HostChatThread() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { c } = useTheme();
  // Poll for new messages. The mobile Supabase client is anon (auth is Firebase),
  // so the old RLS-gated postgres_changes subscription never delivered. Polling
  // is reliable and has no Realtime/RLS dependency.
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
  });
  const markRead = trpc.chat.markRead.useMutation();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);


  useEffect(() => {
    const msgs = q.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (q.data?.id && last) markRead.mutate({ threadId: q.data.id, upToMessageId: last.id });
    if (msgs.length > 0) listRef.current?.scrollToEnd({ animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.messages.length]);

  // Host view: counterparty is the driver
  const driverName = q.data?.booking.driver?.fullName ?? 'Driver';
  const chargerTitle = q.data?.booking.charger.title ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
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
          <Avatar name={driverName} size="sm" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F0F10' }}>
              {driverName}
            </Text>
            <Text style={{ fontSize: 11, color: '#6B6B70' }}>
              {chargerTitle} · {q.data?.booking.status ?? '—'}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(host)/request/[id]', params: { id: bookingId! } })
            }
          >
            <Text style={{ fontSize: 12, color: '#0F0F10', fontWeight: '600' }}>View booking</Text>
          </Pressable>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={q.data?.messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            if (item.kind === 'system') {
              return (
                <View style={{ alignItems: 'center', marginVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6B6B70' }}>{item.body}</Text>
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
                      color: '#A4A4A8',
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

        {/* Quick replies — prepends "Gate code: {{code}}" if the host set one */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {q.data?.booking.charger.gateCode ? (
            <Chip
              label={`Gate: ${q.data.booking.charger.gateCode}`}
              variant="outline"
              onPress={() => setDraft(`Gate code: ${q.data!.booking.charger.gateCode}`)}
            />
          ) : null}
          {STATIC_HOST_REPLIES.map((r) => (
            <Chip key={r} label={r} variant="outline" onPress={() => setDraft(r)} />
          ))}
        </View>

        {/* Composer */}
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
            accessibilityState={{ disabled: !draft.trim() }}
            onPress={() =>
              q.data?.id && draft.trim() && send.mutate({ threadId: q.data.id, body: draft.trim() })
            }
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Send size={16} color={c.bg} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
