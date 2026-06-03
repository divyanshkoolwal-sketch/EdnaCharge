import { useMemo } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';

/**
 * App list primitive backed by FlashList for smooth scrolling.
 *
 * Wraps FlashList in a flex:1 container because FlashList — unlike FlatList —
 * requires a bounded-height parent (it renders nothing in an unbounded one).
 * Also exposes a `gap` prop: FlashList ignores `gap` in contentContainerStyle,
 * so we translate it into an ItemSeparatorComponent to preserve row spacing.
 */
type ListProps<T> = FlashListProps<T> & { gap?: number };

export function List<T>({ gap, ItemSeparatorComponent, ...rest }: ListProps<T>) {
  const Separator = useMemo(() => {
    if (ItemSeparatorComponent) return ItemSeparatorComponent;
    if (!gap) return undefined;
    const Sep = () => <View style={{ height: gap }} />;
    return Sep;
  }, [gap, ItemSeparatorComponent]);

  return (
    <View style={{ flex: 1 }}>
      <FlashList ItemSeparatorComponent={Separator} {...rest} />
    </View>
  );
}
