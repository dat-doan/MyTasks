import { FlashList } from "@shopify/flash-list";
import { SymbolView } from "expo-symbols";
import { withTranslation, WithTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Task } from "../models/Task";

export type TaskItemAction = "toggle" | "delete";

type TaskListProps = {
  tasks: Task[];
  onAction: (action: TaskItemAction, id: string) => void;
} & WithTranslation<"tasks">;

type TaskItemProps = {
  task: Task;
  onAction: (action: TaskItemAction) => void;
  t: WithTranslation<"tasks">["t"];
};

export function TaskList({ tasks, onAction, t }: TaskListProps) {
  if (tasks.length === 0)
    return <Text style={styles.empty}>{t(($) => $.emptyState)}</Text>;
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
          t={t}
        />
      )}
    />
  );
}

function TaskItem({ task, onAction, t }: TaskItemProps) {
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
              accessibilityLabel={t(($) => $.actions.delete)}
            />
          </Pressable>
        </View>
      </View>
      <View style={{ height: 10 }} />
    </>
  );
}

export default withTranslation("tasks")(TaskList);

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
