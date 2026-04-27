import { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Button, CTABar, H1, Muted } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { supabase } from '../../src/lib/supabase';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';

export default function Otp() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const { c, radius } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const utils = trpc.useUtils();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setResendIn((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async () => {
    if (!email || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) {
      handleError(error, { title: 'Bad code' });
      return;
    }
    const session = await utils.auth.getSession.fetch();
    if (!session.driverProfile) {
      router.replace('/(auth)/driver-profile');
    } else {
      router.replace('/');
    }
  };

  return (
    <Screen keyboardAvoiding>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <View style={{ marginTop: 24 }}>
        <H1>Enter the code</H1>
        <Muted style={{ marginTop: 8, fontSize: 14 }}>
          Sent to <Text style={{ color: c.ink, fontWeight: '700' }}>{email}</Text>
        </Muted>
      </View>

      <Pressable onPress={() => inputRef.current?.focus()}>
        <View style={{ marginTop: 32, flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < code.length;
            const active = i === code.length;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: radius.input,
                  borderWidth: 1.5,
                  borderColor: filled || active ? c.ink : c.line2,
                  backgroundColor: filled ? c.card : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: filled ? c.ink : c.muted2,
                  }}
                >
                  {code[i] ?? ''}
                </Text>
              </View>
            );
          })}
        </View>
      </Pressable>
      {/* The actual editable buffer — visually hidden but receives input. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoFocus
        maxLength={6}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />

      <View style={{ marginTop: 20, alignItems: 'center' }}>
        {resendIn > 0 ? (
          <Muted style={{ fontSize: 13 }}>
            Resend in <Text style={{ color: c.ink, fontWeight: '700' }}>{resendIn}s</Text>
          </Muted>
        ) : (
          <Pressable
            onPress={async () => {
              if (!email) return;
              await supabase.auth.signInWithOtp({ email });
              setResendIn(30);
            }}
          >
            <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>Resend code</Text>
          </Pressable>
        )}
      </View>
      <CTABar>
        <Button label="Continue" onPress={verify} loading={busy} disabled={code.length !== 6} />
      </CTABar>
    </Screen>
  );
}
