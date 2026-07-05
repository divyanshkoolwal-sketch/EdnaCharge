/** @file apps/mobile/src/components/ui/List.tsx. */
import { View, FlatList, type FlatListProps } from 'react-native';

type ListProps<T> = FlatListProps<T> & { gap?: number; estimatedItemSize?: number };

export function List<T>({
  gap,
  ItemSeparatorComponent,
  estimatedItemSize: _estimatedItemSize,
  ...rest
}: ListProps<T>) {
  const Separator =
    ItemSeparatorComponent ?? (gap ? () => <View style={{ height: gap }} /> : undefined);

  return (
    <View style={{ flex: 1 }}>
      <FlatList ItemSeparatorComponent={Separator} {...rest} />
    </View>
  );
}
