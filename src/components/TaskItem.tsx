import { Task } from "@/models/Task";
import { formatDateTime } from "@/utils/date";
import { SymbolView } from "expo-symbols";
import { WithTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type TaskItemAction = "toggle" | "delete" | "edit";

type TaskItemProps = {
  task: Task;
  onAction: (action: TaskItemAction) => void;
  t: WithTranslation<"tasks">["t"];
};

export default function TaskItem({ task, onAction, t }: TaskItemProps) {
  return (
    <>
      <View style={styles.card}>
        <View style={styles.mainContent}>
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
          <View style={styles.content}>
            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.time}>{formatDateTime(task.createAt)}</Text>
          </View>

          <Pressable
            accessibilityLabel={t(($) => $.actions.edit)}
            accessibilityRole="button"
            style={styles.editButton}
            onPress={() => onAction("edit")}
          >
            <SymbolView
              name={{ ios: "pencil", android: "edit", web: "edit" }}
              size={22}
              tintColor="#4F46E5"
            />
          </Pressable>
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

const styles = StyleSheet.create({
  card: {
    alignContent: "center",
    backgroundColor: "white",
    borderRadius: 10,
  },
  mainContent: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
  },
  editButton: {
    width: 44,
    height: 44,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontWeight: 500,
  },
  time: {
    fontSize: 12,
    color: "#666666",
  },
});
