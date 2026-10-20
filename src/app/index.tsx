import TaskSummary from "@/components/TaskSummary";
import TaskTracking from "@/components/TaskTracking";
import { StyleSheet, View } from "react-native";

export default function MyTasks() {
  return (
    <View style={styles.container}>
      <TaskSummary title="My Tasks" subtitle="0 cong viec hoan thanh" />
      <TaskTracking percent={35} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 10,
    backgroundColor: "#F7F9FB",
  },
});
