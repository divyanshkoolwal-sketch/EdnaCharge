import { Alert, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  SectionHeader,
  Button,
} from '../../src/components/ui';
import { ChevronLeft, ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useAuth } from '../../src/state/auth';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const me = trpc.auth.getSession.useQuery();
  const email = session?.user.email ?? me.data?.email ?? '';
  const phone = me.data?.phone ?? '';

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      // Server already removed the row + Stripe artifacts. Sign out client-side
      // so the auth listener routes back to Welcome.
      await signOut();
      router.replace('/(auth)/welcome');
    },
    onError: (e) => handleError(e, { feature: 'Account deletion' }),
  });

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently removes your profile, bookings, listings, and chat history. Active payment authorizations will be canceled. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            // Double-confirm — App Store reviewers test this, easy to misclick.
            Alert.alert(
              'Are you sure?',
              "This is permanent. Type 'DELETE' isn't required, but you'll lose all of your data.",
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete',
                  style: 'destructive',
                  onPress: () => deleteAccount.mutate(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Settings</H1>

      <SectionHeader>Account</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <Row
          between
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: phone ? 1 : 0,
            borderBottomColor: c.line,
          }}
        >
          <View style={{ flex: 1 }}>
            <Muted style={{ fontSize: 11 }}>EMAIL</Muted>
            <Body style={{ fontSize: 14, marginTop: 2 }}>{email || '—'}</Body>
          </View>
        </Row>
        {phone ? (
          <Row
            between
            style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Muted style={{ fontSize: 11 }}>PHONE</Muted>
              <Body style={{ fontSize: 14, marginTop: 2 }}>{phone}</Body>
            </View>
          </Row>
        ) : null}
      </Card>

      <SectionHeader>Privacy & policies</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <Pressable
          onPress={() => router.push('/(shared)/support' as never)}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Body style={{ flex: 1, fontSize: 14 }}>Support</Body>
          <ChevronRight color={c.muted2} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/(shared)/legal?doc=privacy' as never)}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Body style={{ flex: 1, fontSize: 14 }}>Privacy policy</Body>
          <ChevronRight color={c.muted2} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/(shared)/legal?doc=terms' as never)}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Body style={{ flex: 1, fontSize: 14 }}>Terms of service</Body>
          <ChevronRight color={c.muted2} />
        </Pressable>
      </Card>

      <SectionHeader>Danger zone</SectionHeader>
      <Muted style={{ fontSize: 12, marginBottom: 10 }}>
        Deleting your account is permanent. Active bookings will be canceled and any held payment
        authorizations will be released back to your card.
      </Muted>
      <Button
        label="Delete account"
        variant="destructive-outline"
        onPress={onDeleteAccount}
        loading={deleteAccount.isPending}
      />
    </Screen>
  );
}
