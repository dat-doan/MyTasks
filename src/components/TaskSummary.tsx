import { StyleSheet, Text, View } from "react-native";

export default function TaskSummary({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.summary}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 8 },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { color: "#444444" },
});
