// Screen scaffold matching the design canvas — handles safe area, theme bg,
// status-bar tint, and keyboard handling for input-heavy screens.
//
// Keyboard handling (the reusable fix for "keyboard covers inputs / buttons →
// dead-end form"):
//  - When `scroll` OR `keyboardAvoiding` is set, the body + footer are wrapped
//    in ONE KeyboardAvoidingView. The body renders in a flex:1 ScrollView and
//    any <CTABar> renders as a normal flex sibling BELOW it (see CTABar's
//    `inFlow`). When the keyboard opens, the KAV shrinks the container, the
//    ScrollView shrinks (content stays scrollable), and the CTABar sits flush
//    above the keyboard — so the submit button can never overlap the form.
//  - Non-scrollable screens keep the classic pinned (absolute) CTABar.
import { Children, isValidElement, cloneElement, type ReactElement } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';
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

  // Pull any CTABar out of the children. On scrollable screens it rides above
  // the keyboard as an in-flow sibling; on non-scrollable screens it stays the
  // classic pinned absolute bar.
  const kids = Children.toArray(children);
  const footerEls = kids.filter((k) => isValidElement(k) && k.type === CTABar) as ReactElement[];
  const body = kids.filter((k) => !(isValidElement(k) && k.type === CTABar));
  const footer = footerEls.map((el, i) =>
    scrollable ? cloneElement(el, { key: el.key ?? i, inFlow: true }) : el,
  );

  const content = (
    <>
      {scrollable ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1 }, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer}
    </>
  );

  const padStyle: ViewStyle = {
    flex: 1,
    paddingHorizontal: flush ? 0 : 24,
    paddingTop: flush ? 0 : 4,
  };

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
      {scrollable ? (
        <KeyboardAvoidingView
          style={[padStyle, style]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View style={[padStyle, style]}>{content}</View>
      )}
    </SafeAreaView>
  );
}
