/** @file apps/mobile/app/(shared)/support.tsx. */
import { useMemo, useState } from 'react';
import { Alert, View, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  Button,
  Input,
  SectionHeader,
  EmptyState,
} from '../../src/components/ui';
import { ChevronLeft, Search, ChevronRight, ChevronDown } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';

const SUPPORT_EMAIL = 'support@ednacharge.com';

type Faq = { id: string; q: string; a: string };

const FAQS: Faq[] = [
  {
    id: 'preauth',
    q: 'What is a pre-authorization?',
    a: 'When you start a booking we place a temporary hold on your card for the estimated cost of the session — no money moves yet. After charging ends we capture only the actual amount used and release the rest. Holds typically clear within a few business days.',
  },
  {
    id: 'declined',
    q: 'Why was my booking declined?',
    a: 'A host can decline a request if the charger is unavailable at your requested time, or a request auto-declines after 30 minutes without a response. Any pre-authorization hold is released automatically when a request is declined or expires.',
  },
  {
    id: 'payouts',
    q: 'How do payouts work?',
    a: 'Hosts are paid automatically after each completed session. EdnaCharge collects payment from the driver, deducts the service fee, and transfers the remainder to the host’s connected Stripe account. Payouts follow your Stripe payout schedule.',
  },
  {
    id: 'cancel',
    q: 'Can I cancel after starting a session?',
    a: 'You can stop a charging session at any time from the session screen. You’re only billed for the energy actually delivered up to the moment you stop, and the unused portion of the hold is released.',
  },
  {
    id: 'connectors',
    q: 'Which connectors are supported?',
    a: 'EdnaCharge supports J1772 (Type 1) and NACS/Tesla connectors on Level 2 chargers. Each listing shows its connector type and power output so you can confirm compatibility with your vehicle before booking.',
  },
  {
    id: 'pricing',
    q: 'How is the price set?',
    a: 'Pricing is set automatically based on demand and time of day, so you always pay a fair market rate. The current rate for a charger is shown on its listing and in your booking estimate before you confirm.',
  },
];

export default function Support() {
  const params = useLocalSearchParams<{
    bookingId?: string;
    sessionId?: string;
    payoutId?: string;
    contentReportId?: string;
  }>();
  const router = useRouter();
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState(params.bookingId ? 'Help with my booking' : '');
  const [message, setMessage] = useState('');
  const createTicket = trpc.support.createTicket.useMutation({
    onSuccess: () => {
      setMessage('');
      Alert.alert('Support ticket sent', 'We will follow up as soon as possible.');
    },
    onError: (e) =>
      handleError(e, {
        feature: 'Support',
        title: "Couldn't send your ticket",
      }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <Pressable
        onPress={() => router.back()}
        style={{ paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
      >
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Help</H1>

      <Card padding={14} style={{ marginTop: 14 }}>
        <Body style={{ fontWeight: '700' }}>Contact support</Body>
        <Muted style={{ fontSize: 12, marginTop: 4 }}>
          We will attach the current booking or session automatically when available.
        </Muted>
        <Input
          value={subject}
          onChangeText={setSubject}
          placeholder="Subject"
          maxLength={120}
          style={{ marginTop: 12 }}
        />
        <Input
          value={message}
          onChangeText={setMessage}
          placeholder="What happened?"
          multiline
          maxLength={2000}
          style={{ marginTop: 10, minHeight: 88, height: undefined, paddingTop: 14 }}
        />
        <Button
          label={createTicket.isPending ? 'Sending...' : 'Send ticket'}
          loading={createTicket.isPending}
          disabled={
            createTicket.isPending || subject.trim().length < 3 || message.trim().length < 10
          }
          onPress={() =>
            createTicket.mutate({
              subject: subject.trim(),
              message: message.trim(),
              bookingId: params.bookingId,
              sessionId: params.sessionId,
              payoutId: params.payoutId,
              contentReportId: params.contentReportId,
            })
          }
          style={{ marginTop: 12 }}
        />
      </Card>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search articles…"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search help articles"
        style={{ marginTop: 14 }}
      />

      <SectionHeader>Common questions</SectionHeader>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={22} color={c.muted} />}
          title="No results"
          subtitle={`We couldn’t find anything for “${query.trim()}”. Try different keywords or contact support.`}
        />
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {filtered.map((f, i) => {
            const open = openId === f.id;
            return (
              <View
                key={f.id}
                style={{
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: c.line,
                }}
              >
                <Pressable
                  onPress={() => setOpenId(open ? null : f.id)}
                  accessibilityRole="button"
                  accessibilityLabel={f.q}
                  accessibilityState={{ expanded: open }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16 }}
                >
                  <Row between>
                    <Body style={{ flex: 1, fontSize: 13, fontWeight: '600' }}>{f.q}</Body>
                    {open ? <ChevronDown color={c.muted2} /> : <ChevronRight color={c.muted2} />}
                  </Row>
                  {open ? (
                    <Muted style={{ marginTop: 8, fontSize: 13, lineHeight: 20 }}>{f.a}</Muted>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <Button
        label="Contact support"
        onPress={() =>
          Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() =>
            Alert.alert('Contact support', `Email us at ${SUPPORT_EMAIL}.`),
          )
        }
        style={{ marginTop: 18 }}
      />
      <Muted style={{ textAlign: 'center', marginTop: 10, fontSize: 12 }}>{SUPPORT_EMAIL}</Muted>
    </Screen>
  );
}
