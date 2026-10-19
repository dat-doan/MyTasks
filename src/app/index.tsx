import { View, Text } from 'react-native';

export default function ShrinkDemo() {
  return (
    <View style={{ width: 300, maxWidth: '100%', flexDirection: 'row', gap: 20 }}>
      <View style={{ flexBasis: 200, flexGrow: 0, flexShrink: 1,
        minWidth: 0, height: 64, backgroundColor: '#d8eee5' }}>
        <Text>A</Text>
      </View>
      <View style={{ flexBasis: 200, flexGrow: 0, flexShrink: 2,
        minWidth: 0, height: 64, backgroundColor: '#dfebfa' }}>
        <Text>B</Text>
      </View>
    </View>
  );
}
// Khi hàng thực sự rộng 300: A = 160, B = 120, gap = 20.