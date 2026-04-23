import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/state/auth';

export default function ChatThread() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const session = useAuth((s) => s.session);
  const me = session?.user.id;
  const q = trpc.chat.getThread.useQuery({ bookingId: bookingId! }, { enabled: !!bookingId });
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

  // Realtime subscription on the thread's messages table.
  useEffect(() => {
    if (!q.data?.id) return;
    const channel = supabase
      .channel(`chat:${q.data.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ChatMessage', filter: `threadId=eq.${q.data.id}` },
        () => utils.chat.getThread.invalidate({ bookingId: bookingId! }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.id]);

  useEffect(() => {
    const msgs = q.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (q.data?.id && last) markRead.mutate({ threadId: q.data.id, upToMessageId: last.id });
    if (msgs.length > 0) listRef.current?.scrollToEnd({ animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.messages.length]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <View className="pt-16 px-4 pb-2 border-b border-gray-100">
        <Text className="text-lg font-semibold">
          {q.data?.booking.charger.title ?? 'Chat'}
        </Text>
        <Text className="text-xs text-gray-500">{q.data?.booking.status}</Text>
      </View>
      <FlatList
        ref={listRef}
        data={q.data?.messages ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          if (item.kind === 'system') {
            return (
              <View className="items-center my-2">
                <Text className="text-xs text-gray-500">{item.body}</Text>
              </View>
            );
          }
          const mine = item.senderId === me;
          return (
            <View className={`my-1 ${mine ? 'self-end' : 'self-start'}`}>
              <View className={`rounded-2xl px-4 py-2 max-w-[80%] ${mine ? 'bg-black' : 'bg-gray-100'}`}>
                <Text className={mine ? 'text-white' : 'text-black'}>{item.body}</Text>
              </View>
              {mine && item.readAt ? (
                <Text className="text-[10px] text-gray-400 text-right mt-1">Seen</Text>
              ) : null}
            </View>
          );
        }}
      />
      <View className="p-3 border-t border-gray-100 flex-row gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          className="flex-1 border border-gray-300 rounded-full px-4 py-2"
          multiline
        />
        <Pressable
          onPress={() => q.data?.id && draft.trim() && send.mutate({ threadId: q.data.id, body: draft.trim() })}
          className="bg-black rounded-full px-4 justify-center"
        >
          <Text className="text-white">Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
