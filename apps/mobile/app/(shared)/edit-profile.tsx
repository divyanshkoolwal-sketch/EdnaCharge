import { useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Screen,
  Button,
  CTABar,
  Input,
  H1,
  Muted,
  Label,
  Avatar,
  useToast,
} from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { handleError } from '../../src/lib/errors';

function normalizeMime(m?: string | null): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (m?.includes('png')) return 'image/png';
  if (m?.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

export default function EditProfile() {
  const router = useRouter();
  const { c } = useTheme();
  const toast = useToast();
  const utils = trpc.useUtils();
  const me = trpc.auth.getSession.useQuery();
  const [name, setName] = useState('');
  const [nameInit, setNameInit] = useState(false);

  // Seed the name field once the session loads.
  if (!nameInit && me.data) {
    setName(me.data.fullName ?? '');
    setNameInit(true);
  }

  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      toast.show('Photo updated', 'success');
    },
    onError: (e) => handleError(e, { feature: 'Profile photo' }),
  });

  const save = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.getSession.invalidate();
      toast.show('Profile saved', 'success');
      router.back();
    },
    onError: (e) => handleError(e, { feature: 'Edit profile' }),
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) {
      Alert.alert('Could not read image', 'Please try a different photo.');
      return;
    }
    uploadAvatar.mutate({ base64: asset.base64, mime: normalizeMime(asset.mimeType) });
  };

  const canSave = name.trim().length > 0 && name.trim() !== (me.data?.fullName ?? '');

  return (
    <Screen keyboardAvoiding contentStyle={{ paddingBottom: 24 }}>
      <Pressable
        onPress={() => router.back()}
        style={{ paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
      >
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Edit profile</H1>

      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <Pressable
          onPress={pickPhoto}
          disabled={uploadAvatar.isPending}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          <Avatar name={me.data?.fullName ?? 'EC'} uri={me.data?.avatarUrl} size="lg" />
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              backgroundColor: c.ink,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            {uploadAvatar.isPending ? (
              <ActivityIndicator size="small" color={c.bg} />
            ) : (
              <Muted style={{ color: c.bg, fontSize: 10, fontWeight: '700' }}>Edit</Muted>
            )}
          </View>
        </Pressable>
        <Muted style={{ fontSize: 12, marginTop: 10 }}>Tap to change your photo</Muted>
      </View>

      <View style={{ marginTop: 24 }}>
        <Label style={{ marginBottom: 8 }}>DISPLAY NAME</Label>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          maxLength={100}
          autoCapitalize="words"
          accessibilityLabel="Display name"
        />
        <Muted style={{ fontSize: 12, marginTop: 8 }}>
          This is the name hosts and drivers see on your bookings and reviews.
        </Muted>
      </View>

      <CTABar>
        <Button
          label="Save changes"
          onPress={() => save.mutate({ fullName: name.trim() })}
          loading={save.isPending}
          disabled={!canSave}
        />
      </CTABar>
    </Screen>
  );
}
