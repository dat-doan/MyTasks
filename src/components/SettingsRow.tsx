import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type SettingsRowProps = {
  icon: ComponentProps<typeof SymbolView>["name"];
  title: string;
  description: string;
  onPress: () => void;
};

export default function SettingsRow({
  icon,
  title,
  description,
  onPress,
}: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${description}`}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <SymbolView
          name={icon}
          size={22}
          tintColor="#4F46E5"
          accessible={false}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <SymbolView
        name={{
          ios: "chevron.right",
          android: "chevron_right",
          web: "chevron_right",
        }}
        size={16}
        tintColor="#94A3B8"
        accessible={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  pressedRow: {
    backgroundColor: "#F1F5F9",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    color: "#0F172A",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
  },
});
