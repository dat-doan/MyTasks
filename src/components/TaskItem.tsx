import { Task } from "@/models/Task";
import { formatDateTime } from "@/utils/date";
import { SymbolView } from "expo-symbols";
import { memo } from "react";
import { WithTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type TaskItemAction = "toggle" | "delete" | "edit";

type TaskItemProps = {
  task: Task;
  selected?: boolean;
  onAction: (action: TaskItemAction, id: string) => void;
  t: WithTranslation<"tasks">["t"];
};

function TaskItem({ task, selected = false, onAction, t }: TaskItemProps) {
  return (
    <>
      <View style={[styles.card, selected && styles.selectedCard]}>
        <View style={styles.mainContent}>
          <Pressable onPress={() => onAction("toggle", task.id)}>
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
            onPress={() => onAction("edit", task.id)}
          >
            <SymbolView
              name={{ ios: "pencil", android: "edit", web: "edit" }}
              size={22}
              tintColor="#4F46E5"
            />
          </Pressable>
          <Pressable onPress={() => onAction("delete", task.id)}>
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

export default memo(TaskItem);

const styles = StyleSheet.create({
  card: {
    alignContent: "center",
    backgroundColor: "white",
    borderRadius: 10,
  },
  selectedCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#6366F1",
    borderWidth: 1,
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
