import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, ...rest }: Props) {
  const { c, radius, fontSize, fontWeight } = useTheme();
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
            borderWidth: error ? 1 : 0,
            borderColor: error ? c.red : 'transparent',
          },
          style,
        ]}
      />
      {error ? (
        <Text style={{ color: c.red, fontSize: 12, marginTop: 6 }}>{error}</Text>
      ) : null}
    </View>
  );
}
