import EditTaskModal from "@/components/EditTaskModal";
import TaskInput from "@/components/TaskInput";
import TaskList from "@/components/TaskList";
import TaskSummary from "@/components/TaskSummary";
import TaskTracking from "@/components/TaskTracking";
import { Task } from "@/models/Task";
import { orEmpty } from "@/utils/string";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function MyTasks({ t }: WithTranslation<"tasks">) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const editingTask = tasks.find((e) => e.id === editingTaskId);

  const completedCount = tasks.filter((e) => e.complete).length;
  const message = t(($) => $.completedCount, {
    count: completedCount,
  });
  const percent =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  function onDeleteConfirmation(id: string) {
    const title = t(($) => $.deleteConfirmation.title);
    const msg = t(($) => $.deleteConfirmation.message);
    Alert.alert(title, msg, [
      {
        text: t(($) => $.deleteConfirmation.cancel),
        style: "cancel",
      },
      {
        text: t(($) => $.deleteConfirmation.confirm),
        style: "destructive",
        onPress: () => {
          setTasks((prev) => prev.filter((e) => e.id !== id));
        },
      },
    ]);
  }

  function onEditTaskName(name: string) {
    setTasks((prev) => {
      return prev.map((e) =>
        e.id === editingTask?.id ? { ...e, title: name } : e,
      );
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <TaskSummary title={t(($) => $.title)} subtitle={message} />
      <TaskTracking percent={percent} />
      <TaskInput
        onAdd={(val) =>
          setTasks((v) => [
            ...v,
            {
              id: Crypto.randomUUID(),
              title: val,
              complete: false,
              createAt: new Date(),
            },
          ])
        }
      />
      <TaskList
        tasks={tasks}
        onAction={(action, id) => {
          switch (action) {
            case "delete":
              onDeleteConfirmation(id);
              break;
            case "toggle":
              setTasks((prev) =>
                prev.map((e) =>
                  e.id === id ? { ...e, complete: !e.complete } : e,
                ),
              );
              break;
            case "edit": {
              const task = tasks.find((item) => item.id === id);
              if (task) {
                setEditingTaskId(id);
              }
              break;
            }
          }
        }}
      />

      <EditTaskModal
        key={editingTask?.id}
        visible={editingTaskId !== null}
        title={orEmpty(editingTask?.title)}
        onSave={(updatedTitle) => {
          onEditTaskName(updatedTitle);
          setEditingTaskId(null);
        }}
        onClose={() => {
          setEditingTaskId(null);
        }}
      />
    </SafeAreaView>
  );
}

export default withTranslation("tasks")(MyTasks);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
    backgroundColor: "#F7F9FB",
  },
});
