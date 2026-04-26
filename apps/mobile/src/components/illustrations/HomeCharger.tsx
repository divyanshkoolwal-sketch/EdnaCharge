// Reusable home + charger illustration matching the design canvas's
// Welcome / Host-Intro hero. Pure SVG; no native deps beyond react-native-svg.
import { View } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/useTheme';

export function HomeChargerIllo({ size = 200 }: { size?: number }) {
  const { c, isDark } = useTheme();
  // Soft pad bg + diagonal hatch — recreated with linear gradient + Svg pattern.
  const padBg = isDark ? '#2A2A2D' : '#E8E5DC';
  const padBg2 = isDark ? '#1F1F22' : '#F2F0E8';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {/* gradient bg */}
        <Rect width={200} height={200} fill={padBg} />
        <Rect width={200} height={200} fill={padBg2} opacity={0.4} />
        {/* house */}
        <Path d="M50 110 L100 60 L150 110 L150 160 L50 160 Z" fill={c.ink} />
        {/* door / window */}
        <Rect x={88} y={120} width={28} height={40} fill={c.green2} />
        {/* sun / bolt */}
        <Circle cx={142} cy={88} r={20} fill={c.green2} stroke={c.ink} strokeWidth={2} />
        <Path
          d="M142 76 L134 92 L142 92 L138 102 L150 88 L142 88 L144 76 Z"
          fill={c.ink}
        />
      </Svg>
    </View>
  );
}

// Compact charger illo for cards.
export function ChargerIllo({ height = 110 }: { height?: number }) {
  const { c, isDark } = useTheme();
  const padBg = isDark ? '#2A2A2D' : '#E8E5DC';
  const padBg2 = isDark ? '#1F1F22' : '#F2F0E8';
  return (
    <View
      style={{
        width: '100%',
        height,
        borderRadius: 18,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: padBg,
      }}
    >
      <Svg width="100%" height={height} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet">
        <Rect width={200} height={120} fill={padBg2} opacity={0.4} />
        <Rect x={70} y={20} width={60} height={80} rx={6} fill={c.ink} />
        <Rect x={78} y={30} width={44} height={26} rx={3} fill={c.green2} />
        <Circle cx={92} cy={78} r={4} fill={c.bg} />
        <Circle cx={108} cy={78} r={4} fill={c.bg} />
        <Rect x={88} y={92} width={24} height={14} rx={2} fill={c.ink} />
        <Path d="M130 40 Q150 40 150 60 L150 80" stroke={c.ink} strokeWidth={3} fill="none" />
        <Rect x={144} y={80} width={12} height={10} rx={2} fill={c.ink} />
      </Svg>
    </View>
  );
}

// Big circular success check used after host onboarding completes.
export function SuccessCheckIllo({ size = 140 }: { size?: number }) {
  const { c, isDark } = useTheme();
  const padBg = isDark ? '#2A2A2D' : '#E8E5DC';
  const padBg2 = isDark ? '#1F1F22' : '#F2F0E8';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: padBg,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 140 140">
        <Rect width={140} height={140} fill={padBg2} opacity={0.4} />
        <Path
          d="M40 72 L60 92 L100 50"
          stroke={c.ink}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
