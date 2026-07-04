/** Chart-like SVG icons used by dashboard-style mobile screens. */
import Svg, { Polyline } from 'react-native-svg';

type Props = { size?: number; color?: string };

export const Sparkline = ({ size = 200, color = '#A9DCAA' }: Props) => (
  <Svg width={size} height={40} viewBox="0 0 200 40">
    <Polyline
      points="0,30 20,28 40,22 60,18 80,15 100,12 120,14 140,11 160,10 180,12 200,10"
      stroke={color}
      strokeWidth={1.5}
      fill="none"
    />
  </Svg>
);
