// Screen scaffold matching the design canvas — handles safe area, theme bg,
// status-bar tint, and keyboard handling for input-heavy screens.
//
// Keyboard handling (the reusable fix for "keyboard covers inputs / buttons →
// dead-end form"):
//  - When `scroll` OR `keyboardAvoiding` is set, the body renders inside a
//    ScrollView that adjusts its insets for the keyboard (every field can be
//    scrolled into view), keeps taps working while the keyboard is up
//    (`keyboardShouldPersistTaps="handled"`), and dismisses on drag / tap-out.
//  - Any <CTABar> passed in `children` is pulled OUT of the scroll area and
//    pinned at the bottom, where it rides above the keyboard (see CTABar). So
//    the submit button stays reachable on every input screen with no
//    per-screen code.
import { Children, isValidElement } from 'react';
import { View, ScrollView, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme/useTheme';
import { CTABar } from './Button';

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
  // Either flag opts the body into the keyboard-aware scroll container. They're
  // now synonyms (kept separate for call-site readability / back-compat).
  const scrollable = scroll || keyboardAvoiding;

  // Pull any CTABar out of the children so it can be pinned (and ride above the
  // keyboard) instead of scrolling away inside the content.
  const kids = Children.toArray(children);
  const footer = kids.filter((k) => isValidElement(k) && k.type === CTABar);
  const body = kids.filter((k) => !(isValidElement(k) && k.type === CTABar));

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
        {scrollable ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={contentStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
        {footer}
      </View>
    </SafeAreaView>
  );
}
