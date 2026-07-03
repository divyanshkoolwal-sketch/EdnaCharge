// Lightweight SVG icons matching the design canvas's stroke style.
// All icons accept `size` + `color` and inherit from theme.
import Svg, { Path, Circle, Rect, Polyline } from 'react-native-svg';
import { useTheme } from '../../theme/useTheme';

type Props = { size?: number; color?: string };

function useStroke(color?: string) {
  const t = useTheme();
  return color ?? t.c.ink;
}

export const ChevronLeft = ({ size = 22, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M12 4l-6 6 6 6"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const ChevronRight = ({ size = 14, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M5 3l4 4-4 4"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const ChevronDown = ({ size = 14, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M3 5l4 4 4-4"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const Close = ({ size = 22, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M5 5l10 10M15 5L5 15" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
};

export const Bolt = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M10 1L3 10h5l-1 7 7-9h-5l1-7Z" fill={stroke} />
    </Svg>
  );
};

export const PinIcon = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        d="M9 1.5C5.7 1.5 3 4.2 3 7.5c0 4.5 6 9 6 9s6-4.5 6-9c0-3.3-2.7-6-6-6Z"
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
      />
      <Circle cx={9} cy={7.5} r={2} stroke={stroke} strokeWidth={1.5} fill="none" />
    </Svg>
  );
};

export const Search = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Circle cx={8} cy={8} r={5.5} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path d="M12 12l4 4" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
};

export const Send = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M3 10l14-7-5 17-2-7-7-3Z"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const Gear = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={2.5} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path
        d="M10 1.5v3M10 15.5v3M3.5 3.5l2 2M14.5 14.5l2 2M1.5 10h3M15.5 10h3M3.5 16.5l2-2M14.5 5.5l2-2"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
};

export const Chat = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M3 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8l-3 3v-3a3 3 0 0 1-2-3V6Z"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const CalendarIcon = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Rect x={3} y={4} width={14} height={13} rx={2} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path d="M3 8h14M7 2v3M13 2v3" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
};

export const User = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={7} r={3.5} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path
        d="M3 17c1-3.5 4-5 7-5s6 1.5 7 5"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

export const Home = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M3 10l7-6 7 6v7a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1v-7Z"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const ListIcon = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M3 5h14M3 10h14M3 15h14" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
};

export const Plus = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M9 3v12M3 9h12" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
};

export const Star = ({ size = 14, color = '#F2A66A' }: Props) => (
  <Svg width={size} height={size} viewBox="0 0 14 14">
    <Path
      d="M7 1l1.8 4 4.2.4-3.2 2.9 1 4.2L7 10.3l-3.8 2.2 1-4.2L1 5.4 5.2 5 7 1Z"
      fill={color}
    />
  </Svg>
);

export const Bell = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M10 3a5 5 0 0 0-5 5v3l-1.5 2.5h13L15 11V8a5 5 0 0 0-5-5ZM8 16.5c.4 1 1.1 1.5 2 1.5s1.6-.5 2-1.5"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const Help = ({ size = 20, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={7} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path
        d="M8 8c0-1.1 1-2 2-2s2 .9 2 2c0 1.5-2 1.5-2 3M10 14h.01"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
};

export const Card = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Rect x={2} y={4} width={14} height={10} rx={2} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Path d="M2 8h14" stroke={stroke} strokeWidth={1.5} />
    </Svg>
  );
};

export const Check = ({ size = 16, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M3 8.5l3.5 3.5L13 5"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

export const Recenter = ({ size = 18, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Circle cx={9} cy={9} r={2.5} stroke={stroke} strokeWidth={1.6} fill="none" />
      <Path
        d="M9 1v3M9 14v3M1 9h3M14 9h3"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
};

export const Edit = ({ size = 16, color }: Props) => {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M11.5 2.5l2 2-8 8H3.5v-2l8-8Z"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

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
