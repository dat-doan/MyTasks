import { FlashList } from "@shopify/flash-list";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Task } from "../models/Task";

export type TaskItemAction = "toggle" | "delete";

export default function TaskList({
  tasks,
  onAction,
}: {
  tasks: Task[];
  onAction: (action: TaskItemAction, id: string) => void;
}) {
  if (tasks.length === 0)
    return (
      <Text style={styles.empty}>
        Chưa có công việc nào. Hãy thêm công việc nhé!
      </Text>
    );
  return (
    <FlashList
      style={styles.list}
      keyExtractor={(item) => item.id}
      data={tasks}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <TaskItem
          task={item}
          onAction={(action) => onAction(action, item.id)}
        />
      )}
    />
  );
}

function TaskItem({
  task,
  onAction,
}: {
  task: Task;
  onAction: (action: TaskItemAction) => void;
}) {
  return (
    <>
      <View style={styles.itemCard}>
        <View style={styles.itemContent}>
          <Pressable onPress={() => onAction("toggle")}>
            <SymbolView
              name={{
                ios: task.complete ? "checkmark.circle" : "circle",
                android: task.complete
                  ? "check_circle"
                  : "radio_button_unchecked",
                web: task.complete ? "check_circle" : "radio_button_unchecked",
              }}
              size={24}
              tintColor={task.complete ? "green" : "#94A3B8"}
              style={{ marginRight: 12 }}
            />
          </Pressable>
          <Text style={{ flex: 1 }}>{task.title}</Text>
          <Pressable onPress={() => onAction("delete")}>
            <SymbolView
              name={{ ios: "trash", android: "delete", web: "delete" }}
              size={22}
              tintColor="#E53935"
              accessibilityLabel="Xoá công việc"
            />
          </Pressable>
        </View>
      </View>
      <View style={{ height: 10 }} />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  empty: { textAlign: "center", paddingTop: 50, color: "#444444" },
  itemCard: {
    alignContent: "center",
    backgroundColor: "white",
    borderRadius: 10,
  },
  itemContent: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
});
