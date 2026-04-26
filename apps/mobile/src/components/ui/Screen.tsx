// Screen scaffold matching the design canvas — handles safe area, theme bg,
// status-bar tint, and keyboard avoidance for input-heavy screens.
import { View, ScrollView, KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme/useTheme';

export function Screen({
  children,
  scroll,
  flush,
  style,
  contentStyle,
  keyboardAvoiding,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  flush?: boolean; // no horizontal padding (full-bleed map / chats)
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  keyboardAvoiding?: boolean;
}) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const inner = (
    <View
      style={[
        {
          flex: 1,
          paddingHorizontal: flush ? 0 : 24,
          paddingTop: flush ? 0 : 4,
        },
        style,
      ]}
    >
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: c.bg,
        // tab-bar pages render their own bottom inset
      }}
      edges={['top']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
