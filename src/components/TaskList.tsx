import { FlashList } from "@shopify/flash-list";
import { withTranslation, WithTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";
import { Task } from "../models/Task";
import TaskItem, { TaskItemAction } from "./TaskItem";

type TaskListProps = {
  tasks: Task[];
  onAction: (action: TaskItemAction, id: string) => void;
} & WithTranslation<"tasks">;

function TaskList({ tasks, onAction, t }: TaskListProps) {
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
          onAction={onAction}
          t={t}
        />
      )}
    />
  );
}

export default withTranslation("tasks")(TaskList);

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  empty: { textAlign: "center", paddingTop: 50, color: "#444444" },
});
