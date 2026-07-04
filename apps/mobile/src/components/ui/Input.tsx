/** @file apps/mobile/src/components/ui/Input.tsx. */
import { useState } from 'react';
import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, onFocus, onBlur, ...rest }: Props) {
  const { c, radius, fontSize, fontWeight } = useTheme();
  // Focus ring: a visible focus state is both a polish cue and an a11y aid
  // (users can see which field is active before typing).
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.red : focused ? c.ink : 'transparent';
  const borderWidth = error || focused ? 1.5 : 0;

  return (
    <View>
      {label ? (
        <Text
          style={{
            color: c.muted2,
            fontSize: fontSize.label,
            fontWeight: fontWeight.medium,
            letterSpacing: 0.2,
            marginBottom: 8,
          }}
        >
          {label.toUpperCase()}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.muted2}
        // a11y: label the field + surface the error to assistive tech.
        accessibilityLabel={rest.accessibilityLabel ?? label}
        accessibilityState={{ disabled: rest.editable === false }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
        style={[
          {
            width: '100%',
            height: 52,
            borderRadius: radius.input,
            backgroundColor: c.chip,
            paddingHorizontal: 16,
            fontSize: fontSize.input,
            color: c.ink,
            borderWidth,
            borderColor,
          },
          style,
        ]}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: c.red, fontSize: 12, marginTop: 6 }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
