import { StyleSheet, Text, View } from "react-native";

export default function TaskTracking({ percent = 0 }: { percent: number }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tiến độ hoàn thành</Text>
        <Text style={styles.title}>{`${percent.toFixed(0)}%`}</Text>
      </View>
      <TaskProgressBar percent={percent} />
    </View>
  );
}

function TaskProgressBar({ percent = 0 }: { percent: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%` }]}></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#DAE3FD",
    padding: 16,
    borderRadius: 16,
    marginVertical: 8,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    fontWeight: 500,
    color: "#00008B",
  },
  track: {
    backgroundColor: "#BDCBFB",
    height: 8,
    borderRadius: 10,
  },
  fill: {
    backgroundColor: "#423BDB",
    borderRadius: 10,
    height: "100%",
  },
});
